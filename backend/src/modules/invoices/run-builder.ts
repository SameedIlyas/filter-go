import type { InvoiceLineSource, TimesheetStatus } from '../../generated/prisma/client.js'
import { Errors } from '../../lib/errors.js'
import { D, moneyRequired } from '../../lib/money.js'
import type { Decimal } from '../../lib/money.js'
import type { SnapshotItem, TermsSnapshot } from '../../lib/terms-snapshot.js'
import { hoursFromMinutes, priceLine } from './invoice-math.js'
import type { WindowShift } from './invoice-db.js'

/**
 * Turns the timesheet entries and contract snapshots of a period into invoice lines (docs/ARCHITECTURE.md 7.1).
 * Pure: it reads nothing but its arguments. Everything is priced from the schedule snapshot and the entry's
 * stamped bill rate, never from the live contract.
 */

export interface DraftLine {
  siteId: string
  siteName: string
  /** Shift start (ms) for ordering; null for fixed fees. */
  startedAt: number | null
  sourceType: InvoiceLineSource
  sourceId: string
  description: string
  qty: Decimal
  unitRate: Decimal
  taxCode: string | null
}

const UNAPPROVED: TimesheetStatus[] = ['OPEN', 'SUBMITTED', 'ADJUSTED', 'REJECTED', 'CORRECTED']

// A type alias (not an interface) so it is assignable to a Prisma JSON value
export type RunFlags = {
  unapprovedTimesheets: number
  noShows: number
}

/** Entries the period still waits on, and shifts nobody showed up for, so the admin can review before sending. */
export const computeFlags = (window: WindowShift[]): RunFlags => ({
  unapprovedTimesheets: window.filter(({ shift, entry }) => entry && UNAPPROVED.includes(entry.status) && shift.status !== 'NO_SHOW').length,
  noShows: window.filter(({ shift }) => shift.status === 'NO_SHOW').length
})

/** Approved, billable entries: the only ones that may be invoiced. */
export const billableWindow = (window: WindowShift[]): WindowShift[] =>
  window.filter(({ entry }) => entry !== null && entry.status === 'APPROVED' && entry.billable)

/** The item the timesheet approval priced the shift with: the shift's own line if it names one, else the site's first. */
const primaryLineId = (snapshot: TermsSnapshot, serviceRef: string | null): string | undefined =>
  snapshot.serviceItems.find(item => item.lineId === serviceRef)?.lineId ?? snapshot.serviceItems[0]?.lineId

const describe = (item: SnapshotItem, siteName: string, suffix: string): string => `${item.description} - ${siteName} - ${suffix}`

const requireStampedRate = (rate: Decimal | null, entryId: string): Decimal => {
  if (rate === null) throw Errors.unprocessable('An approved timesheet has no stamped bill rate, so it cannot be priced.', { timesheetEntryId: entryId })

  return rate
}

const requireItems = (snapshot: TermsSnapshot, entryId: string): SnapshotItem[] => {
  if (snapshot.serviceItems.length === 0) {
    throw Errors.unprocessable('A timesheet belongs to a schedule with no service items, so it cannot be priced.', { timesheetEntryId: entryId })
  }

  return snapshot.serviceItems
}

const entryLines = ({ shift, entry, snapshot, localDate }: WindowShift, siteName: string): DraftLine[] => {
  if (!entry || snapshot.billingType === 'MONTHLY_FIXED') return []

  const items = requireItems(snapshot, entry.id)
  const rate = requireStampedRate(entry.billRateSnapshot, entry.id)
  const primary = primaryLineId(snapshot, shift.serviceRef)
  const base = { siteId: shift.siteId, siteName, startedAt: shift.scheduledStart.getTime(), sourceType: 'TIMESHEET' as const, sourceId: entry.id }

  if (snapshot.billingType === 'HOURLY') {
    const item = items.find(candidate => candidate.lineId === primary) ?? items[0]

    if (!item) return []

    return [{ ...base, description: describe(item, siteName, localDate), qty: hoursFromMinutes(entry.actualMinutes ?? 0), unitRate: rate, taxCode: item.taxCode }]
  }

  // PER_VISIT: one line per service item of the site. The primary item is priced by the entry's stamp (and the shift's
  // own billable quantity when one was set), the additional items by the snapshot.
  return items.map(item => {
    const isPrimary = item.lineId === primary

    return {
      ...base,
      description: describe(item, siteName, localDate),
      qty: isPrimary && shift.billableQty !== null ? D(shift.billableQty) : D(item.qty),
      unitRate: isPrimary ? rate : D(item.billRate),
      taxCode: item.taxCode
    }
  })
}

export const buildTimesheetLines = (window: WindowShift[], siteNames: Map<string, string>): DraftLine[] =>
  billableWindow(window).flatMap(row => entryLines(row, siteNames.get(row.shift.siteId) ?? ''))

export interface ScheduleSnapshotRow {
  siteId: string
  periodStart: Date
  createdAt: Date
  snapshot: TermsSnapshot
}

/** Per site, the items of the newest schedule (by period, then creation) that overlaps the invoice period. */
export const latestItemsBySite = (rows: ScheduleSnapshotRow[]): Map<string, SnapshotItem[]> => {
  const newest = new Map<string, ScheduleSnapshotRow>()

  for (const row of rows) {
    const current = newest.get(row.siteId)
    const newer =
      !current ||
      row.periodStart.getTime() > current.periodStart.getTime() ||
      (row.periodStart.getTime() === current.periodStart.getTime() && row.createdAt.getTime() > current.createdAt.getTime())

    if (newer) newest.set(row.siteId, row)
  }

  return new Map([...newest].map(([siteId, row]) => [siteId, row.snapshot.serviceItems]))
}

/** The documented fallback when a site has no schedule in the period: the live ACTIVE contract's line, in snapshot shape. */
export const liveLineAsItem = (line: { id: string; siteId: string; serviceId: string | null; description: string; qty: Decimal; billRate: Decimal; payRate: Decimal | null; estMinutes: number | null; taxCode: string | null }): SnapshotItem => ({
  lineId: line.id,
  siteId: line.siteId,
  serviceId: line.serviceId,
  description: line.description,
  qty: D(line.qty).toFixed(2),
  billRate: moneyRequired(line.billRate),
  payRate: line.payRate ? moneyRequired(line.payRate) : null,
  estMinutes: line.estMinutes,
  taxCode: line.taxCode
})

/** Monthly-fixed: qty * billRate once per contract line per run, whatever the visits. */
export const buildFixedLines = (itemsBySite: Map<string, SnapshotItem[]>, siteNames: Map<string, string>, periodLabel: string): DraftLine[] =>
  [...itemsBySite].flatMap(([siteId, items]) =>
    items.map(item => ({
      siteId,
      siteName: siteNames.get(siteId) ?? '',
      startedAt: null,
      sourceType: 'CONTRACT_LINE' as const,
      sourceId: item.lineId,
      description: describe(item, siteNames.get(siteId) ?? '', periodLabel),
      qty: D(item.qty),
      unitRate: D(item.billRate),
      taxCode: item.taxCode
    }))
  )

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** By site name, then shift start (fixed fees after the visits), then the order they were built in. */
export const sortLines = (lines: DraftLine[]): DraftLine[] =>
  lines
    .map((line, position) => ({ line, position }))
    .sort(
      (a, b) =>
        compareText(a.line.siteName, b.line.siteName) ||
        compareText(a.line.siteId, b.line.siteId) ||
        (a.line.startedAt ?? Number.MAX_SAFE_INTEGER) - (b.line.startedAt ?? Number.MAX_SAFE_INTEGER) ||
        a.position - b.position
    )
    .map(({ line }) => line)

export interface PricedDraftLine extends DraftLine {
  amount: Decimal
  taxAmount: Decimal
}

export const priceDraftLines = (lines: DraftLine[], ratePercentOf: (taxCode: string | null) => Decimal | null): PricedDraftLine[] =>
  lines.map(line => ({ ...line, ...priceLine(line.qty, line.unitRate, ratePercentOf(line.taxCode)) }))
