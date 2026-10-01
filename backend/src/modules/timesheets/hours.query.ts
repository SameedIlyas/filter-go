import type { AppContext } from '../../context.js'
import type { Prisma, TimesheetStatus } from '../../generated/prisma/client.js'
import { assertSiteAccess, siteIdFilter } from '../../lib/access.js'
import type { Actor } from '../../lib/access.js'
import { addDays, eachDay, isoWeekday, localDate, minutesBetween, zonedInstant } from '../../lib/time.js'
import { orgTimezone } from '../scheduling/timezones.js'
import { loadUserNames } from './entries.js'
import type { HoursQuery } from './schemas.js'
import { CLIENT_VISIBLE } from './state.js'

/** Widest UTC offset either way; a site-local day can start this far from 00:00 UTC. */
const ZONE_SLACK_MS = 14 * 3_600_000

export interface HoursTally {
  scheduledMinutes: number
  workedMinutes: number
  approvedMinutes: number
}

interface WorkerAccumulator {
  days: Map<string, HoursTally>
  entryCount: number
  openExceptionCount: number
}

const emptyTally = (): HoursTally => ({ scheduledMinutes: 0, workedMinutes: 0, approvedMinutes: 0 })

const mondayOf = (date: string): string => addDays(date, 1 - isoWeekday(date))

/** APPROVED and INVOICED entries are the approved hours (the same set a client may see). */
const isApproved = (status: TimesheetStatus): boolean => CLIENT_VISIBLE.includes(status)

const tallyOf = (worker: WorkerAccumulator, date: string): HoursTally => {
  const existing = worker.days.get(date)

  if (existing) return existing

  const created = emptyTally()

  worker.days.set(date, created)

  return created
}

const sumTallies = (tallies: Iterable<HoursTally>): HoursTally => {
  const total = emptyTally()

  for (const tally of tallies) {
    total.scheduledMinutes += tally.scheduledMinutes
    total.workedMinutes += tally.workedMinutes
    total.approvedMinutes += tally.approvedMinutes
  }

  return total
}

/** Weekly overtime: every Monday-start week touching the window counts whole, as the OVERTIME exception does. */
const overtimeOf = (weeks: Map<string, number> | undefined, limit: number): number =>
  [...(weeks?.values() ?? [])].reduce((sum, minutes) => sum + Math.max(0, minutes - limit), 0)

/** The UTC range of the whole Monday-start weeks around the window, widened by the largest zone offset. */
const weeksRange = (query: HoursQuery) => ({
  gte: new Date(zonedInstant(mondayOf(query.from), '00:00', 'UTC').getTime() - ZONE_SLACK_MS),
  lt: new Date(zonedInstant(addDays(mondayOf(query.to), 7), '00:00', 'UTC').getTime() + ZONE_SLACK_MS)
})

/**
 * Worked minutes per worker and Monday week, computed like the OVERTIME exception (`weeklyMinutesFor`): over ALL of
 * the worker's sites, by the clock-in in the site zone. Only these totals leave the query, never the other sites' rows,
 * so a supervisor sees the same overtime the exception queue shows without seeing work outside their sites.
 */
const loadWeeklyMinutes = async (ctx: AppContext, orgId: string, userIds: string[], query: HoursQuery, fallbackZone: string) => {
  const weeks = new Map<string, Map<string, number>>()

  if (userIds.length === 0) return weeks

  const entries = await ctx.prisma.timesheetEntry.findMany({
    where: { orgId, userId: { in: userIds }, status: { not: 'REJECTED' }, shift: { scheduledStart: weeksRange(query) } },
    select: { userId: true, actualMinutes: true, clockInAt: true, shift: { select: { scheduledStart: true, site: { select: { timezone: true } } } } }
  })

  for (const entry of entries) {
    const week = mondayOf(localDate(entry.clockInAt ?? entry.shift.scheduledStart, entry.shift.site.timezone ?? fallbackZone))
    const perWeek = weeks.get(entry.userId) ?? new Map<string, number>()

    perWeek.set(week, (perWeek.get(week) ?? 0) + (entry.actualMinutes ?? 0))
    weeks.set(entry.userId, perWeek)
  }

  return weeks
}

/**
 * The shifts and entries behind the grid. Days are site-local (`site.timezone ?? org timezone`), so the UTC range is
 * widened by the largest offset (the whole weeks around the window are loaded) and rows outside the calendar window
 * are dropped while bucketing.
 */
const loadRows = async (ctx: AppContext, actor: Actor, query: HoursQuery) => {
  const scheduledStart = weeksRange(query)

  const siteId = query.siteId ?? (await siteIdFilter(ctx, actor))
  const shiftWhere: Prisma.ShiftWhereInput = { orgId: actor.orgId, scheduledStart, ...(siteId ? { siteId } : {}) }

  const [shifts, entries, fallbackZone] = await Promise.all([
    ctx.prisma.shift.findMany({
      where: {
        ...shiftWhere,
        assignedUserId: query.userId ?? { not: null },
        status: { not: 'CANCELLED' },
        schedule: { status: { not: 'DRAFT' } }
      },
      select: { assignedUserId: true, scheduledStart: true, scheduledEnd: true, site: { select: { timezone: true } } }
    }),
    ctx.prisma.timesheetEntry.findMany({
      where: { orgId: actor.orgId, status: { not: 'REJECTED' }, ...(query.userId ? { userId: query.userId } : {}), shift: shiftWhere },
      select: {
        userId: true,
        status: true,
        actualMinutes: true,
        shift: { select: { scheduledStart: true, site: { select: { timezone: true } } } },
        exceptions: { where: { resolved: false }, select: { id: true } }
      }
    }),
    orgTimezone(ctx.prisma, actor.orgId)
  ])

  return { shifts, entries, fallbackZone }
}

type LoadedRows = Awaited<ReturnType<typeof loadRows>>

/** Buckets the rows per worker into site-local day tallies (only the days inside the window). */
const bucketRows = ({ shifts, entries, fallbackZone }: LoadedRows, query: HoursQuery): Map<string, WorkerAccumulator> => {
  const inWindow = (date: string) => date >= query.from && date <= query.to
  const workers = new Map<string, WorkerAccumulator>()

  const workerOf = (userId: string): WorkerAccumulator => {
    const existing = workers.get(userId)

    if (existing) return existing

    const created: WorkerAccumulator = { days: new Map(), entryCount: 0, openExceptionCount: 0 }

    workers.set(userId, created)

    return created
  }

  for (const shift of shifts) {
    const date = localDate(shift.scheduledStart, shift.site.timezone ?? fallbackZone)

    if (shift.assignedUserId && inWindow(date)) {
      tallyOf(workerOf(shift.assignedUserId), date).scheduledMinutes += minutesBetween(shift.scheduledStart, shift.scheduledEnd)
    }
  }

  for (const entry of entries) {
    const date = localDate(entry.shift.scheduledStart, entry.shift.site.timezone ?? fallbackZone)
    const minutes = entry.actualMinutes ?? 0

    if (!inWindow(date)) continue

    const worker = workerOf(entry.userId)
    const tally = tallyOf(worker, date)

    tally.workedMinutes += minutes

    if (isApproved(entry.status)) tally.approvedMinutes += minutes

    worker.entryCount += 1
    worker.openExceptionCount += entry.exceptions.length
  }

  return workers
}

/**
 * GET /timesheets/hours: worked, approved and scheduled minutes per worker and site-local day, for the review grid.
 * Rejected entries are left out (they are waiting on the worker); cancelled shifts and draft schedules too.
 */
export const workedHours = async (ctx: AppContext, actor: Actor, query: HoursQuery) => {
  if (query.siteId) await assertSiteAccess(ctx, actor, query.siteId)

  const loaded = await loadRows(ctx, actor, query)
  const workers = bucketRows(loaded, query)
  const limit = ctx.config.work.weeklyOvertimeMinutes
  const userIds = [...workers.keys()]
  const [names, weeks] = await Promise.all([
    loadUserNames(ctx.prisma, actor.orgId, userIds),
    loadWeeklyMinutes(ctx, actor.orgId, userIds, query, loaded.fallbackZone)
  ])

  const rows = [...workers.entries()]
    .map(([userId, worker]) => ({
      user: names.get(userId) ?? { id: userId, name: 'Unknown user' },
      days: Object.fromEntries(worker.days),
      ...sumTallies(worker.days.values()),
      overtimeMinutes: overtimeOf(weeks.get(userId), limit),
      entryCount: worker.entryCount,
      openExceptionCount: worker.openExceptionCount
    }))
    .sort((a, b) => a.user.name.localeCompare(b.user.name) || a.user.id.localeCompare(b.user.id))

  const days = eachDay(query.from, query.to)

  return {
    from: query.from,
    to: query.to,
    days,
    weeklyOvertimeMinutes: limit,
    workers: rows,
    totals: {
      days: Object.fromEntries(days.map(date => [date, sumTallies(rows.flatMap(row => (row.days[date] ? [row.days[date]] : [])))])),
      ...sumTallies(rows.map(row => ({ scheduledMinutes: row.scheduledMinutes, workedMinutes: row.workedMinutes, approvedMinutes: row.approvedMinutes }))),
      overtimeMinutes: rows.reduce((sum, row) => sum + row.overtimeMinutes, 0)
    }
  }
}
