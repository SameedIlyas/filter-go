import type { AppContext } from '../../context.js'
import type { Prisma } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { BOARD_ROW_LIMIT, MAX_SHIFT_HOURS } from './constants.js'
import type { BoardQuery } from './schemas.js'
import { shiftScope } from './scope.js'
import { countsFromGroups } from './serializers.js'
import type { ShiftCounts } from './serializers.js'
import { orgTimezone } from './timezones.js'

/**
 * The board reads many shifts at once, so it selects only what a card shows: no offers, timesheets, snapshots or
 * money. Rows, status counts and the extra count run in parallel over the same `where`; the counts never load rows.
 */
const BOARD_SELECT = {
  id: true,
  scheduleId: true,
  siteId: true,
  assignedUserId: true,
  scheduledStart: true,
  scheduledEnd: true,
  status: true,
  isExtra: true,
  notes: true,
  site: { select: { id: true, name: true, timezone: true } },
  schedule: { select: { status: true } }
} satisfies Prisma.ShiftSelect

type BoardRow = Prisma.ShiftGetPayload<{ select: typeof BOARD_SELECT }>

export interface BoardResult {
  window: { from: Date; to: Date }
  shifts: ReturnType<typeof serializeBoardShift>[]
  counts: ShiftCounts & { extra: number }
  truncated: boolean
}

/**
 * Overlap, not containment: a shift crossing midnight at either edge of the window still belongs on it. No shift
 * is longer than MAX_SHIFT_HOURS, so the start also gets a lower bound; that keeps the (orgId|siteId, scheduledStart)
 * index range tight instead of scanning every past shift.
 */
const boardFilter = (query: BoardQuery): Prisma.ShiftWhereInput => ({
  scheduledStart: { gt: new Date(query.from.getTime() - MAX_SHIFT_HOURS * 3_600_000), lt: query.to },
  scheduledEnd: { gt: query.from },
  ...(query.siteIds ? { siteId: { in: query.siteIds } } : {}),
  ...(query.statuses ? { status: { in: query.statuses } } : {}),
  ...(query.scheduleId ? { scheduleId: query.scheduleId } : {}),
  ...(query.includeDraft ? {} : { schedule: { status: { not: 'DRAFT' } } }),
  // Both filter on the assignee, so they are ANDed rather than one overwriting the other
  AND: [
    ...(query.userIds ? [{ assignedUserId: { in: query.userIds } }] : []),
    ...(query.unassigned === undefined ? [] : [query.unassigned ? { assignedUserId: null } : { assignedUserId: { not: null } }])
  ]
})

const serializeBoardShift = (row: BoardRow, assignee: { id: string; name: string } | null, timezone: string) => ({
  id: row.id,
  scheduleId: row.scheduleId,
  scheduleStatus: row.schedule.status,
  siteId: row.siteId,
  site: { id: row.site.id, name: row.site.name, timezone },
  scheduledStart: row.scheduledStart,
  scheduledEnd: row.scheduledEnd,
  status: row.status,
  assignedUser: assignee,
  isExtra: row.isExtra,
  hasNotes: Boolean(row.notes?.trim())
})

export const boardShifts = async (ctx: AppContext, actor: Actor, query: BoardQuery, limit = BOARD_ROW_LIMIT): Promise<BoardResult> => {
  const where: Prisma.ShiftWhereInput = { AND: [await shiftScope(ctx, actor), boardFilter(query)] }

  const [rows, groups, extra, fallbackZone] = await Promise.all([
    ctx.prisma.shift.findMany({ where, select: BOARD_SELECT, orderBy: [{ scheduledStart: 'asc' }, { id: 'asc' }], take: limit + 1 }),
    ctx.prisma.shift.groupBy({ by: ['status'], where, _count: { _all: true } }),
    ctx.prisma.shift.count({ where: { AND: [where, { isExtra: true }] } }),
    orgTimezone(ctx.prisma, actor.orgId)
  ])

  const page = rows.slice(0, limit)
  const userIds = [...new Set(page.flatMap(row => (row.assignedUserId ? [row.assignedUserId] : [])))]
  const users = userIds.length === 0 ? [] : await ctx.prisma.user.findMany({ where: { id: { in: userIds }, orgId: actor.orgId }, select: { id: true, name: true } })
  const byId = new Map(users.map(user => [user.id, user]))

  return {
    window: { from: query.from, to: query.to },
    shifts: page.map(row => serializeBoardShift(row, row.assignedUserId ? (byId.get(row.assignedUserId) ?? null) : null, row.site.timezone ?? fallbackZone)),
    counts: { ...countsFromGroups(groups.map(group => ({ status: group.status, count: group._count._all }))), extra },
    truncated: rows.length > limit
  }
}
