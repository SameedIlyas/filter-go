import type { AppContext } from '../../context.js'
import { assertSiteAccess, siteIdFilter } from '../../lib/access.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import { addDays, daysBetween, localDate, toDateOnly } from '../../lib/time.js'
import type { CoverageQuery } from './schemas.js'
import { orgTimezone } from './timezones.js'

const MAX_RANGE_DAYS = 62
const DEFAULT_RANGE_DAYS = 7

interface Tally {
  total: number
  filled: number
  open: number
}

const emptyTally = (): Tally => ({ total: 0, filled: 0, open: 0 })

const bump = (tally: Tally, isOpen: boolean): Tally => ({ total: tally.total + 1, filled: tally.filled + (isOpen ? 0 : 1), open: tally.open + (isOpen ? 1 : 0) })

const resolveRange = (query: CoverageQuery, today: string): { from: string; to: string } => {
  const from = query.from ?? today
  const to = query.to ?? addDays(from, DEFAULT_RANGE_DAYS - 1)

  if (to < from) throw Errors.invalidField('to', 'invalid_range', '"to" must be on or after "from".')

  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) {
    throw Errors.invalidField('to', 'too_long', `Ask for at most ${MAX_RANGE_DAYS} days at a time.`)
  }

  return { from, to }
}

/**
 * The supervisor's morning number (docs/ARCHITECTURE.md 5.2): for PUBLISHED schedules only, per site and per LOCAL day
 * (each site's own timezone), how many shifts there are, how many have someone on them and how many are still open;
 * plus the soonest OPEN shifts that have not finished yet. Cancelled shifts are not counted.
 */
export const coverage = async (ctx: AppContext, actor: Actor, query: CoverageQuery) => {
  if (query.siteId) await assertSiteAccess(ctx, actor, query.siteId)

  const fallbackZone = await orgTimezone(ctx.prisma, actor.orgId)
  const { from, to } = resolveRange(query, localDate(new Date(), fallbackZone))
  const scope = await siteIdFilter(ctx, actor)

  const rows = await ctx.prisma.shift.findMany({
    where: {
      orgId: actor.orgId,
      status: { not: 'CANCELLED' },
      schedule: { status: 'PUBLISHED' },
      ...(query.siteId ? { siteId: query.siteId } : scope ? { siteId: scope } : {}),
      // a day either side of the range covers every timezone offset; the exact local-day filter follows
      scheduledStart: { gte: toDateOnly(addDays(from, -1)), lt: toDateOnly(addDays(to, 2)) }
    },
    select: { id: true, scheduleId: true, siteId: true, scheduledStart: true, scheduledEnd: true, status: true, notes: true, site: { select: { name: true, timezone: true } } },
    orderBy: [{ scheduledStart: 'asc' }, { id: 'asc' }]
  })

  const inRange = rows
    .map(row => ({ row, date: localDate(row.scheduledStart, row.site.timezone ?? fallbackZone) }))
    .filter(({ date }) => date >= from && date <= to)

  const byDay = new Map<string, { date: string; siteId: string; siteName: string; tally: Tally }>()
  const bySite = new Map<string, { siteId: string; siteName: string; tally: Tally }>()
  let totals = emptyTally()

  for (const { row, date } of inRange) {
    const isOpen = row.status === 'OPEN'
    const dayKey = `${date}|${row.siteId}`
    const day = byDay.get(dayKey) ?? { date, siteId: row.siteId, siteName: row.site.name, tally: emptyTally() }
    const site = bySite.get(row.siteId) ?? { siteId: row.siteId, siteName: row.site.name, tally: emptyTally() }

    byDay.set(dayKey, { ...day, tally: bump(day.tally, isOpen) })
    bySite.set(row.siteId, { ...site, tally: bump(site.tally, isOpen) })
    totals = bump(totals, isOpen)
  }

  const now = new Date()

  return {
    from,
    to,
    totals,
    sites: [...bySite.values()].sort((a, b) => a.siteName.localeCompare(b.siteName)).map(({ tally, ...site }) => ({ ...site, ...tally })),
    days: [...byDay.values()]
      .sort((a, b) => a.date.localeCompare(b.date) || a.siteName.localeCompare(b.siteName))
      .map(({ tally, ...day }) => ({ ...day, ...tally })),
    unfilled: inRange
      .filter(({ row }) => row.status === 'OPEN' && row.scheduledEnd > now)
      .slice(0, query.unfilledLimit)
      .map(({ row }) => ({
        id: row.id,
        scheduleId: row.scheduleId,
        siteId: row.siteId,
        siteName: row.site.name,
        scheduledStart: row.scheduledStart,
        scheduledEnd: row.scheduledEnd,
        notes: row.notes
      }))
  }
}
