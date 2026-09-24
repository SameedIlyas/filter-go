import type { AppContext, ClientMeta } from '../../context.js'
import type { Shift, ShiftStatus } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { AppError, Errors } from '../../lib/errors.js'
import { minutesBetween } from '../../lib/time.js'
import { recordAudit } from '../audit/record.js'
import { entryInclude, lockScopedEntry } from './entries.js'
import type { EntryRow } from './entries.js'
import { syncExceptions } from './exceptions.js'
import type { ClockInBody, ClockOutBody } from './schemas.js'
import { computeActualMinutes } from './time-rules.js'

const MINUTE_MS = 60_000

const clockState = (message: string, context?: Record<string, unknown>) =>
  new AppError(409, 'CLOCK_STATE', message, { details: context ? { context } : undefined })

/** Shift statuses that mean "someone already clocked in (or the system closed it)". */
const ALREADY_STARTED: ShiftStatus[] = ['IN_PROGRESS', 'COMPLETED', 'NO_SHOW']

const assertCanClockIn = (shift: Pick<Shift, 'status' | 'scheduledStart' | 'scheduledEnd'>, scheduleStatus: string, now: Date, earlyMinutes: number): void => {
  if (ALREADY_STARTED.includes(shift.status)) {
    throw clockState('This shift has already been started.', { shiftStatus: shift.status })
  }

  if (shift.status !== 'ASSIGNED' && shift.status !== 'CONFIRMED') {
    throw Errors.invalidState('shift', shift.status, 'IN_PROGRESS', ['ASSIGNED', 'CONFIRMED'])
  }

  if (scheduleStatus !== 'PUBLISHED') {
    throw new AppError(409, 'SCHEDULE_LOCKED', 'This schedule is locked, so the shift can no longer be started.')
  }

  const opensAt = shift.scheduledStart.getTime() - earlyMinutes * MINUTE_MS

  if (now.getTime() < opensAt || now.getTime() > shift.scheduledEnd.getTime()) {
    throw new AppError(409, 'CLOCK_WINDOW', 'You can only clock in from shortly before the shift starts until it ends.', {
      details: { context: { opensAt: new Date(opensAt).toISOString(), closesAt: shift.scheduledEnd.toISOString() } }
    })
  }
}

/**
 * Clock in: creates the shift's single entry (status OPEN) with the SERVER time and moves the shift to IN_PROGRESS.
 * Safe to double-submit: the conditional shift update lets exactly one of two simultaneous calls through.
 */
export const clockIn = async (
  ctx: AppContext,
  actor: Actor,
  shiftId: string,
  input: ClockInBody,
  meta?: ClientMeta,
  now: Date = new Date()
): Promise<EntryRow> =>
  ctx.prisma.$transaction(async tx => {
    const shift = await tx.shift.findFirst({
      where: { id: shiftId, orgId: actor.orgId, assignedUserId: actor.id },
      include: { schedule: { select: { status: true } } }
    })

    // Before publish nothing is visible to field users, so a draft schedule's shift does not exist for them
    if (!shift || shift.schedule.status === 'DRAFT') throw Errors.notFound('shift')

    assertCanClockIn(shift, shift.schedule.status, now, ctx.config.work.clockInEarlyMinutes)

    const claimed = await tx.shift.updateMany({ where: { id: shift.id, status: { in: ['ASSIGNED', 'CONFIRMED'] } }, data: { status: 'IN_PROGRESS' } })

    if (claimed.count !== 1) throw clockState('This shift has already been started.')

    const entry = await tx.timesheetEntry.create({
      data: {
        orgId: actor.orgId,
        shiftId: shift.id,
        userId: actor.id,
        clockInAt: now,
        clockInLat: input.lat ?? null,
        clockInLng: input.lng ?? null,
        scheduledMinutes: minutesBetween(shift.scheduledStart, shift.scheduledEnd),
        status: 'OPEN'
      }
    })

    const exceptions = await syncExceptions(ctx, tx, entry.id)

    await recordAudit(tx, actor, {
      entity: 'timesheet',
      entityId: entry.id,
      action: 'clocked_in',
      diff: { shiftId: shift.id, clockInAt: now.toISOString(), hasGps: input.lat !== undefined, exceptions: exceptions.map(item => item.type) },
      meta
    })

    return tx.timesheetEntry.findUniqueOrThrow({ where: { id: entry.id }, include: entryInclude })
  })

/**
 * Clock out: the entry must be OPEN. Computes minutes, recomputes exceptions, OPEN -> SUBMITTED and the shift
 * IN_PROGRESS -> COMPLETED in one transaction. Two simultaneous clock-outs: the row lock lets one finish, the other
 * then sees a non-open entry and gets CLOCK_STATE.
 */
export const clockOut = async (
  ctx: AppContext,
  actor: Actor,
  entryId: string,
  input: ClockOutBody,
  meta?: ClientMeta,
  now: Date = new Date()
): Promise<EntryRow> =>
  ctx.prisma.$transaction(async tx => {
    const entry = await lockScopedEntry(tx, { orgId: actor.orgId, userId: actor.id }, entryId)

    if (entry.status !== 'OPEN' || entry.clockInAt === null) {
      throw clockState('This timesheet is not open, so there is nothing to clock out of.', { status: entry.status })
    }

    if (now.getTime() <= entry.clockInAt.getTime()) {
      throw Errors.unprocessable('Clock-out must be after clock-in.')
    }

    const breakMinutes = input.breakMinutes ?? 0
    const actualMinutes = computeActualMinutes(entry.clockInAt, now, breakMinutes)

    const updated = await tx.timesheetEntry.updateMany({
      where: { id: entry.id, status: 'OPEN' },
      data: {
        clockOutAt: now,
        clockOutLat: input.lat ?? null,
        clockOutLng: input.lng ?? null,
        breakMinutes,
        actualMinutes,
        status: 'SUBMITTED'
      }
    })

    if (updated.count !== 1) throw clockState('This timesheet was already clocked out.')

    const shift = await tx.shift.updateMany({ where: { id: entry.shiftId, status: 'IN_PROGRESS' }, data: { status: 'COMPLETED' } })

    if (shift.count !== 1) throw Errors.conflict('The shift is no longer in progress (it may have been changed by a supervisor).')

    const exceptions = await syncExceptions(ctx, tx, entry.id)

    await recordAudit(tx, actor, {
      entity: 'timesheet',
      entityId: entry.id,
      action: 'clocked_out',
      diff: { clockOutAt: now.toISOString(), breakMinutes, actualMinutes, hasGps: input.lat !== undefined, exceptions: exceptions.map(item => item.type) },
      meta
    })

    return tx.timesheetEntry.findUniqueOrThrow({ where: { id: entry.id }, include: entryInclude })
  })
