import type { AppContext } from '../../context.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import { scheduleScope, shiftScope } from './scope.js'
import { SCHEDULE_INCLUDE, SHIFT_INCLUDE, countsFromGroups, emptyCounts, serializeSchedule, serializeShift } from './serializers.js'
import type { ScheduleRow, ShiftCounts, ShiftRow, ShiftView } from './serializers.js'
import { orgTimezone } from './timezones.js'

/** Shift counts per schedule in ONE grouped query, so lists never issue a query per row. */
export const scheduleCounts = async (ctx: AppContext, scheduleIds: string[]): Promise<Map<string, ShiftCounts>> => {
  const groups =
    scheduleIds.length === 0
      ? []
      : await ctx.prisma.shift.groupBy({ by: ['scheduleId', 'status'], where: { scheduleId: { in: scheduleIds } }, _count: { _all: true } })

  return new Map(
    scheduleIds.map(id => [
      id,
      countsFromGroups(groups.filter(group => group.scheduleId === id).map(group => ({ status: group.status, count: group._count._all })))
    ])
  )
}

export const presentSchedules = async (ctx: AppContext, actor: Actor, rows: ScheduleRow[], withSnapshot: boolean) => {
  const counts = await scheduleCounts(
    ctx,
    rows.map(row => row.id)
  )

  return rows.map(row => serializeSchedule(row, actor, counts.get(row.id) ?? emptyCounts(), { withSnapshot }))
}

/** A schedule as this actor may see it (404 when out of scope). Used for detail views and after mutations. */
export const presentSchedule = async (ctx: AppContext, actor: Actor, id: string) => {
  const row = await ctx.prisma.schedule.findFirst({ where: { AND: [{ id }, await scheduleScope(ctx, actor)] }, include: SCHEDULE_INCLUDE })

  if (!row) throw Errors.notFound('schedule')

  const [view] = await presentSchedules(ctx, actor, [row], true)

  if (!view) throw Errors.notFound('schedule')

  return view
}

/** Serialises shift rows with their assignee (one users query) and the org timezone (one query). */
export const presentShifts = async (ctx: AppContext, actor: Actor, rows: ShiftRow[]): Promise<ShiftView[]> => {
  const userIds = [...new Set(rows.flatMap(row => (row.assignedUserId ? [row.assignedUserId] : [])))]

  const [users, fallbackZone] = await Promise.all([
    userIds.length === 0 ? [] : ctx.prisma.user.findMany({ where: { id: { in: userIds }, orgId: actor.orgId }, select: { id: true, name: true } }),
    orgTimezone(ctx.prisma, actor.orgId)
  ])

  const byId = new Map(users.map(user => [user.id, user]))

  return rows.map(row =>
    serializeShift(row, actor, {
      assignee: row.assignedUserId ? (byId.get(row.assignedUserId) ?? null) : null,
      timezone: row.site.timezone ?? fallbackZone
    })
  )
}

export const presentShift = async (ctx: AppContext, actor: Actor, id: string): Promise<ShiftView> => {
  const row = await ctx.prisma.shift.findFirst({ where: { AND: [{ id }, await shiftScope(ctx, actor)] }, include: SHIFT_INCLUDE })

  if (!row) throw Errors.notFound('shift')

  const [view] = await presentShifts(ctx, actor, [row])

  if (!view) throw Errors.notFound('shift')

  return view
}
