import type { AppContext, ClientMeta } from '../../context.js'
import { Prisma } from '../../generated/prisma/client.js'
import type { Contract, ContractStatus } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { AppError, Errors } from '../../lib/errors.js'
import { assertFilesInOrg } from '../../lib/file-refs.js'
import { recordAudit } from '../audit/record.js'
import { byId, coverageToInput, insertCoverage, insertLines, lineToInput } from './contract.rows.js'
import type { SignInput } from './contract.schemas.js'
import { getContract } from './contract.service.js'
import type { ContractDetail } from './contract.serializers.js'
import { applyTransition, assertSource, assertTransition, lockContract } from './contract.state.js'
import { completenessIssues } from './contract.validation.js'

/** A signature stamped later than this into the future is refused (clock skew allowance). */
const FUTURE_TOLERANCE_MS = 5 * 60_000

const findContract = async (tx: Prisma.TransactionClient, orgId: string, id: string): Promise<Contract> => {
  const contract = await tx.contract.findFirst({ where: { id, orgId } })

  if (!contract) throw Errors.notFound('contract')

  return contract
}

/** DRAFT -> PENDING_SIGNATURE after ARCHITECTURE 4.3 completeness validation (all problems reported at once). */
export const submitContract = async (ctx: AppContext, actor: Actor, id: string, meta: ClientMeta): Promise<ContractDetail> => {
  await ctx.prisma.$transaction(async tx => {
    // The lock keeps a concurrent PUT lines/coverage from changing what is being validated
    const contract = await lockContract(tx, actor.orgId, id)

    assertTransition(contract.status, 'PENDING_SIGNATURE')

    const [lines, coverage, sites, taxRates] = await Promise.all([
      tx.contractLine.findMany({ where: { contractId: id } }),
      tx.contractCoverage.findMany({ where: { contractId: id } }),
      tx.site.findMany({ where: { orgId: actor.orgId, clientId: contract.clientId }, select: { id: true } }),
      tx.taxRate.findMany({ where: { orgId: actor.orgId }, select: { code: true } })
    ])
    const issues = completenessIssues({
      contract,
      lines: byId(lines),
      coverage: byId(coverage),
      clientSiteIds: new Set(sites.map(site => site.id)),
      taxCodes: new Set(taxRates.map(rate => rate.code))
    })

    if (issues.length > 0) throw Errors.validation(issues)

    await applyTransition(tx, actor.orgId, contract, 'PENDING_SIGNATURE')
    await recordAudit(tx, actor, { entity: 'contract', entityId: id, action: 'submitted', diff: { from: contract.status, to: 'PENDING_SIGNATURE' }, meta })
  })

  return getContract(ctx, actor, id)
}

/** Expires the version this one replaces (if it is still running), inside the caller's transaction. */
const expirePredecessor = async (tx: Prisma.TransactionClient, actor: Actor, successor: Contract, meta: ClientMeta): Promise<void> => {
  if (!successor.supersedesContractId) return

  const previous = await tx.contract.findFirst({ where: { id: successor.supersedesContractId, orgId: actor.orgId } })

  if (!previous || (previous.status !== 'ACTIVE' && previous.status !== 'SUSPENDED')) return

  const result = await tx.contract.updateMany({ where: { id: previous.id, orgId: actor.orgId, status: previous.status }, data: { status: 'EXPIRED' } })

  // Someone cancelled or expired it in the meantime: it no longer needs expiring
  if (result.count === 0) return

  await recordAudit(tx, actor, {
    entity: 'contract',
    entityId: previous.id,
    action: 'expired',
    diff: { from: previous.status, to: 'EXPIRED', supersededBy: successor.id },
    meta
  })
}

/** PENDING_SIGNATURE -> ACTIVE. If this version supersedes another, that one becomes EXPIRED in the same transaction. */
export const signContract = async (ctx: AppContext, actor: Actor, id: string, input: SignInput, meta: ClientMeta): Promise<ContractDetail> => {
  const signedAt = input.signedAt ?? new Date()

  if (signedAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
    throw Errors.invalidField('signedAt', 'in_future', 'The signature date cannot be in the future.')
  }

  await ctx.prisma.$transaction(async tx => {
    const contract = await findContract(tx, actor.orgId, id)

    assertSource(contract.status, 'PENDING_SIGNATURE', 'ACTIVE', 'Only a contract that is pending signature can be signed.')

    if (input.documentFileId) await assertFilesInOrg(tx, actor.orgId, [input.documentFileId], 'documentFileId')

    // Of two concurrent signatures only one gets past this conditional update
    await applyTransition(tx, actor.orgId, contract, 'ACTIVE', { signedAt, signedBy: input.signedBy, documentFileId: input.documentFileId ?? null })
    await expirePredecessor(tx, actor, contract, meta)
    await recordAudit(tx, actor, {
      entity: 'contract',
      entityId: id,
      action: 'signed',
      diff: { from: contract.status, to: 'ACTIVE', signedBy: input.signedBy, signedAt: signedAt.toISOString(), documentFileId: input.documentFileId ?? null },
      meta
    })
  })

  return getContract(ctx, actor, id)
}

type SimpleAction = 'suspended' | 'resumed' | 'cancelled'

const TARGETS: Record<SimpleAction, ContractStatus> = { suspended: 'SUSPENDED', resumed: 'ACTIVE', cancelled: 'CANCELLED' }

/** suspend / resume / cancel: one conditional status change plus its audit row. */
export const changeStatus = async (
  ctx: AppContext,
  actor: Actor,
  id: string,
  action: SimpleAction,
  extra: { reason?: string },
  meta: ClientMeta
): Promise<ContractDetail> => {
  await ctx.prisma.$transaction(async tx => {
    const contract = await findContract(tx, actor.orgId, id)

    if (action === 'resumed') assertSource(contract.status, 'SUSPENDED', 'ACTIVE', 'Only a suspended contract can be resumed.')

    await applyTransition(tx, actor.orgId, contract, TARGETS[action])
    await recordAudit(tx, actor, {
      entity: 'contract',
      entityId: id,
      action,
      diff: { from: contract.status, to: TARGETS[action], ...(extra.reason ? { reason: extra.reason } : {}) },
      meta
    })
  })

  return getContract(ctx, actor, id)
}

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'

const notNewVersionable = (from: ContractStatus): AppError =>
  new AppError(409, 'INVALID_STATE', 'Only an active or suspended contract can get a new version.', {
    details: { entity: 'contract', from, to: 'DRAFT', allowed: [] }
  })

/**
 * Creates DRAFT version N+1 (header, lines and coverage copied, `supersedesContractId` = source).
 * The source is locked, so two concurrent calls are serialised and the second one sees the first one's draft.
 * A cancelled successor does not block a new attempt: the number continues after the highest version ever used.
 */
export const createNewVersion = async (ctx: AppContext, actor: Actor, id: string, meta: ClientMeta): Promise<ContractDetail> => {
  try {
    const newId = await ctx.prisma.$transaction(async tx => {
      const source = await lockContract(tx, actor.orgId, id)

      if (source.status !== 'ACTIVE' && source.status !== 'SUSPENDED') throw notNewVersionable(source.status)

      const chain = await tx.contract.findMany({
        where: { orgId: actor.orgId, contractNumber: source.contractNumber },
        select: { id: true, version: true, status: true }
      })
      const open = chain.find(row => row.status === 'DRAFT' || row.status === 'PENDING_SIGNATURE')

      if (open) throw Errors.conflict('This contract already has a new version in progress.', { contractId: open.id, version: open.version })

      const newer = chain.find(row => row.version > source.version && row.status !== 'CANCELLED')

      if (newer) throw Errors.conflict('Only the latest version of a contract can get a new version.', { contractId: newer.id, version: newer.version })

      const [lines, coverage] = await Promise.all([
        tx.contractLine.findMany({ where: { contractId: id } }),
        tx.contractCoverage.findMany({ where: { contractId: id } })
      ])
      const version = Math.max(...chain.map(row => row.version)) + 1
      const created = await tx.contract.create({
        data: {
          orgId: actor.orgId,
          clientId: source.clientId,
          leadId: source.leadId,
          contractNumber: source.contractNumber,
          version,
          status: 'DRAFT',
          startDate: source.startDate,
          endDate: source.endDate,
          autoRenew: source.autoRenew,
          billingType: source.billingType,
          billingCycle: source.billingCycle,
          supersedesContractId: source.id,
          createdById: actor.id
        }
      })

      await insertLines(tx, created.id, byId(lines).map(lineToInput))
      await insertCoverage(tx, created.id, byId(coverage).map(coverageToInput))
      await recordAudit(tx, actor, {
        entity: 'contract',
        entityId: created.id,
        action: 'version_created',
        diff: { contractNumber: created.contractNumber, version, supersedes: source.id, lines: lines.length, coverage: coverage.length },
        meta
      })

      return created.id
    })

    return await getContract(ctx, actor, newId)
  } catch (error) {
    if (isUniqueViolation(error)) throw Errors.conflict('This contract already has a new version in progress.')

    throw error
  }
}
