import type { ClientMeta } from '../../context.js'
import type { AppContext } from '../../context.js'
import type { Contract, Invoice, PaymentTerms, Prisma } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { AppError, Errors } from '../../lib/errors.js'
import { parseTermsSnapshot } from '../../lib/terms-snapshot.js'
import type { SnapshotItem } from '../../lib/terms-snapshot.js'
import { addDays, daysBetween, fromDateOnly, localDate, toDateOnly } from '../../lib/time.js'
import { recordAudit } from '../audit/record.js'
import { formatNumber, nextSequence } from '../audit/sequence.js'
import { findTaxRates, loadWindowShifts, lockContract, ratePercentFor } from './invoice-db.js'
import type { WindowShift } from './invoice-db.js'
import { assertTotalsFit, totalsOf } from './invoice-math.js'
import {
  billableWindow,
  buildFixedLines,
  buildTimesheetLines,
  computeFlags,
  latestItemsBySite,
  liveLineAsItem,
  priceDraftLines,
  sortLines
} from './run-builder.js'
import type { PricedDraftLine, RunFlags } from './run-builder.js'

type Tx = Prisma.TransactionClient

export const MAX_RUN_DAYS = 366

const DUE_DAYS: Record<PaymentTerms, number> = { NET15: 15, NET30: 30, DUE_ON_RECEIPT: 0 }

export interface RunInput {
  contractId: string
  periodStart: string
  periodEnd: string
}

/** A run never starts on a contract that has not been agreed yet. */
const assertBillable = (contract: Contract): void => {
  if (contract.status === 'DRAFT' || contract.status === 'PENDING_SIGNATURE') {
    throw new AppError(409, 'CONTRACT_NOT_ACTIVE', 'This contract has not been signed yet, so it cannot be invoiced.', {
      details: { entity: 'contract', from: contract.status }
    })
  }
}

/** One live invoice per contract and day: an overlapping period would bill the same work (or the same monthly fee) twice. */
const assertNoOverlap = async (tx: Tx, contract: Contract, input: RunInput): Promise<void> => {
  const overlapping = await tx.invoice.findFirst({
    where: {
      orgId: contract.orgId,
      contractId: contract.id,
      status: { not: 'VOID' },
      periodStart: { lte: toDateOnly(input.periodEnd) },
      periodEnd: { gte: toDateOnly(input.periodStart) }
    },
    select: { id: true, invoiceNumber: true }
  })

  if (overlapping) {
    throw new AppError(409, 'DUPLICATE', `Invoice ${overlapping.invoiceNumber} already covers part of this period. Void it first to run again.`, {
      details: { entity: 'invoice', context: { invoiceId: overlapping.id, invoiceNumber: overlapping.invoiceNumber } }
    })
  }
}

/** Sites and their names for everything the run touches, in one query. */
const loadSiteNames = async (tx: Tx, orgId: string, siteIds: string[]): Promise<Map<string, string>> => {
  const sites = await tx.site.findMany({ where: { id: { in: [...new Set(siteIds)] }, orgId }, select: { id: true, name: true } })

  return new Map(sites.map(site => [site.id, site.name]))
}

/**
 * The fixed fees of a monthly-fixed contract: per site, the items of the latest schedule snapshot in the period; for a
 * site without any schedule in the period, the live lines of an ACTIVE contract (the one documented use of live lines).
 */
const fixedItemsBySite = async (tx: Tx, contract: Contract, input: RunInput): Promise<Map<string, SnapshotItem[]>> => {
  const schedules = await tx.schedule.findMany({
    where: {
      orgId: contract.orgId,
      contractId: contract.id,
      periodStart: { lte: toDateOnly(input.periodEnd) },
      periodEnd: { gte: toDateOnly(input.periodStart) }
    },
    select: { siteId: true, periodStart: true, createdAt: true, termsSnapshot: true }
  })
  const fromSnapshots = latestItemsBySite(schedules.map(row => ({ ...row, snapshot: parseTermsSnapshot(row.termsSnapshot) })))

  if (contract.status !== 'ACTIVE') return fromSnapshots

  const live = await tx.contractLine.findMany({ where: { contractId: contract.id }, orderBy: { id: 'asc' } })
  const uncovered = live.filter(line => !fromSnapshots.has(line.siteId))

  return uncovered.reduce((merged, line) => {
    const item = liveLineAsItem(line)

    return new Map([...merged, [line.siteId, [...(merged.get(line.siteId) ?? []), item]]])
  }, fromSnapshots)
}

/** Every line of the run, priced and ordered, plus the entries it will take. */
const buildRun = async (tx: Tx, contract: Contract, window: WindowShift[], input: RunInput) => {
  const siteIds = window.map(row => row.shift.siteId)
  const fixed = contract.billingType === 'MONTHLY_FIXED' ? await fixedItemsBySite(tx, contract, input) : new Map<string, SnapshotItem[]>()
  const siteNames = await loadSiteNames(tx, contract.orgId, [...siteIds, ...fixed.keys()])
  const draft = sortLines([...buildTimesheetLines(window, siteNames), ...buildFixedLines(fixed, siteNames, `${input.periodStart} to ${input.periodEnd}`)])
  const rates = await findTaxRates(tx, contract.orgId, draft.map(line => line.taxCode))
  const lines = priceDraftLines(draft, code => ratePercentFor(rates, code))

  return { lines, entryIds: billableWindow(window).flatMap(row => (row.entry ? [row.entry.id] : [])) }
}

const lineRow = (line: PricedDraftLine) => ({
  siteId: line.siteId,
  sourceType: line.sourceType,
  sourceId: line.sourceId,
  description: line.description,
  qty: line.qty,
  unitRate: line.unitRate,
  amount: line.amount,
  taxCode: line.taxCode,
  taxAmount: line.taxAmount
})

const createInvoiceRow = async (tx: Tx, actor: Actor, contract: Contract, input: RunInput, lines: PricedDraftLine[], flags: RunFlags): Promise<Invoice> => {
  const [org, client] = await Promise.all([
    tx.organization.findUniqueOrThrow({ where: { id: contract.orgId }, select: { timezone: true } }),
    tx.client.findUniqueOrThrow({ where: { id: contract.clientId }, select: { paymentTerms: true } })
  ])
  const issueDate = localDate(new Date(), org.timezone)
  const year = Number(issueDate.slice(0, 4))
  const sequence = await nextSequence(tx, contract.orgId, `invoice-${year}`)
  const totals = totalsOf(lines)

  assertTotalsFit(totals)

  return tx.invoice.create({
    data: {
      orgId: contract.orgId,
      clientId: contract.clientId,
      contractId: contract.id,
      invoiceNumber: formatNumber('INV', year, sequence),
      periodStart: toDateOnly(input.periodStart),
      periodEnd: toDateOnly(input.periodEnd),
      issueDate: toDateOnly(issueDate),
      dueDate: toDateOnly(addDays(issueDate, DUE_DAYS[client.paymentTerms])),
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      flags,
      createdById: actor.id,
      lines: { create: lines.map(lineRow) }
    }
  })
}

/** Takes the entries out of circulation. All of them or none: a concurrent taker aborts the whole run. */
const takeEntries = async (tx: Tx, orgId: string, entryIds: string[]): Promise<void> => {
  if (entryIds.length === 0) return

  const taken = await tx.timesheetEntry.updateMany({
    where: { id: { in: entryIds }, orgId, status: 'APPROVED', billable: true },
    data: { status: 'INVOICED' }
  })

  if (taken.count !== entryIds.length) {
    throw Errors.conflict('Some timesheets were invoiced by another run in the meantime. Try again.')
  }
}

const assertPeriod = (input: RunInput): void => {
  if (input.periodEnd < input.periodStart) throw Errors.invalidField('periodEnd', 'before_start', 'The period cannot end before it starts.')

  if (daysBetween(input.periodStart, input.periodEnd) + 1 > MAX_RUN_DAYS) {
    throw Errors.invalidField('periodEnd', 'too_long', `An invoice period cannot be longer than ${MAX_RUN_DAYS} days.`)
  }
}

/**
 * The invoice run (docs/ARCHITECTURE.md 7.1), one transaction. The contract row lock serialises runs of one contract, so
 * two simultaneous requests produce one invoice and one DUPLICATE (409); the entries are then taken with a conditional
 * update as a second line of defence.
 */
export const createInvoiceRun = async (ctx: AppContext, actor: Actor, input: RunInput, meta?: ClientMeta): Promise<Invoice> => {
  assertPeriod(input)

  return ctx.prisma.$transaction(
    async tx => {
      const contract = await lockContract(tx, actor.orgId, input.contractId)

      assertBillable(contract)
      await assertNoOverlap(tx, contract, input)

      const window = await loadWindowShifts(tx, actor.orgId, contract.id, input.periodStart, input.periodEnd)
      const { lines, entryIds } = await buildRun(tx, contract, window, input)

      const flags = computeFlags(window)

      if (lines.length === 0) {
        throw new AppError(422, 'NOTHING_TO_INVOICE', 'There is nothing billable in this period: no approved billable timesheets and no fixed fees.', {
          details: { context: { ...flags } }
        })
      }

      const invoice = await createInvoiceRow(tx, actor, contract, input, lines, flags)

      await takeEntries(tx, actor.orgId, entryIds)
      await recordAudit(tx, actor, {
        entity: 'invoice',
        entityId: invoice.id,
        action: 'run_created',
        diff: {
          invoiceNumber: invoice.invoiceNumber,
          contractId: contract.id,
          periodStart: fromDateOnly(invoice.periodStart),
          periodEnd: fromDateOnly(invoice.periodEnd),
          lines: lines.length,
          timesheets: entryIds.length,
          total: invoice.total.toFixed(2),
          flags
        },
        meta
      })

      return invoice
    },
    { timeout: 60_000, maxWait: 15_000 }
  )
}
