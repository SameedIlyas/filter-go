import type { Invoice, Prisma, Shift, TimesheetEntry } from '../../generated/prisma/client.js'
import { Errors } from '../../lib/errors.js'
import type { Decimal } from '../../lib/money.js'
import type { Db } from '../../lib/prisma.js'
import { parseTermsSnapshot } from '../../lib/terms-snapshot.js'
import type { TermsSnapshot } from '../../lib/terms-snapshot.js'
import { fromDateOnly, localDate, toDateOnly } from '../../lib/time.js'
import { assertTotalsFit, totalsOf } from './invoice-math.js'
import type { Totals } from './invoice-math.js'

type Tx = Prisma.TransactionClient

const DAY_MS = 24 * 60 * 60 * 1000

/** Row lock on the invoice: every mutation of one invoice is serialised, so a double submit sees the finished state. */
export const lockInvoice = async (tx: Tx, orgId: string, id: string): Promise<Invoice> => {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM invoices WHERE id = ${id} AND "orgId" = ${orgId} FOR UPDATE`

  if (rows.length === 0) throw Errors.notFound('invoice')

  // A separate statement: it starts after the lock was granted, so it reads the latest committed row
  return tx.invoice.findUniqueOrThrow({ where: { id } })
}

/** Row lock on the contract: two invoice runs for the same contract can never interleave. */
export const lockContract = async (tx: Tx, orgId: string, id: string) => {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM contracts WHERE id = ${id} AND "orgId" = ${orgId} FOR UPDATE`

  if (rows.length === 0) throw Errors.notFound('contract')

  return tx.contract.findUniqueOrThrow({ where: { id } })
}

/** Percentages for the given tax codes, only those that exist. */
export const findTaxRates = async (db: Db, orgId: string, codes: Array<string | null>): Promise<Map<string, Decimal>> => {
  const unique = [...new Set(codes.filter((code): code is string => code !== null))]

  if (unique.length === 0) return new Map()

  const rows = await db.taxRate.findMany({ where: { orgId, code: { in: unique } }, select: { code: true, ratePercent: true } })

  return new Map(rows.map(row => [row.code, row.ratePercent]))
}

/** Percentage for a line's tax code: null for "no tax code"; an unknown code is refused, never silently taxed at 0. */
export const ratePercentFor = (rates: Map<string, Decimal>, code: string | null): Decimal | null => {
  if (code === null) return null

  const rate = rates.get(code)

  if (rate === undefined) throw Errors.unprocessable(`Tax code "${code}" does not exist. Create it under tax rates and run again.`, { taxCode: code })

  return rate
}

/** Re-derives the header totals from the stored lines (the lines are the truth) and saves them. */
export const recomputeInvoiceTotals = async (tx: Tx, invoiceId: string): Promise<Totals> => {
  const lines = await tx.invoiceLine.findMany({ where: { invoiceId }, select: { amount: true, taxAmount: true } })
  const totals = totalsOf(lines)

  assertTotalsFit(totals)

  await tx.invoice.update({ where: { id: invoiceId }, data: { subtotal: totals.subtotal, tax: totals.tax, total: totals.total } })

  return totals
}

export interface WindowShift {
  shift: Shift
  entry: TimesheetEntry | null
  snapshot: TermsSnapshot
  /** The shift's start as a calendar date in the site's timezone. */
  localDate: string
}

/**
 * Every shift of the contract's schedules whose local start date (site timezone from the schedule snapshot) lies in
 * [start, end], with its timesheet entry. The UTC query is widened by a day each side and then filtered by local date,
 * so shifts near midnight land in the right period whatever the offset.
 */
export const loadWindowShifts = async (db: Db, orgId: string, contractId: string, start: string, end: string): Promise<WindowShift[]> => {
  const shifts = await db.shift.findMany({
    where: {
      orgId,
      schedule: { contractId, orgId },
      scheduledStart: { gte: new Date(toDateOnly(start).getTime() - DAY_MS), lt: new Date(toDateOnly(end).getTime() + 2 * DAY_MS) }
    },
    include: { timesheet: true },
    orderBy: [{ scheduledStart: 'asc' }, { id: 'asc' }]
  })

  if (shifts.length === 0) return []

  const scheduleIds = [...new Set(shifts.map(shift => shift.scheduleId))]
  const schedules = await db.schedule.findMany({ where: { id: { in: scheduleIds }, orgId }, select: { id: true, termsSnapshot: true } })
  const snapshots = new Map(schedules.map(schedule => [schedule.id, parseTermsSnapshot(schedule.termsSnapshot)]))

  return shifts.flatMap(({ timesheet, ...shift }) => {
    const snapshot = snapshots.get(shift.scheduleId)

    if (!snapshot) return []

    const date = localDate(shift.scheduledStart, snapshot.siteTimezone)

    return date >= start && date <= end ? [{ shift, entry: timesheet, snapshot, localDate: date }] : []
  })
}

/**
 * Returns to APPROVED the entries an invoice had taken (status INVOICED, in its contract and period), so they can be
 * billed again. Conditional on INVOICED and never touches an entry another live invoice still bills. Two live invoices
 * of one contract can never overlap (the run refuses it), so the period identifies the invoice's entries even for
 * monthly-fixed invoices, which carry no timesheet lines.
 */
export const releaseInvoiceEntries = async (tx: Tx, invoice: Invoice): Promise<number> => {
  const window = await loadWindowShifts(tx, invoice.orgId, invoice.contractId, fromDateOnly(invoice.periodStart), fromDateOnly(invoice.periodEnd))
  const taken = window.flatMap(({ entry }) => (entry && entry.status === 'INVOICED' && entry.billable ? [entry.id] : []))

  if (taken.length === 0) return 0

  const elsewhere = await tx.invoiceLine.findMany({
    where: { sourceType: 'TIMESHEET', sourceId: { in: taken }, invoiceId: { not: invoice.id }, invoice: { status: { not: 'VOID' } } },
    select: { sourceId: true }
  })
  const held = new Set(elsewhere.map(line => line.sourceId))
  const releasable = taken.filter(id => !held.has(id))

  if (releasable.length === 0) return 0

  const released = await tx.timesheetEntry.updateMany({
    where: { id: { in: releasable }, orgId: invoice.orgId, status: 'INVOICED' },
    data: { status: 'APPROVED' }
  })

  return released.count
}

/** After a line was deleted: its timesheet entry goes back to APPROVED unless another line of the invoice still bills it. */
export const releaseEntryOfRemovedLine = async (tx: Tx, invoice: Invoice, line: { sourceType: string; sourceId: string | null }): Promise<void> => {
  if (line.sourceType !== 'TIMESHEET' || !line.sourceId) return

  const remaining = await tx.invoiceLine.count({ where: { invoiceId: invoice.id, sourceType: 'TIMESHEET', sourceId: line.sourceId } })

  if (remaining > 0) return

  await tx.timesheetEntry.updateMany({ where: { id: line.sourceId, orgId: invoice.orgId, status: 'INVOICED' }, data: { status: 'APPROVED' } })
}
