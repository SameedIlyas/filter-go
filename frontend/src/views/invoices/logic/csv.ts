import type { InvoiceSummary, InvoiceTrace, TraceLine } from '@/types/invoiceTypes'

import { safeText, toCsv } from '@/utils/csv'

import { STATUS_LABEL } from './labels'

/** The invoice list as CSV, one row per invoice: what the UAT "Export" button gives accounts. */
export const invoicesCsv = (rows: InvoiceSummary[]): string =>
  toCsv([
    [
      'Invoice number',
      'Client',
      'Contract',
      'Status',
      'Issue date',
      'Due date',
      'Period start',
      'Period end',
      'Subtotal',
      'Tax',
      'Total',
      'Paid',
      'Balance',
      'Sent at',
      'Paid at'
    ],
    ...rows.map(row => [
      row.invoiceNumber,
      safeText(row.client.legalName),
      safeText(`${row.contract.contractNumber} v${row.contract.version}`),
      STATUS_LABEL[row.status],
      row.issueDate,
      row.dueDate,
      row.periodStart,
      row.periodEnd,
      row.subtotal,
      row.tax,
      row.total,
      row.amountPaid,
      row.balance,
      row.sentAt ?? '',
      row.paidAt ?? ''
    ])
  ])

/** "2026-10-01 18:01" in the given timezone, or empty. */
const stamp = (instant: string | null | undefined, zone: string): string => {
  if (!instant) return ''

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(instant))

  const part = (type: string) => parts.find(item => item.type === type)?.value ?? ''

  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`
}

const hours = (minutes: number | null | undefined): string =>
  minutes === null || minutes === undefined ? '' : (minutes / 60).toFixed(2)

const SOURCE_LABEL: Record<TraceLine['sourceType'], string> = {
  TIMESHEET: 'Timesheet',
  SHIFT: 'Visit',
  CONTRACT_LINE: 'Fixed fee',
  MANUAL: 'Manual'
}

export type ReconciliationInvoice = {
  invoice: Pick<InvoiceSummary, 'invoiceNumber' | 'client' | 'status'>
  trace: InvoiceTrace
}

/**
 * Invoice reconciliation: every billed line next to the work behind it (worker, shift, clock stamps, hours), so a
 * charge can be checked against the timesheet it came from. Times are in `zone` (the organization's timezone).
 */
export const reconciliationCsv = (invoices: ReconciliationInvoice[], zone: string): string =>
  toCsv([
    [
      'Invoice number',
      'Client',
      'Invoice status',
      'Source',
      'Description',
      'Site',
      'Worker',
      'Scheduled start',
      'Scheduled end',
      'Clock in',
      'Clock out',
      'Break (min)',
      'Scheduled hours',
      'Worked hours',
      'Timesheet status',
      'Qty',
      'Unit rate',
      'Amount',
      'Tax'
    ],
    ...invoices.flatMap(({ invoice, trace }) =>
      trace.lines.map(line => [
        invoice.invoiceNumber,
        safeText(invoice.client.legalName),
        STATUS_LABEL[invoice.status],
        SOURCE_LABEL[line.sourceType],
        safeText(line.description),
        safeText(line.shift?.siteName ?? ''),
        safeText(line.timesheet?.worker.name ?? ''),
        stamp(line.shift?.scheduledStart, zone),
        stamp(line.shift?.scheduledEnd, zone),
        stamp(line.timesheet?.clockIn?.at, zone),
        stamp(line.timesheet?.clockOut?.at, zone),
        line.timesheet ? String(line.timesheet.breakMinutes) : '',
        hours(line.timesheet?.scheduledMinutes),
        hours(line.timesheet?.actualMinutes),
        line.timesheet?.status ?? '',
        line.qty,
        line.unitRate,
        line.amount,
        line.taxAmount
      ])
    )
  ])
