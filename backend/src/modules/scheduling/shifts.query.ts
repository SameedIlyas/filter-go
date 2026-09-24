import type { AppContext } from '../../context.js'
import type { Prisma } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { pageArgs, pageMeta } from '../../lib/pagination.js'
import type { PageQuery } from '../../lib/pagination.js'
import { presentShifts } from './presenters.js'
import type { ShiftListQuery } from './schemas.js'
import { shiftScope } from './scope.js'
import { SHIFT_INCLUDE } from './serializers.js'

type RangeQuery = Pick<ShiftListQuery, 'status' | 'from' | 'to'>

const rangeFilter = (query: RangeQuery): Prisma.ShiftWhereInput => ({
  ...(query.status ? { status: query.status } : {}),
  ...(query.from || query.to ? { scheduledStart: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lt: query.to } : {}) } } : {})
})

const listFilter = (query: ShiftListQuery): Prisma.ShiftWhereInput => ({
  ...rangeFilter(query),
  ...(query.scheduleId ? { scheduleId: query.scheduleId } : {}),
  ...(query.siteId ? { siteId: query.siteId } : {}),
  ...(query.userId ? { assignedUserId: query.userId } : {}),
  ...(query.isExtra === undefined ? {} : { isExtra: query.isExtra }),
  ...(query.unassigned === undefined ? {} : query.unassigned ? { assignedUserId: null } : { assignedUserId: { not: null } })
})

/** Scope + filters + one joined query + one users lookup: no per-row queries. */
const queryShifts = async (ctx: AppContext, actor: Actor, filter: Prisma.ShiftWhereInput, page: PageQuery) => {
  const where: Prisma.ShiftWhereInput = { AND: [await shiftScope(ctx, actor), filter] }

  const [rows, total] = await Promise.all([
    ctx.prisma.shift.findMany({ where, include: SHIFT_INCLUDE, orderBy: [{ scheduledStart: 'asc' }, { id: 'asc' }], ...pageArgs(page) }),
    ctx.prisma.shift.count({ where })
  ])

  return { items: await presentShifts(ctx, actor, rows), meta: pageMeta(page, total) }
}

export const listShifts = (ctx: AppContext, actor: Actor, query: ShiftListQuery) => queryShifts(ctx, actor, listFilter(query), query)

/** A field user's own shifts. The scope already limits them to their assignments on published schedules. */
export const listMyShifts = (ctx: AppContext, actor: Actor, query: RangeQuery & PageQuery) => queryShifts(ctx, actor, rangeFilter(query), query)
