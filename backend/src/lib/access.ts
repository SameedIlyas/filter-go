import type { AppContext } from '../context.js'
import type { Prisma, Role } from '../generated/prisma/client.js'
import type { Auth } from '../modules/sessions/session.service.js'
import { Errors } from './errors.js'

/**
 * Who is making the request, reduced to what authorization decisions need.
 * Every service takes an Actor, and every query is scoped by `actor.orgId`.
 */
export interface Actor {
  id: string
  orgId: string
  role: Role
  /** Only set for CLIENT_USER. */
  clientId: string | null
}

export const actorOf = (auth: Auth): Actor => ({
  id: auth.user.id,
  orgId: auth.user.orgId,
  role: auth.user.role,
  clientId: auth.user.clientId
})

// ---------------------------------------------------------------------------
// Rate visibility (a real permission boundary, see docs/ARCHITECTURE.md section 3)
// ---------------------------------------------------------------------------

/** bill_rate: what the client is charged. ADMIN only. */
export const canSeeBillRate = (actor: Pick<Actor, 'role'>): boolean => actor.role === 'ADMIN'

/** pay_rate: what the worker is paid. ADMIN and SUPERVISOR. Field users and clients never see it. */
export const canSeePayRate = (actor: Pick<Actor, 'role'>): boolean => actor.role === 'ADMIN' || actor.role === 'SUPERVISOR'

// ---------------------------------------------------------------------------
// Site scoping
// ---------------------------------------------------------------------------

/**
 * The sites this actor may see, or 'all' for admins (everything inside their organization).
 *   ADMIN        all sites in the org
 *   SUPERVISOR   sites in user_site_access (the sites they manage)
 *   FIELD_USER   sites in user_site_access (where they may be scheduled)
 *   CLIENT_USER  every site of their own client
 */
export const accessibleSiteIds = async (ctx: AppContext, actor: Actor): Promise<string[] | 'all'> => {
  if (actor.role === 'ADMIN') return 'all'

  if (actor.role === 'CLIENT_USER') {
    if (!actor.clientId) return []

    const sites = await ctx.prisma.site.findMany({
      where: { orgId: actor.orgId, clientId: actor.clientId },
      select: { id: true }
    })

    return sites.map(site => site.id)
  }

  const rows = await ctx.prisma.userSiteAccess.findMany({
    where: { userId: actor.id, site: { orgId: actor.orgId } },
    select: { siteId: true }
  })

  return rows.map(row => row.siteId)
}

/** A Prisma `where` for Site that is already limited to the actor's organization and site scope. */
export const siteScope = async (ctx: AppContext, actor: Actor): Promise<Prisma.SiteWhereInput> => {
  const ids = await accessibleSiteIds(ctx, actor)

  return ids === 'all' ? { orgId: actor.orgId } : { orgId: actor.orgId, id: { in: ids } }
}

/** `{ siteId }` filter fragment for tables that carry a siteId (schedules, shifts, ...). */
export const siteIdFilter = async (ctx: AppContext, actor: Actor): Promise<Prisma.StringFilter | undefined> => {
  const ids = await accessibleSiteIds(ctx, actor)

  return ids === 'all' ? undefined : { in: ids }
}

/**
 * Throws NOT_FOUND (never FORBIDDEN, so existence isn't revealed) unless the site is in the actor's
 * organization and inside their site scope.
 */
export const assertSiteAccess = async (ctx: AppContext, actor: Actor, siteId: string): Promise<void> => {
  // AND, not a spread: the scope may itself constrain `id`, and a spread would silently overwrite `id: siteId`
  const site = await ctx.prisma.site.findFirst({ where: { AND: [{ id: siteId }, await siteScope(ctx, actor)] }, select: { id: true } })

  if (!site) throw Errors.notFound('site')
}
