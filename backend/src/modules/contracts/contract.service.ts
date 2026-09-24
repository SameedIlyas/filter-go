import type { AppContext, ClientMeta } from '../../context.js'
import type { Contract, Prisma } from '../../generated/prisma/client.js'
import { accessibleSiteIds } from '../../lib/access.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import { pageArgs, pageMeta } from '../../lib/pagination.js'
import type { PageMeta } from '../../lib/response.js'
import { fromDateOnlyOrNull, toDateOnly } from '../../lib/time.js'
import { recordAudit } from '../audit/record.js'
import { assertRowRefs, byId, insertCoverage, insertLines } from './contract.rows.js'
import { lineQty } from './contract.schemas.js'
import type { CreateContractInput, LineBodyInput, ListContractsQuery, PatchContractInput } from './contract.schemas.js'
import type { ContractClientRef, ContractDetail } from './contract.serializers.js'
import { lockDraft } from './contract.state.js'
import { createContractDraftRecord } from './draft-record.js'
import type { DraftLineInput } from './draft-record.js'

/**
 * Contracts the actor may read. ADMIN: the whole organization. SUPERVISOR: a contract with a line or a coverage row
 * at one of their sites. Anyone else never reaches this (route guard), and gets nothing here either.
 */
const contractScope = async (ctx: AppContext, actor: Actor): Promise<Prisma.ContractWhereInput> => {
  if (actor.role === 'ADMIN') return { orgId: actor.orgId }

  const siteIds = actor.role === 'SUPERVISOR' ? await accessibleSiteIds(ctx, actor) : []
  const inScope = siteIds === 'all' ? undefined : { in: siteIds }

  return { orgId: actor.orgId, OR: [{ lines: { some: { siteId: inScope } } }, { coverage: { some: { siteId: inScope } } }] }
}

/** Highest version of every contract number, in one query (not one per number). */
const latestContractIds = async (ctx: AppContext, orgId: string, clientId?: string): Promise<string[]> => {
  const rows = await ctx.prisma.$queryRaw<Array<{ id: string }>>`
    SELECT DISTINCT ON ("contractNumber") id FROM contracts
    WHERE "orgId" = ${orgId} AND (${clientId ?? null}::text IS NULL OR "clientId" = ${clientId ?? null})
    ORDER BY "contractNumber", version DESC`

  return rows.map(row => row.id)
}

export const listContracts = async (
  ctx: AppContext,
  actor: Actor,
  query: ListContractsQuery
): Promise<{ items: Array<{ contract: Contract; client: ContractClientRef }>; meta: PageMeta }> => {
  const latest = query.latestOnly ? await latestContractIds(ctx, actor.orgId, query.clientId) : undefined
  const where: Prisma.ContractWhereInput = {
    AND: [
      await contractScope(ctx, actor),
      query.status ? { status: query.status } : {},
      query.clientId ? { clientId: query.clientId } : {},
      query.q ? { contractNumber: { contains: query.q, mode: 'insensitive' } } : {},
      latest ? { id: { in: latest } } : {}
    ]
  }
  const [rows, total] = await Promise.all([
    ctx.prisma.contract.findMany({
      where,
      include: { client: { select: { id: true, legalName: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      ...pageArgs(query)
    }),
    ctx.prisma.contract.count({ where })
  ])

  return { items: rows.map(({ client, ...contract }) => ({ contract, client })), meta: pageMeta(query, total) }
}

/**
 * The contract with its rows and its version chain. A supervisor only gets the lines, coverage and versions that
 * are inside their site scope; everything else in the contract stays invisible to them.
 */
export const getContract = async (ctx: AppContext, actor: Actor, id: string): Promise<ContractDetail> => {
  const scope = await contractScope(ctx, actor)
  const found = await ctx.prisma.contract.findFirst({
    where: { AND: [{ id }, scope] },
    include: { client: { select: { id: true, legalName: true } }, lines: true, coverage: true }
  })

  if (!found) throw Errors.notFound('contract')

  const { client, lines, coverage, ...contract } = found
  const siteIds = await accessibleSiteIds(ctx, actor)
  const visible = (siteId: string) => siteIds === 'all' || siteIds.includes(siteId)
  const versions = await ctx.prisma.contract.findMany({
    where: { AND: [{ orgId: actor.orgId, contractNumber: contract.contractNumber }, scope] },
    select: { id: true, version: true, status: true },
    orderBy: { version: 'asc' }
  })

  return {
    contract,
    client,
    lines: byId(lines).filter(line => visible(line.siteId)),
    coverage: byId(coverage).filter(row => visible(row.siteId)),
    versions
  }
}

const toLineInputs = (lines: LineBodyInput[]): DraftLineInput[] => lines.map(line => ({ ...line, qty: lineQty(line) }))

/** Creates DRAFT v1. Structural checks only: completeness is judged on submit. */
export const createContract = async (ctx: AppContext, actor: Actor, input: CreateContractInput, meta: ClientMeta): Promise<ContractDetail> => {
  const id = await ctx.prisma.$transaction(async tx => {
    // Lines and coverage are inserted below (in request order, with their own reference checks)
    const draft = await createContractDraftRecord(ctx, tx, actor, {
      clientId: input.clientId,
      startDate: input.startDate,
      endDate: input.endDate,
      autoRenew: input.autoRenew,
      billingType: input.billingType,
      billingCycle: input.billingCycle,
      lines: []
    })

    await assertRowRefs(tx, actor.orgId, input.clientId, input.lines, input.coverage)
    await insertLines(tx, draft.id, toLineInputs(input.lines))
    await insertCoverage(tx, draft.id, input.coverage)
    await recordAudit(tx, actor, {
      entity: 'contract',
      entityId: draft.id,
      action: 'created',
      diff: { contractNumber: draft.contractNumber, version: draft.version, lines: input.lines.length, coverage: input.coverage.length },
      meta
    })

    return draft.id
  })

  return getContract(ctx, actor, id)
}

const headerValues = (contract: Contract) => ({
  startDate: fromDateOnlyOrNull(contract.startDate),
  endDate: fromDateOnlyOrNull(contract.endDate),
  autoRenew: contract.autoRenew,
  billingType: contract.billingType,
  billingCycle: contract.billingCycle
})

/** DRAFT only. The audit row lists only the header fields that actually changed. */
export const patchContract = async (ctx: AppContext, actor: Actor, id: string, input: PatchContractInput, meta: ClientMeta): Promise<ContractDetail> => {
  await ctx.prisma.$transaction(async tx => {
    const before = await lockDraft(tx, actor.orgId, id)
    const after = await tx.contract.update({
      where: { id },
      data: {
        ...(input.startDate === undefined ? {} : { startDate: toDateOnly(input.startDate) }),
        ...(input.endDate === undefined ? {} : { endDate: input.endDate === null ? null : toDateOnly(input.endDate) }),
        ...(input.autoRenew === undefined ? {} : { autoRenew: input.autoRenew }),
        ...(input.billingType === undefined ? {} : { billingType: input.billingType }),
        ...(input.billingCycle === undefined ? {} : { billingCycle: input.billingCycle })
      }
    })
    const was = headerValues(before)
    const now = headerValues(after)
    const changed = (Object.keys(was) as Array<keyof typeof was>).filter(key => was[key] !== now[key])

    await recordAudit(tx, actor, {
      entity: 'contract',
      entityId: id,
      action: 'updated',
      diff: Object.fromEntries(changed.map(key => [key, { from: was[key], to: now[key] }])),
      meta
    })
  })

  return getContract(ctx, actor, id)
}

export const replaceLines = async (ctx: AppContext, actor: Actor, id: string, lines: LineBodyInput[], meta: ClientMeta): Promise<ContractDetail> => {
  await ctx.prisma.$transaction(async tx => {
    const contract = await lockDraft(tx, actor.orgId, id)

    await assertRowRefs(tx, actor.orgId, contract.clientId, lines, [])

    const removed = await tx.contractLine.deleteMany({ where: { contractId: id } })

    await insertLines(tx, id, toLineInputs(lines))
    await tx.contract.update({ where: { id }, data: { updatedAt: new Date() } })
    await recordAudit(tx, actor, { entity: 'contract', entityId: id, action: 'lines_replaced', diff: { removed: removed.count, added: lines.length }, meta })
  })

  return getContract(ctx, actor, id)
}

export const replaceCoverage = async (
  ctx: AppContext,
  actor: Actor,
  id: string,
  coverage: CreateContractInput['coverage'],
  meta: ClientMeta
): Promise<ContractDetail> => {
  await ctx.prisma.$transaction(async tx => {
    const contract = await lockDraft(tx, actor.orgId, id)

    await assertRowRefs(tx, actor.orgId, contract.clientId, [], coverage)

    const removed = await tx.contractCoverage.deleteMany({ where: { contractId: id } })

    await insertCoverage(tx, id, coverage)
    await tx.contract.update({ where: { id }, data: { updatedAt: new Date() } })
    await recordAudit(tx, actor, { entity: 'contract', entityId: id, action: 'coverage_replaced', diff: { removed: removed.count, added: coverage.length }, meta })
  })

  return getContract(ctx, actor, id)
}
