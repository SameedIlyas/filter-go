import type { AppContext, ClientMeta } from '../../context.js'
import type { Prisma, Site } from '../../generated/prisma/client.js'
import { siteScope } from '../../lib/access.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import { pageArgs, pageMeta } from '../../lib/pagination.js'
import type { PageQuery } from '../../lib/pagination.js'
import type { PageMeta } from '../../lib/response.js'
import { recordAudit } from '../audit/record.js'

export interface ListSitesQuery extends PageQuery {
  clientId?: string
  q?: string
  active?: boolean
}

export const listSites = async (ctx: AppContext, actor: Actor, query: ListSitesQuery): Promise<{ items: Site[]; meta: PageMeta }> => {
  const where: Prisma.SiteWhereInput = {
    AND: [
      await siteScope(ctx, actor),
      query.clientId ? { clientId: query.clientId } : {},
      query.active === undefined ? {} : { active: query.active },
      query.q ? { OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { address: { contains: query.q, mode: 'insensitive' } }] } : {}
    ]
  }
  const [items, total] = await Promise.all([
    ctx.prisma.site.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], ...pageArgs(query) }),
    ctx.prisma.site.count({ where })
  ])

  return { items, meta: pageMeta(query, total) }
}

export const getSite = async (ctx: AppContext, actor: Actor, id: string): Promise<Site> => {
  const site = await ctx.prisma.site.findFirst({ where: { AND: [{ id }, await siteScope(ctx, actor)] } })

  if (!site) throw Errors.notFound('site')

  return site
}

export interface SiteInput {
  name: string
  address: string
  lat?: number | null
  lng?: number | null
  timezone?: string | null
  accessNotes?: string | null
  contactName?: string | null
  contactPhone?: string | null
  active?: boolean
}

export const createSite = async (ctx: AppContext, actor: Actor, clientId: string, input: SiteInput, meta: ClientMeta): Promise<Site> =>
  ctx.prisma.$transaction(async tx => {
    const client = await tx.client.findFirst({ where: { id: clientId, orgId: actor.orgId }, select: { id: true } })

    if (!client) throw Errors.notFound('client')

    const site = await tx.site.create({
      data: {
        orgId: actor.orgId,
        clientId,
        name: input.name,
        address: input.address,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        timezone: input.timezone ?? null,
        accessNotes: input.accessNotes ?? null,
        contactName: input.contactName ?? null,
        contactPhone: input.contactPhone ?? null
      }
    })

    await recordAudit(tx, actor, { entity: 'site', entityId: site.id, action: 'created', diff: { name: site.name, clientId }, meta })

    return site
  })

export const updateSite = async (ctx: AppContext, actor: Actor, id: string, input: Partial<SiteInput>, meta: ClientMeta): Promise<Site> =>
  ctx.prisma.$transaction(async tx => {
    const before = await tx.site.findFirst({ where: { id, orgId: actor.orgId } })

    if (!before) throw Errors.notFound('site')

    const site = await tx.site.update({ where: { id }, data: input })

    await recordAudit(tx, actor, {
      entity: 'site',
      entityId: id,
      action: 'updated',
      diff: {
        before: { name: before.name, address: before.address, lat: before.lat, lng: before.lng, timezone: before.timezone, active: before.active },
        after: input
      },
      meta
    })

    return site
  })
