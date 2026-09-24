import type { InvoiceStatus } from '../../generated/prisma/client.js'
import { AppError, Errors } from '../../lib/errors.js'

/**
 * Invoice status machine (docs/ARCHITECTURE.md 7.5):
 *   DRAFT -> APPROVED -> SYNCED -> SENT -> PARTIALLY_PAID -> PAID
 * SYNCED may take a payment directly (offline payment before the invoice is emailed), SENT may go straight to PAID,
 * and VOID is reachable from DRAFT, APPROVED, SYNCED and SENT (never once money has been received).
 */
export const TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ['APPROVED', 'VOID'],
  APPROVED: ['SYNCED', 'VOID'],
  SYNCED: ['SENT', 'PARTIALLY_PAID', 'PAID', 'VOID'],
  SENT: ['PARTIALLY_PAID', 'PAID', 'VOID'],
  PARTIALLY_PAID: ['PAID'],
  PAID: [],
  VOID: []
}

export const assertTransition = (from: InvoiceStatus, to: InvoiceStatus): void => {
  if (!TRANSITIONS[from].includes(to)) throw Errors.invalidState('invoice', from, to, TRANSITIONS[from])
}

/** States in which money may be received (a partial payment keeps PARTIALLY_PAID, so it is not an edge of the table). */
export const PAYABLE_STATUSES: InvoiceStatus[] = ['SYNCED', 'SENT', 'PARTIALLY_PAID']

/** What a client user of the invoice's client may see: never DRAFT, never VOID. */
export const CLIENT_VISIBLE_STATUSES: InvoiceStatus[] = ['APPROVED', 'SYNCED', 'SENT', 'PARTIALLY_PAID', 'PAID']

/** Money is immutable after approval, so every edit is DRAFT-only. */
export const assertEditable = (status: InvoiceStatus): void => {
  if (status !== 'DRAFT') {
    throw new AppError(409, 'INVOICE_NOT_EDITABLE', 'Only a draft invoice can be edited. Approved invoices are immutable: void and re-run instead.', {
      details: { entity: 'invoice', from: status }
    })
  }
}
