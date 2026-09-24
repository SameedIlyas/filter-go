import type { AppContext } from '../../context.js'
import type { Prisma } from '../../generated/prisma/client.js'
import { accessibleSiteIds } from '../../lib/access.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import { OUTSIDER_VISIBLE_STATUSES } from './constants.js'

/**
 * Who may see which schedules and shifts. Everything that reads or mutates by id goes through these filters, and
 * a row outside them is indistinguishable from a missing one (404).
 *
 *   ADMIN        everything in the organization
 *   SUPERVISOR   schedules/shifts at the sites they manage, any status
 *   CLIENT_USER  PUBLISHED+ schedules/shifts at their client's sites
 *   FIELD_USER   PUBLISHED+ schedules at sites they may work at (or where they hold a shift); only their own shifts
 */
export const scheduleScope = async (ctx: AppContext, actor: Actor): Promise<Prisma.ScheduleWhereInput> => {
  const sites = await accessibleSiteIds(ctx, actor)

  if (actor.role === 'ADMIN') return { orgId: actor.orgId }

  const siteIds = sites === 'all' ? [] : sites

  if (actor.role === 'SUPERVISOR') return { orgId: actor.orgId, siteId: { in: siteIds } }

  if (actor.role === 'CLIENT_USER') {
    return { orgId: actor.orgId, siteId: { in: siteIds }, status: { in: OUTSIDER_VISIBLE_STATUSES } }
  }

  return {
    orgId: actor.orgId,
    status: { in: OUTSIDER_VISIBLE_STATUSES },
    OR: [{ siteId: { in: siteIds } }, { shifts: { some: { assignedUserId: actor.id } } }]
  }
}

export const shiftScope = async (ctx: AppContext, actor: Actor): Promise<Prisma.ShiftWhereInput> => {
  if (actor.role === 'ADMIN') return { orgId: actor.orgId }

  if (actor.role === 'FIELD_USER') {
    return { orgId: actor.orgId, assignedUserId: actor.id, schedule: { status: { in: OUTSIDER_VISIBLE_STATUSES } } }
  }

  const sites = await accessibleSiteIds(ctx, actor)
  const siteIds = sites === 'all' ? [] : sites

  if (actor.role === 'SUPERVISOR') return { orgId: actor.orgId, siteId: { in: siteIds } }

  return { orgId: actor.orgId, siteId: { in: siteIds }, schedule: { status: { in: OUTSIDER_VISIBLE_STATUSES } } }
}

/** 404 unless the schedule exists and the actor may see it. Returns the id-only row; callers re-read what they need. */
export const assertScheduleVisible = async (ctx: AppContext, actor: Actor, id: string): Promise<void> => {
  const row = await ctx.prisma.schedule.findFirst({ where: { AND: [{ id }, await scheduleScope(ctx, actor)] }, select: { id: true } })

  if (!row) throw Errors.notFound('schedule')
}

export const assertShiftVisible = async (ctx: AppContext, actor: Actor, id: string): Promise<void> => {
  const row = await ctx.prisma.shift.findFirst({ where: { AND: [{ id }, await shiftScope(ctx, actor)] }, select: { id: true } })

  if (!row) throw Errors.notFound('shift')
}
