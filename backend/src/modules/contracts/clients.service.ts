import type { AppContext, ClientMeta } from '../../context.js'
import type { Client, PaymentTerms, Prisma } from '../../generated/prisma/client.js'
import { accessibleSiteIds } from '../../lib/access.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import { pageArgs, pageMeta } from '../../lib/pagination.js'
import type { PageQuery } from '../../lib/pagination.js'
import type { PageMeta } from '../../lib/response.js'
import { recordAudit } from '../audit/record.js'

/**
 * Which clients the actor may read: ADMIN all, SUPERVISOR the clients that own a site they manage,
 * CLIENT_USER only their own. (Other roles are stopped at the route guard.)
 */
const clientScope = async (ctx: AppContext, actor: Actor): Promise<Prisma.ClientWhereInput> => {
  if (actor.role === 'ADMIN') return { orgId: actor.orgId }

  if (actor.role === 'CLIENT_USER') return { orgId: actor.orgId, id: actor.clientId ?? { in: [] } }

  const siteIds = await accessibleSiteIds(ctx, actor)

  return { orgId: actor.orgId, sites: { some: { id: { in: siteIds === 'all' ? undefined : siteIds } } } }
}

export interface ListClientsQuery extends PageQuery {
  q?: string
  active?: boolean
}

export const listClients = async (ctx: AppContext, actor: Actor, query: ListClientsQuery): Promise<{ items: Client[]; meta: PageMeta }> => {
  const where: Prisma.ClientWhereInput = {
    AND: [
      await clientScope(ctx, actor),
      query.active === undefined ? {} : { active: query.active },
      query.q ? { OR: [{ legalName: { contains: query.q, mode: 'insensitive' } }, { billingEmail: { contains: query.q, mode: 'insensitive' } }] } : {}
    ]
  }
  const [items, total] = await Promise.all([
    ctx.prisma.client.findMany({ where, orderBy: [{ legalName: 'asc' }, { id: 'asc' }], ...pageArgs(query) }),
    ctx.prisma.client.count({ where })
  ])

  return { items, meta: pageMeta(query, total) }
}

export const getClient = async (ctx: AppContext, actor: Actor, id: string): Promise<Client> => {
  const client = await ctx.prisma.client.findFirst({ where: { AND: [{ id }, await clientScope(ctx, actor)] } })

  if (!client) throw Errors.notFound('client')

  return client
}

export interface ClientInput {
  legalName: string
  billingEmail: string
  billingAddress?: string | null
  paymentTerms?: PaymentTerms
  active?: boolean
}

export const createClient = async (ctx: AppContext, actor: Actor, input: ClientInput, meta: ClientMeta): Promise<Client> =>
  ctx.prisma.$transaction(async tx => {
    const client = await tx.client.create({
      data: {
        orgId: actor.orgId,
        legalName: input.legalName,
        billingEmail: input.billingEmail,
        billingAddress: input.billingAddress ?? null,
        paymentTerms: input.paymentTerms ?? 'NET30'
      }
    })

    await recordAudit(tx, actor, { entity: 'client', entityId: client.id, action: 'created', diff: { legalName: client.legalName }, meta })

    return client
  })

export const updateClient = async (ctx: AppContext, actor: Actor, id: string, input: Partial<ClientInput>, meta: ClientMeta): Promise<Client> =>
  ctx.prisma.$transaction(async tx => {
    const before = await tx.client.findFirst({ where: { id, orgId: actor.orgId } })

    if (!before) throw Errors.notFound('client')

    const client = await tx.client.update({ where: { id }, data: input })

    await recordAudit(tx, actor, {
      entity: 'client',
      entityId: id,
      action: 'updated',
      diff: {
        before: {
          legalName: before.legalName,
          billingEmail: before.billingEmail,
          billingAddress: before.billingAddress,
          paymentTerms: before.paymentTerms,
          active: before.active
        },
        after: input
      },
      meta
    })

    return client
  })
