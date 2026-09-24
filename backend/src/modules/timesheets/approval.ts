import type { AppContext, ClientMeta } from '../../context.js'
import type { Prisma } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { AppError, Errors } from '../../lib/errors.js'
import { money } from '../../lib/money.js'
import type { Db } from '../../lib/prisma.js'
import { recordAudit } from '../audit/record.js'
import { notify } from '../notifications/notify.js'
import { entryInclude, lockScopedEntry, readScope } from './entries.js'
import type { EntryRow } from './entries.js'
import { resolveRates } from './pricing.js'
import { assertTransition, REVIEWABLE } from './state.js'

/** Why a batch approval passed over an entry. */
export type SkipReason = 'NOT_FOUND' | 'NOT_SUBMITTED' | 'HAS_UNRESOLVED_EXCEPTIONS' | 'INVALID_STATE' | 'UNPROCESSABLE'

class SkipEntry extends Error {
  constructor(readonly reason: SkipReason) {
    super(reason)
  }
}

interface ApproveMode {
  /** Batch: only SUBMITTED entries with no unresolved exceptions; anything else is skipped, not an error. */
  batch: boolean
}

const stampRates = async (tx: Db, entry: EntryRow) => {
  const [schedule, worker] = await Promise.all([
    tx.schedule.findUniqueOrThrow({ where: { id: entry.shift.scheduleId }, select: { termsSnapshot: true } }),
    tx.user.findFirst({ where: { id: entry.userId, orgId: entry.orgId }, select: { defaultPayRate: true } })
  ])

  return resolveRates(schedule.termsSnapshot, entry.shift.serviceRef, worker?.defaultPayRate ?? null)
}

const lockForApproval = async (ctx: AppContext, tx: Db, actor: Actor, entryId: string, mode: ApproveMode): Promise<EntryRow> => {
  try {
    return await lockScopedEntry(tx, await readScope(ctx, actor), entryId)
  } catch (error) {
    throw mode.batch && error instanceof AppError && error.code === 'NOT_FOUND' ? new SkipEntry('NOT_FOUND') : error
  }
}

const assertApprovable = (entry: EntryRow, mode: ApproveMode): void => {
  if (!mode.batch) return assertTransition(entry.status, 'APPROVED')

  if (entry.status !== 'SUBMITTED') throw new SkipEntry('NOT_SUBMITTED')

  if (entry.exceptions.some(exception => !exception.resolved)) throw new SkipEntry('HAS_UNRESOLVED_EXCEPTIONS')
}

/**
 * The money step. In ONE transaction, under the entry's row lock: check the transition, read the rates from the
 * schedule's frozen snapshot (never the live contract), stamp them, record who approved, resolve every exception.
 * A second approval waits on the lock, then finds the entry already APPROVED and changes nothing.
 */
const approveInTx = async (ctx: AppContext, tx: Db, actor: Actor, entryId: string, mode: ApproveMode, meta: ClientMeta | undefined, now: Date) => {
  const entry = await lockForApproval(ctx, tx, actor, entryId, mode)

  assertApprovable(entry, mode)

  const rates = await stampRates(tx, entry)

  const updated = await tx.timesheetEntry.updateMany({
    where: { id: entry.id, status: { in: mode.batch ? ['SUBMITTED'] : REVIEWABLE } },
    data: { status: 'APPROVED', payRateSnapshot: rates.payRate, billRateSnapshot: rates.billRate, approvedById: actor.id, approvedAt: now }
  })

  if (updated.count !== 1) throw Errors.conflict('The timesheet changed while it was being approved. Reload and try again.')

  await tx.timesheetException.updateMany({
    where: { timesheetEntryId: entry.id, resolved: false },
    data: { resolved: true, resolvedById: actor.id, resolvedAt: now }
  })

  await recordAudit(tx, actor, {
    entity: 'timesheet',
    entityId: entry.id,
    action: 'approved',
    diff: {
      fromStatus: entry.status,
      payRateSnapshot: money(rates.payRate),
      billRateSnapshot: money(rates.billRate),
      billable: entry.billable,
      payable: entry.payable,
      actualMinutes: entry.actualMinutes,
      exceptionsResolved: entry.exceptions.filter(exception => !exception.resolved).map(exception => exception.type)
    },
    meta
  })

  return tx.timesheetEntry.findUniqueOrThrow({ where: { id: entry.id }, include: entryInclude })
}

export const approveEntry = async (ctx: AppContext, actor: Actor, entryId: string, meta?: ClientMeta, now: Date = new Date()): Promise<EntryRow> =>
  ctx.prisma.$transaction(tx => approveInTx(ctx, tx, actor, entryId, { batch: false }, meta, now))

export interface BatchResult {
  approved: string[]
  skipped: Array<{ id: string; reason: SkipReason }>
}

const skipReasonOf = (error: unknown): SkipReason => {
  if (error instanceof SkipEntry) return error.reason

  if (error instanceof AppError && (error.code === 'INVALID_STATE' || error.code === 'UNPROCESSABLE')) return error.code

  throw error
}

/** Each entry is approved in its own transaction, so one bad entry never blocks the rest. */
export const approveBatch = async (ctx: AppContext, actor: Actor, ids: string[], meta?: ClientMeta, now: Date = new Date()): Promise<BatchResult> => {
  const approved: string[] = []
  const skipped: BatchResult['skipped'] = []

  for (const id of new Set(ids)) {
    try {
      await ctx.prisma.$transaction(tx => approveInTx(ctx, tx, actor, id, { batch: true }, meta, now))
      approved.push(id)
    } catch (error) {
      skipped.push({ id, reason: skipReasonOf(error) })
    }
  }

  return { approved, skipped }
}

/** SUBMITTED or ADJUSTED -> REJECTED. The worker is told, and can then correct and resubmit. */
export const rejectEntry = async (ctx: AppContext, actor: Actor, entryId: string, reason: string, meta?: ClientMeta): Promise<EntryRow> =>
  ctx.prisma.$transaction(async tx => {
    const entry = await lockScopedEntry(tx, await readScope(ctx, actor), entryId)

    assertTransition(entry.status, 'REJECTED')

    const updated = await tx.timesheetEntry.updateMany({
      where: { id: entry.id, status: { in: REVIEWABLE } },
      data: { status: 'REJECTED', rejectionReason: reason }
    })

    if (updated.count !== 1) throw Errors.conflict('The timesheet changed while it was being rejected. Reload and try again.')

    await recordAudit(tx, actor, { entity: 'timesheet', entityId: entry.id, action: 'rejected', diff: { fromStatus: entry.status, reason }, meta })
    await notify(
      ctx,
      {
        orgId: actor.orgId,
        userIds: [entry.userId],
        type: 'timesheet.rejected',
        title: 'Timesheet rejected',
        body: `Your timesheet for ${entry.shift.site.name} was rejected: ${reason}`,
        data: { timesheetId: entry.id, shiftId: entry.shiftId, reason } satisfies Prisma.InputJsonObject
      },
      tx
    )

    return tx.timesheetEntry.findUniqueOrThrow({ where: { id: entry.id }, include: entryInclude })
  })

/** Marks one exception resolved without approving the entry. Approved / invoiced entries have none left to resolve. */
export const resolveException = async (
  ctx: AppContext,
  actor: Actor,
  exceptionId: string,
  note: string | undefined,
  meta?: ClientMeta,
  now: Date = new Date()
) =>
  ctx.prisma.$transaction(async tx => {
    const scope = await readScope(ctx, actor)
    const found = await tx.timesheetException.findFirst({ where: { id: exceptionId, entry: { AND: [scope] } }, select: { id: true } })

    if (!found) throw Errors.notFound('exception')

    const claimed = await tx.timesheetException.updateMany({
      where: { id: found.id, resolved: false },
      data: { resolved: true, resolvedById: actor.id, resolvedAt: now }
    })

    if (claimed.count !== 1) throw Errors.conflict('This exception is already resolved.')

    const exception = await tx.timesheetException.findUniqueOrThrow({ where: { id: found.id } })

    await recordAudit(tx, actor, {
      entity: 'timesheet',
      entityId: exception.timesheetEntryId,
      action: 'exception_resolved',
      diff: { exceptionId: exception.id, type: exception.type, note: note ?? null },
      meta
    })

    return exception
  })
