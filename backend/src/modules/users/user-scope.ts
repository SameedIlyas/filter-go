import type { AppContext } from '../../context.js'
import type { Prisma, User } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import type { Db } from '../../lib/prisma.js'

/**
 * Which users this actor may see, as a Prisma `where` that is already limited to their organization.
 *   ADMIN        everyone in the organization
 *   SUPERVISOR   themselves, plus everyone who has a user_site_access row for at least one site they also have
 *   anyone else  only themselves
 */
export const visibleUsersWhere = async (ctx: AppContext, actor: Actor): Promise<Prisma.UserWhereInput> => {
  if (actor.role === 'ADMIN') return { orgId: actor.orgId }

  if (actor.role !== 'SUPERVISOR') return { orgId: actor.orgId, id: actor.id }

  const mine = await ctx.prisma.userSiteAccess.findMany({ where: { userId: actor.id, site: { orgId: actor.orgId } }, select: { siteId: true } })

  return {
    orgId: actor.orgId,
    OR: [{ id: actor.id }, { siteAccess: { some: { siteId: { in: mine.map(row => row.siteId) } } } }]
  }
}

/** A user outside the organization or outside the caller's reach is indistinguishable from a missing one (404). */
export const findVisibleUser = async (ctx: AppContext, actor: Actor, id: string): Promise<User> => {
  const user = await ctx.prisma.user.findFirst({ where: { AND: [{ id }, await visibleUsersWhere(ctx, actor)] } })

  if (!user) throw Errors.userNotFound()

  return user
}

/** Serialises concurrent replace-all writes for one user (the row lock is held until the transaction ends). */
export const lockUser = async (tx: Db, userId: string): Promise<void> => {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`
}
