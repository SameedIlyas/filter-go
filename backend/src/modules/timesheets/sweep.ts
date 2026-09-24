import type { AppContext } from '../../context.js'
import { minutesBetween } from '../../lib/time.js'
import { recordAudit } from '../audit/record.js'
import { notify } from '../notifications/notify.js'
import { lockEntry } from './entries.js'
import { addSystemException, syncExceptions } from './exceptions.js'
import { siteAlertRecipients } from './recipients.js'
import { computeActualMinutes } from './time-rules.js'

const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000
/** Rows handled per run and per kind; a backlog is worked off over the following runs. */
const BATCH = 200

export interface SweepResult {
  autoClosed: number
  noShows: number
  failed: number
}

/** Closes one OPEN entry at the scheduled end. Returns false when someone else got there first (idempotent). */
const autoCloseOne = async (ctx: AppContext, entryId: string, now: Date): Promise<boolean> =>
  ctx.prisma.$transaction(async tx => {
    await lockEntry(tx, entryId)

    const entry = await tx.timesheetEntry.findUniqueOrThrow({ where: { id: entryId }, include: { shift: { include: { site: { select: { name: true } } } } } })

    if (entry.status !== 'OPEN' || entry.clockInAt === null) return false

    const clockOutAt = new Date(Math.max(entry.shift.scheduledEnd.getTime(), entry.clockInAt.getTime()))
    const actualMinutes = computeActualMinutes(entry.clockInAt, clockOutAt, entry.breakMinutes)

    await tx.timesheetEntry.updateMany({ where: { id: entry.id, status: 'OPEN' }, data: { clockOutAt, actualMinutes, autoClosed: true, status: 'SUBMITTED' } })
    await tx.shift.updateMany({ where: { id: entry.shiftId, status: 'IN_PROGRESS' }, data: { status: 'COMPLETED' } })
    await addSystemException(tx, entry.id, 'MISSING_CLOCK_OUT', {
      scheduledEnd: entry.shift.scheduledEnd.toISOString(),
      hoursOverdue: Math.floor((now.getTime() - entry.shift.scheduledEnd.getTime()) / HOUR_MS)
    })
    await syncExceptions(ctx, tx, entry.id)
    await recordAudit(tx, null, {
      orgId: entry.orgId,
      entity: 'timesheet',
      entityId: entry.id,
      action: 'auto_closed',
      diff: { clockOutAt: clockOutAt.toISOString(), actualMinutes, reason: 'missing_clock_out' }
    })
    await notify(
      ctx,
      {
        orgId: entry.orgId,
        userIds: await siteAlertRecipients(tx, entry.orgId, entry.shift.siteId),
        type: 'timesheet.auto_closed',
        title: `Timesheet auto-closed at ${entry.shift.site.name}`,
        body: 'A worker never clocked out, so the timesheet was closed at the scheduled end. Please review it.',
        data: { timesheetId: entry.id, shiftId: entry.shiftId, siteId: entry.shift.siteId }
      },
      tx
    )

    return true
  })

/** Turns one un-started, overdue shift into a NO_SHOW with a zero, unbillable, unpayable entry. False when it was raced. */
const markNoShowOne = async (ctx: AppContext, shiftId: string, now: Date): Promise<boolean> =>
  ctx.prisma.$transaction(async tx => {
    const claimed = await tx.shift.updateMany({
      where: {
        id: shiftId,
        status: { in: ['ASSIGNED', 'CONFIRMED'] },
        assignedUserId: { not: null },
        schedule: { status: 'PUBLISHED' },
        timesheet: { is: null }
      },
      data: { status: 'NO_SHOW' }
    })

    if (claimed.count !== 1) return false

    const shift = await tx.shift.findUniqueOrThrow({ where: { id: shiftId }, include: { site: { select: { name: true } } } })

    if (!shift.assignedUserId) return false

    const entry = await tx.timesheetEntry.create({
      data: {
        orgId: shift.orgId,
        shiftId: shift.id,
        userId: shift.assignedUserId,
        scheduledMinutes: minutesBetween(shift.scheduledStart, shift.scheduledEnd),
        actualMinutes: 0,
        billable: false,
        payable: false,
        status: 'SUBMITTED'
      }
    })

    await addSystemException(tx, entry.id, 'NO_SHOW', {
      scheduledStart: shift.scheduledStart.toISOString(),
      minutesSinceStart: minutesBetween(shift.scheduledStart, now)
    })
    await recordAudit(tx, null, {
      orgId: shift.orgId,
      entity: 'timesheet',
      entityId: entry.id,
      action: 'no_show',
      diff: { shiftId: shift.id, userId: shift.assignedUserId, scheduledStart: shift.scheduledStart.toISOString() }
    })
    await notify(
      ctx,
      {
        orgId: shift.orgId,
        userIds: await siteAlertRecipients(tx, shift.orgId, shift.siteId),
        type: 'timesheet.no_show',
        title: `No-show at ${shift.site.name}`,
        body: `A worker did not clock in for the shift that started at ${shift.scheduledStart.toISOString()}.`,
        data: { timesheetId: entry.id, shiftId: shift.id, siteId: shift.siteId, userId: shift.assignedUserId },
        email: true
      },
      tx
    )

    return true
  })

/** Runs `handle` for each id; one failing row is logged and skipped, never fatal. */
const eachRow = async (ctx: AppContext, kind: string, ids: string[], handle: (id: string) => Promise<boolean>): Promise<{ done: number; failed: number }> => {
  let done = 0
  let failed = 0

  for (const id of ids) {
    try {
      if (await handle(id)) done += 1
    } catch (error) {
      failed += 1
      ctx.log.error({ err: error, id, kind }, 'timesheet sweep row failed')
    }
  }

  return { done, failed }
}

/**
 * The sweep (docs/ARCHITECTURE.md 6.5). Idempotent: every row is claimed by a conditional update, so running it
 * twice, or on two servers at once, acts on each row once.
 *  - missing clock-out: OPEN entries whose shift ended more than `missingClockOutHours` ago are closed at the scheduled end
 *  - no-show: assigned shifts of published schedules with no entry, `noShowMinutes` after their start
 */
export const sweepTimesheets = async (ctx: AppContext, now: Date = new Date()): Promise<SweepResult> => {
  const { missingClockOutHours, noShowMinutes } = ctx.config.work

  const overdueEntries = await ctx.prisma.timesheetEntry.findMany({
    where: { status: 'OPEN', shift: { scheduledEnd: { lt: new Date(now.getTime() - missingClockOutHours * HOUR_MS) } } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: BATCH
  })

  const closed = await eachRow(ctx, 'auto_close', overdueEntries.map(row => row.id), id => autoCloseOne(ctx, id, now))

  const overdueShifts = await ctx.prisma.shift.findMany({
    where: {
      status: { in: ['ASSIGNED', 'CONFIRMED'] },
      assignedUserId: { not: null },
      scheduledStart: { lt: new Date(now.getTime() - noShowMinutes * MINUTE_MS) },
      schedule: { status: 'PUBLISHED' },
      timesheet: { is: null }
    },
    select: { id: true },
    orderBy: { scheduledStart: 'asc' },
    take: BATCH
  })

  const noShows = await eachRow(ctx, 'no_show', overdueShifts.map(row => row.id), id => markNoShowOne(ctx, id, now))

  return { autoClosed: closed.done, noShows: noShows.done, failed: closed.failed + noShows.failed }
}
