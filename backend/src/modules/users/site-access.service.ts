import type { AppContext, ClientMeta } from '../../context.js'
import type { Site, User } from '../../generated/prisma/client.js'
import { siteScope } from '../../lib/access.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import { recordAudit } from '../audit/record.js'
import { lockUser } from './user-scope.js'

type SiteRef = Pick<Site, 'id' | 'name' | 'clientId' | 'active'>

const REF_SELECT = { id: true, name: true, clientId: true, active: true } as const

/**
 * The target's sites that the viewer may see: an admin sees all of them, a supervisor only the ones they manage
 * themselves (so a shared colleague's other sites are not revealed), a field user their own.
 */
export const listUserSites = async (ctx: AppContext, actor: Actor, userId: string): Promise<SiteRef[]> =>
  ctx.prisma.site.findMany({
    where: { AND: [{ accessRows: { some: { userId } } }, await siteScope(ctx, actor)] },
    select: REF_SELECT,
    orderBy: [{ name: 'asc' }, { id: 'asc' }]
  })

/** Replace-all site access (ADMIN only). Client users have no sites to be scheduled at, so they are refused. */
export const replaceUserSites = async (ctx: AppContext, actor: Actor, target: User, siteIds: string[], meta: ClientMeta): Promise<void> => {
  if (target.role === 'CLIENT_USER') {
    throw Errors.unprocessable('Client users do not have site access. Their sites come from their client.')
  }

  const wanted = [...new Set(siteIds)]

  await ctx.prisma.$transaction(async tx => {
    await lockUser(tx, target.id)

    const found = await tx.site.count({ where: { id: { in: wanted }, orgId: actor.orgId } })

    if (found !== wanted.length) {
      throw Errors.invalidField('siteIds', 'site_not_found', 'One or more sites do not exist in this organization.')
    }

    const current = (await tx.userSiteAccess.findMany({ where: { userId: target.id }, select: { siteId: true } })).map(row => row.siteId)

    await tx.userSiteAccess.deleteMany({ where: { userId: target.id } })
    await tx.userSiteAccess.createMany({ data: wanted.map(siteId => ({ userId: target.id, siteId })) })

    await recordAudit(tx, actor, {
      entity: 'user',
      entityId: target.id,
      action: 'sites_replaced',
      diff: {
        added: wanted.filter(siteId => !current.includes(siteId)).sort(),
        removed: current.filter(siteId => !wanted.includes(siteId)).sort()
      },
      meta
    })
  })
}
