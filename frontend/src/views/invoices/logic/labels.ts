import type { InvoiceStatus } from '@/types/invoiceTypes'

/** Statuses in lifecycle order, for filters. */
export const INVOICE_STATUSES: InvoiceStatus[] = [
  'DRAFT',
  'APPROVED',
  'SYNCED',
  'SENT',
  'PARTIALLY_PAID',
  'PAID',
  'VOID'
]

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: 'Draft',
  APPROVED: 'Approved',
  SYNCED: 'In accounting',
  SENT: 'Sent',
  PARTIALLY_PAID: 'Partly paid',
  PAID: 'Paid',
  VOID: 'Void'
}
