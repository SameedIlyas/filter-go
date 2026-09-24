import type { AppContext, ClientMeta } from '../../context.js'
import { Prisma } from '../../generated/prisma/client.js'
import type { Service, TaxRate } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import type { Decimal } from '../../lib/money.js'
import { pageArgs, pageMeta } from '../../lib/pagination.js'
import type { PageQuery } from '../../lib/pagination.js'
import type { PageMeta } from '../../lib/response.js'
import { recordAudit } from '../audit/record.js'
import { LIVE_STATUSES } from './contract.state.js'

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export interface ListServicesQuery extends PageQuery {
  q?: string
  active?: boolean
}

export const listServices = async (ctx: AppContext, actor: Actor, query: ListServicesQuery): Promise<{ items: Service[]; meta: PageMeta }> => {
  const where: Prisma.ServiceWhereInput = {
    orgId: actor.orgId,
    ...(query.active === undefined ? {} : { active: query.active }),
    ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {})
  }
  const [items, total] = await Promise.all([
    ctx.prisma.service.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], ...pageArgs(query) }),
    ctx.prisma.service.count({ where })
  ])

  return { items, meta: pageMeta(query, total) }
}

export interface ServiceInput {
  name: string
  description?: string | null
  active?: boolean
}

export const createService = async (ctx: AppContext, actor: Actor, input: ServiceInput, meta: ClientMeta): Promise<Service> => {
  try {
    return await ctx.prisma.$transaction(async tx => {
      const service = await tx.service.create({
        data: { orgId: actor.orgId, name: input.name, description: input.description ?? null, active: input.active ?? true }
      })

      await recordAudit(tx, actor, { entity: 'service', entityId: service.id, action: 'created', diff: { name: service.name }, meta })

      return service
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw Errors.duplicate('service', 'A service with this name already exists.')

    throw error
  }
}

export const updateService = async (ctx: AppContext, actor: Actor, id: string, input: Partial<ServiceInput>, meta: ClientMeta): Promise<Service> => {
  try {
    return await ctx.prisma.$transaction(async tx => {
      const before = await tx.service.findFirst({ where: { id, orgId: actor.orgId } })

      if (!before) throw Errors.notFound('service')

      const service = await tx.service.update({ where: { id }, data: input })

      await recordAudit(tx, actor, {
        entity: 'service',
        entityId: id,
        action: 'updated',
        diff: { before: { name: before.name, description: before.description, active: before.active }, after: input },
        meta
      })

      return service
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw Errors.duplicate('service', 'A service with this name already exists.')

    throw error
  }
}

// ---------------------------------------------------------------------------
// Tax rates
// ---------------------------------------------------------------------------

export const listTaxRates = (ctx: AppContext, actor: Actor): Promise<TaxRate[]> =>
  ctx.prisma.taxRate.findMany({ where: { orgId: actor.orgId }, orderBy: { code: 'asc' } })

const upsertRate = async (ctx: AppContext, actor: Actor, code: string, ratePercent: Decimal, meta: ClientMeta): Promise<TaxRate> =>
  ctx.prisma.$transaction(async tx => {
    const rate = await tx.taxRate.upsert({
      where: { orgId_code: { orgId: actor.orgId, code } },
      create: { orgId: actor.orgId, code, ratePercent },
      update: { ratePercent }
    })

    await recordAudit(tx, actor, { entity: 'tax_rate', entityId: rate.id, action: 'upserted', diff: { code, ratePercent: rate.ratePercent.toFixed(3) }, meta })

    return rate
  })

export const putTaxRate = async (ctx: AppContext, actor: Actor, code: string, ratePercent: Decimal, meta: ClientMeta): Promise<TaxRate> => {
  try {
    return await upsertRate(ctx, actor, code, ratePercent, meta)
  } catch (error) {
    // Two first-time upserts of the same code racing each other: the second one is now a plain update
    if (isUniqueViolation(error)) return upsertRate(ctx, actor, code, ratePercent, meta)

    throw error
  }
}

/** Refused (409 CONFLICT) while any line of a draft, pending, active or suspended contract uses the code. */
export const deleteTaxRate = async (ctx: AppContext, actor: Actor, code: string, meta: ClientMeta): Promise<void> => {
  await ctx.prisma.$transaction(async tx => {
    const rate = await tx.taxRate.findUnique({ where: { orgId_code: { orgId: actor.orgId, code } } })

    if (!rate) throw Errors.notFound('tax rate')

    const inUse = await tx.contractLine.count({ where: { taxCode: code, contract: { orgId: actor.orgId, status: { in: LIVE_STATUSES } } } })

    if (inUse > 0) {
      throw Errors.conflict('This tax code is used by contract lines and cannot be deleted.', { code, lines: inUse })
    }

    await tx.taxRate.deleteMany({ where: { id: rate.id, orgId: actor.orgId } })
    await recordAudit(tx, actor, { entity: 'tax_rate', entityId: rate.id, action: 'deleted', diff: { code }, meta })
  })
}
