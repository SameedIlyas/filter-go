import type { AppContext } from '../../context.js'
import type { Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../lib/prisma.js'
import { startOfWeek } from '../../lib/time.js'
import { detectExceptions, isManaged } from './exception-rules.js'
import type { DetectedException } from './exception-rules.js'
import { pointOf } from './geo.js'

const WEEK_PLUS_HALF_DAY_MS = 7.5 * 24 * 60 * 60 * 1000

/**
 * The worker's total of `actualMinutes` for the Monday-start week (in the SITE's timezone) that contains
 * `clockInAt`, over their non-rejected entries. The next Monday is found by stepping 7.5 days from this Monday,
 * so a DST change inside the week can't skip or repeat a day.
 */
export const weeklyMinutesFor = async (
  db: Db,
  entry: { orgId: string; userId: string },
  clockInAt: Date,
  zone: string
): Promise<number> => {
  const weekStart = startOfWeek(clockInAt, zone)
  const nextWeekStart = startOfWeek(new Date(weekStart.getTime() + WEEK_PLUS_HALF_DAY_MS), zone)

  const total = await db.timesheetEntry.aggregate({
    where: {
      orgId: entry.orgId,
      userId: entry.userId,
      status: { not: 'REJECTED' },
      clockInAt: { gte: weekStart, lt: nextWeekStart }
    },
    _sum: { actualMinutes: true }
  })

  return total._sum.actualMinutes ?? 0
}

const detectFor = async (ctx: AppContext, db: Db, entryId: string): Promise<DetectedException[]> => {
  const entry = await db.timesheetEntry.findUniqueOrThrow({ where: { id: entryId }, include: { shift: { include: { site: true } } } })
  const org = await db.organization.findUniqueOrThrow({ where: { id: entry.orgId }, select: { timezone: true } })
  const zone = entry.shift.site.timezone ?? org.timezone
  const weeklyMinutes = entry.clockInAt ? await weeklyMinutesFor(db, entry, entry.clockInAt, zone) : 0

  return detectExceptions(
    {
      scheduledStart: entry.shift.scheduledStart,
      scheduledEnd: entry.shift.scheduledEnd,
      scheduledMinutes: entry.scheduledMinutes,
      clockInAt: entry.clockInAt,
      clockOutAt: entry.clockOutAt,
      actualMinutes: entry.actualMinutes,
      autoClosed: entry.autoClosed,
      clockInPoint: pointOf(entry.clockInLat, entry.clockInLng),
      clockOutPoint: pointOf(entry.clockOutLat, entry.clockOutLng),
      sitePoint: pointOf(entry.shift.site.lat, entry.shift.site.lng),
      weeklyMinutes
    },
    ctx.config.work
  )
}

/**
 * Brings the entry's computed exceptions in line with its current numbers. Call inside the transaction that changed
 * the entry, AFTER its new values are written. One row per (entry, type):
 *  - new cause -> created (a concurrent creator can't duplicate it: unique key + skipDuplicates)
 *  - cause still present, row unresolved -> detail refreshed
 *  - cause present, row resolved -> left alone (a supervisor already dealt with it)
 *  - cause gone, row unresolved -> deleted; resolved rows stay as history
 * MISSING_CLOCK_OUT and NO_SHOW are never touched here.
 */
export const syncExceptions = async (ctx: AppContext, db: Db, entryId: string): Promise<DetectedException[]> => {
  const detected = await detectFor(ctx, db, entryId)
  const existing = await db.timesheetException.findMany({ where: { timesheetEntryId: entryId }, select: { id: true, type: true, resolved: true } })
  const wanted = new Map(detected.map(item => [item.type, item]))
  const known = new Set(existing.map(row => row.type))

  const created = detected.filter(item => !known.has(item.type))

  if (created.length > 0) {
    await db.timesheetException.createMany({
      data: created.map(item => ({ timesheetEntryId: entryId, type: item.type, detail: item.detail })),
      skipDuplicates: true
    })
  }

  for (const row of existing) {
    const current = isManaged(row.type) ? wanted.get(row.type) : undefined

    if (current && !row.resolved) {
      await db.timesheetException.updateMany({ where: { id: row.id, resolved: false }, data: { detail: current.detail } })
    }
  }

  const stale = existing.filter(row => !row.resolved && isManaged(row.type) && !wanted.has(row.type))

  if (stale.length > 0) {
    await db.timesheetException.deleteMany({ where: { id: { in: stale.map(row => row.id) }, resolved: false } })
  }

  return detected
}

/** Inserts a sweep-owned exception (MISSING_CLOCK_OUT / NO_SHOW); a second run is a no-op. */
export const addSystemException = async (
  db: Db,
  entryId: string,
  type: 'MISSING_CLOCK_OUT' | 'NO_SHOW',
  detail: Prisma.InputJsonObject
): Promise<void> => {
  await db.timesheetException.createMany({ data: [{ timesheetEntryId: entryId, type, detail }], skipDuplicates: true })
}
