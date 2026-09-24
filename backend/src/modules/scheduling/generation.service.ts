import type { AppContext, ClientMeta } from '../../context.js'
import type { Contract, ContractCoverage, ContractLine, Prisma } from '../../generated/prisma/client.js'
import { assertSiteAccess } from '../../lib/access.js'
import type { Actor } from '../../lib/access.js'
import { AppError, Errors } from '../../lib/errors.js'
import { buildTermsSnapshot, parseTermsSnapshot } from '../../lib/terms-snapshot.js'
import type { TermsSnapshot } from '../../lib/terms-snapshot.js'
import { daysBetween, fromDateOnly, localDate, toDateOnly, zonedInstant } from '../../lib/time.js'
import { recordAudit } from '../audit/record.js'
import { MAX_PERIOD_DAYS } from './constants.js'
import { generateWindows } from './coverage-pattern.js'
import type { Period, ShiftWindow } from './coverage-pattern.js'
import type { GenerateInput } from './schemas.js'
import { lockGeneration, lockScheduleForUpdate } from './locks.js'
import { presentSchedule } from './presenters.js'
import { assertScheduleVisible } from './scope.js'
import { shiftDefaults } from './shift-defaults.js'
import { siteTimezone } from './timezones.js'

const TRANSACTION_OPTIONS = { timeout: 20_000, maxWait: 10_000 }

type ContractWithTerms = Contract & { lines: ContractLine[]; coverage: ContractCoverage[] }

// ---------------------------------------------------------------------------
// Period rules
// ---------------------------------------------------------------------------

const validateRequestedPeriod = (period: Period): void => {
  if (period.end < period.start) {
    throw Errors.invalidField('periodEnd', 'invalid_range', 'The period must end on or after it starts.')
  }

  if (daysBetween(period.start, period.end) + 1 > MAX_PERIOD_DAYS) {
    throw Errors.invalidField('periodEnd', 'too_long', `A schedule can cover at most ${MAX_PERIOD_DAYS} days.`)
  }
}

/** The requested period, cut down to the contract's dates. An empty result means the contract does not run in that period. */
const clampToContract = (period: Period, contract: Pick<Contract, 'startDate' | 'endDate'>): Period => {
  const contractStart = fromDateOnly(contract.startDate)
  const contractEnd = contract.endDate ? fromDateOnly(contract.endDate) : null
  const clamped = {
    start: period.start > contractStart ? period.start : contractStart,
    end: contractEnd && period.end > contractEnd ? contractEnd : period.end
  }

  if (clamped.end < clamped.start) {
    throw Errors.unprocessable('The contract is not in effect during that period.', { contractStart, contractEnd })
  }

  return clamped
}

const assertSiteCovered = (contract: ContractWithTerms, siteId: string): void => {
  const covered = contract.lines.some(line => line.siteId === siteId) || contract.coverage.some(row => row.siteId === siteId)

  if (!covered) throw Errors.unprocessable('This contract has no services or coverage at that site.')
}

const overlapError = (scheduleId: string): AppError =>
  new AppError(409, 'SCHEDULE_OVERLAP', 'A schedule for this contract and site already covers part of that period.', { details: { context: { scheduleId } } })

/** Contract NUMBER (all versions) + site: a renegotiated version must not double-book the same days. CLOSED schedules don't count. */
const assertNoOverlap = async (tx: Prisma.TransactionClient, args: { orgId: string; contractNumber: string; siteId: string; period: Period; excludeScheduleId?: string }): Promise<void> => {
  const clash = await tx.schedule.findFirst({
    where: {
      orgId: args.orgId,
      siteId: args.siteId,
      status: { not: 'CLOSED' },
      periodStart: { lte: toDateOnly(args.period.end) },
      periodEnd: { gte: toDateOnly(args.period.start) },
      contract: { orgId: args.orgId, contractNumber: args.contractNumber },
      ...(args.excludeScheduleId ? { id: { not: args.excludeScheduleId } } : {})
    },
    orderBy: { periodStart: 'asc' },
    select: { id: true }
  })

  if (clash) throw overlapError(clash.id)
}

// ---------------------------------------------------------------------------
// Shift planning
// ---------------------------------------------------------------------------

/**
 * INTERVAL coverage counts from the local date of the latest non-cancelled shift of this contract number + site that
 * starts before the period, else from the contract start date.
 */
const intervalAnchor = async (tx: Prisma.TransactionClient, args: { orgId: string; contractNumber: string; siteId: string; period: Period; zone: string; contractStart: Date }): Promise<string> => {
  const previous = await tx.shift.findFirst({
    where: {
      orgId: args.orgId,
      siteId: args.siteId,
      status: { not: 'CANCELLED' },
      scheduledStart: { lt: zonedInstant(args.period.start, '00:00', args.zone) },
      schedule: { contract: { orgId: args.orgId, contractNumber: args.contractNumber } }
    },
    orderBy: { scheduledStart: 'desc' },
    select: { scheduledStart: true }
  })

  return previous ? localDate(previous.scheduledStart, args.zone) : fromDateOnly(args.contractStart)
}

const planShifts = async (
  tx: Prisma.TransactionClient,
  args: { contract: ContractWithTerms; siteId: string; period: Period; zone: string }
): Promise<{ snapshot: TermsSnapshot; windows: ShiftWindow[] }> => {
  const snapshot = buildTermsSnapshot(args.contract, args.contract.lines, args.contract.coverage, args.siteId, args.zone)
  const needsAnchor = snapshot.coverage.some(row => row.patternType === 'INTERVAL')

  const anchor = needsAnchor
    ? await intervalAnchor(tx, { orgId: args.contract.orgId, contractNumber: args.contract.contractNumber, siteId: args.siteId, period: args.period, zone: args.zone, contractStart: args.contract.startDate })
    : fromDateOnly(args.contract.startDate)

  return { snapshot, windows: generateWindows(snapshot.coverage, args.period, args.zone, anchor) }
}

const shiftRows = (args: { orgId: string; scheduleId: string; siteId: string; snapshot: TermsSnapshot; windows: ShiftWindow[]; createdById: string }): Prisma.ShiftCreateManyInput[] => {
  const defaults = shiftDefaults(args.snapshot)

  return args.windows.map(window => ({
    orgId: args.orgId,
    scheduleId: args.scheduleId,
    siteId: args.siteId,
    scheduledStart: window.start,
    scheduledEnd: window.end,
    status: 'OPEN',
    serviceRef: defaults.serviceRef,
    billableQty: defaults.billableQty,
    createdById: args.createdById
  }))
}

const assertValidSupervisor = async (ctx: AppContext, orgId: string, supervisorId: string): Promise<void> => {
  const supervisor = await ctx.prisma.user.findFirst({ where: { id: supervisorId, orgId, status: 'ACTIVE', role: { in: ['ADMIN', 'SUPERVISOR'] } }, select: { id: true } })

  if (!supervisor) throw Errors.invalidField('supervisorId', 'not_found', 'That supervisor does not exist.')
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

/**
 * Turns a contract's coverage into a DRAFT schedule with a frozen terms snapshot and OPEN shifts, all in one
 * transaction (5.3). The contract is re-read inside the transaction, so a contract suspended a moment ago cannot slip through.
 */
export const generateSchedule = async (ctx: AppContext, actor: Actor, input: GenerateInput, meta: ClientMeta) => {
  await assertSiteAccess(ctx, actor, input.siteId)

  const requested: Period = { start: input.periodStart, end: input.periodEnd }

  validateRequestedPeriod(requested)

  const supervisorId = input.supervisorId ?? (actor.role === 'SUPERVISOR' ? actor.id : undefined)

  if (input.supervisorId) await assertValidSupervisor(ctx, actor.orgId, input.supervisorId)

  const { scheduleId, shiftCount } = await ctx.prisma.$transaction(async tx => {
    const contract = await tx.contract.findFirst({ where: { id: input.contractId, orgId: actor.orgId }, include: { lines: true, coverage: true } })

    if (!contract) throw Errors.notFound('contract')
    if (contract.status !== 'ACTIVE') throw new AppError(409, 'CONTRACT_NOT_ACTIVE', 'Schedules can only be generated from an active contract.', { details: { entity: 'contract', from: contract.status } })

    assertSiteCovered(contract, input.siteId)

    const period = clampToContract(requested, contract)
    const zone = await siteTimezone(tx, actor.orgId, input.siteId)

    await lockGeneration(tx, actor.orgId, contract.contractNumber, input.siteId)
    await assertNoOverlap(tx, { orgId: actor.orgId, contractNumber: contract.contractNumber, siteId: input.siteId, period })

    const { snapshot, windows } = await planShifts(tx, { contract, siteId: input.siteId, period, zone })

    const schedule = await tx.schedule.create({
      data: {
        orgId: actor.orgId,
        contractId: contract.id,
        siteId: input.siteId,
        supervisorId,
        periodStart: toDateOnly(period.start),
        periodEnd: toDateOnly(period.end),
        status: 'DRAFT',
        termsSnapshot: snapshot,
        contractVersion: contract.version
      }
    })

    await tx.shift.createMany({ data: shiftRows({ orgId: actor.orgId, scheduleId: schedule.id, siteId: input.siteId, snapshot, windows, createdById: actor.id }) })

    await recordAudit(tx, actor, {
      entity: 'schedule',
      entityId: schedule.id,
      action: 'generated',
      diff: {
        contractId: contract.id,
        contractNumber: contract.contractNumber,
        contractVersion: contract.version,
        siteId: input.siteId,
        periodStart: period.start,
        periodEnd: period.end,
        requestedStart: requested.start,
        requestedEnd: requested.end,
        shiftCount: windows.length
      },
      meta
    })

    return { scheduleId: schedule.id, shiftCount: windows.length }
  }, TRANSACTION_OPTIONS)

  return { schedule: await presentSchedule(ctx, actor, scheduleId), shiftCount }
}

// ---------------------------------------------------------------------------
// Regenerate
// ---------------------------------------------------------------------------

/**
 * DRAFT only: re-snapshots from the newest ACTIVE version of the schedule's contract number and rebuilds every shift.
 * Assignments on the old shifts are discarded (the audit row records how many), so this is a deliberate reset.
 */
export const regenerateSchedule = async (ctx: AppContext, actor: Actor, scheduleId: string, meta: ClientMeta) => {
  await assertScheduleVisible(ctx, actor, scheduleId)

  const shiftCount = await ctx.prisma.$transaction(async tx => {
    await lockScheduleForUpdate(tx, scheduleId)

    const schedule = await tx.schedule.findFirst({ where: { id: scheduleId, orgId: actor.orgId }, include: { contract: { select: { contractNumber: true } } } })

    if (!schedule) throw Errors.notFound('schedule')

    if (schedule.status !== 'DRAFT') {
      throw new AppError(409, 'INVALID_STATE', 'Only a draft schedule can be regenerated.', { details: { entity: 'schedule', from: schedule.status, to: 'DRAFT', allowed: [] } })
    }

    const contract = await tx.contract.findFirst({
      where: { orgId: actor.orgId, contractNumber: schedule.contract.contractNumber, status: 'ACTIVE' },
      orderBy: { version: 'desc' },
      include: { lines: true, coverage: true }
    })

    if (!contract) throw new AppError(409, 'CONTRACT_NOT_ACTIVE', 'There is no active version of this contract to regenerate from.', { details: { entity: 'contract' } })

    assertSiteCovered(contract, schedule.siteId)

    const period = clampToContract({ start: fromDateOnly(schedule.periodStart), end: fromDateOnly(schedule.periodEnd) }, contract)
    const zone = await siteTimezone(tx, actor.orgId, schedule.siteId)

    await lockGeneration(tx, actor.orgId, contract.contractNumber, schedule.siteId)
    await assertNoOverlap(tx, { orgId: actor.orgId, contractNumber: contract.contractNumber, siteId: schedule.siteId, period, excludeScheduleId: schedule.id })

    const previousCount = await tx.shift.count({ where: { scheduleId } })
    const previousAssigned = await tx.shift.count({ where: { scheduleId, assignedUserId: { not: null } } })

    await tx.shift.deleteMany({ where: { scheduleId } })

    const { snapshot, windows } = await planShifts(tx, { contract, siteId: schedule.siteId, period, zone })

    await tx.schedule.update({
      where: { id: scheduleId },
      data: { contractId: contract.id, contractVersion: contract.version, periodStart: toDateOnly(period.start), periodEnd: toDateOnly(period.end), termsSnapshot: snapshot }
    })

    await tx.shift.createMany({ data: shiftRows({ orgId: actor.orgId, scheduleId, siteId: schedule.siteId, snapshot, windows, createdById: actor.id }) })

    await recordAudit(tx, actor, {
      entity: 'schedule',
      entityId: scheduleId,
      action: 'regenerated',
      diff: {
        fromVersion: parseTermsSnapshot(schedule.termsSnapshot).contractVersion,
        toVersion: contract.version,
        shiftsRemoved: previousCount,
        assignmentsDiscarded: previousAssigned,
        shiftCount: windows.length
      },
      meta
    })

    return windows.length
  }, TRANSACTION_OPTIONS)

  return { schedule: await presentSchedule(ctx, actor, scheduleId), shiftCount }
}
