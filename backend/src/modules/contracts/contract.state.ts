import type { ContractStatus, Prisma } from '../../generated/prisma/client.js'
import { AppError, Errors } from '../../lib/errors.js'
import type { Db } from '../../lib/prisma.js'

/** ARCHITECTURE 4.2. PENDING_SIGNATURE -> DRAFT is deliberately absent: cancel and copy instead. */
export const TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  DRAFT: ['PENDING_SIGNATURE', 'CANCELLED'],
  PENDING_SIGNATURE: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['SUSPENDED', 'EXPIRED', 'CANCELLED'],
  // SUSPENDED -> EXPIRED happens when a newer version is signed while the old one is suspended
  SUSPENDED: ['ACTIVE', 'EXPIRED', 'CANCELLED'],
  EXPIRED: [],
  CANCELLED: []
}

/** Statuses in which a contract still counts as "in use" (tax rates cannot be deleted under it). */
export const LIVE_STATUSES: ContractStatus[] = ['DRAFT', 'PENDING_SIGNATURE', 'ACTIVE', 'SUSPENDED']

export const assertTransition = (from: ContractStatus, to: ContractStatus): void => {
  if (!TRANSITIONS[from].includes(to)) {
    throw Errors.invalidState('contract', from, to, TRANSITIONS[from])
  }
}

/**
 * For actions that are narrower than the table: "resume" is ACTIVE-bound like "sign", but only a SUSPENDED contract
 * may resume and only a PENDING_SIGNATURE one may be signed.
 */
export const assertSource = (from: ContractStatus, required: ContractStatus, to: ContractStatus, message: string): void => {
  if (from !== required) {
    throw new AppError(409, 'INVALID_STATE', message, { details: { entity: 'contract', from, to, allowed: TRANSITIONS[from] } })
  }
}

export const notEditable = (status: ContractStatus): AppError =>
  new AppError(409, 'CONTRACT_NOT_EDITABLE', 'Only a draft contract can be edited. Create a new version instead.', {
    details: { entity: 'contract', context: { status } }
  })

/**
 * Moves a contract one step, only if it is still in the status the caller observed (race-safe: of two concurrent
 * callers exactly one wins, the other gets INVALID_STATE describing what the contract became).
 */
export const applyTransition = async (
  db: Db,
  orgId: string,
  contract: { id: string; status: ContractStatus },
  to: ContractStatus,
  data: Prisma.ContractUncheckedUpdateManyInput = {}
): Promise<void> => {
  assertTransition(contract.status, to)

  const result = await db.contract.updateMany({
    where: { id: contract.id, orgId, status: contract.status },
    data: { ...data, status: to }
  })

  if (result.count === 1) return

  const current = await db.contract.findFirst({ where: { id: contract.id, orgId }, select: { status: true } })

  if (!current) throw Errors.notFound('contract')

  throw Errors.invalidState('contract', current.status, to, TRANSITIONS[current.status])
}

/**
 * Takes a row lock on the contract (SELECT ... FOR UPDATE) and returns it. Edits and submit serialise on this lock,
 * so a submit can never validate lines that a concurrent PUT is replacing.
 */
export const lockContract = async (tx: Prisma.TransactionClient, orgId: string, id: string) => {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM contracts WHERE id = ${id} AND "orgId" = ${orgId} FOR UPDATE`

  if (rows.length === 0) throw Errors.notFound('contract')

  return tx.contract.findUniqueOrThrow({ where: { id } })
}

export const lockDraft = async (tx: Prisma.TransactionClient, orgId: string, id: string) => {
  const contract = await lockContract(tx, orgId, id)

  if (contract.status !== 'DRAFT') throw notEditable(contract.status)

  return contract
}
