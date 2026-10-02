import type { InvoiceStatus, InvoiceSummary } from '@/types/invoiceTypes'

/** What the admin may do with an invoice right now. Mirrors backend invoice-state.ts; the server still has the last word. */
export type InvoiceActions = {

  /** Due date, notes and lines: only a draft's money can change. */
  edit: boolean
  approve: boolean

  /** Why approval would be refused, when it would be. */
  approveBlocked: string | null
  send: boolean
  pay: boolean
  void: boolean

  /** Why voiding is off for a live invoice (money received), when it is. */
  voidBlocked: string | null
  remove: boolean
  retrySync: boolean
}

const PAYABLE: InvoiceStatus[] = ['SYNCED', 'SENT', 'PARTIALLY_PAID']
const VOIDABLE: InvoiceStatus[] = ['DRAFT', 'APPROVED', 'SYNCED', 'SENT']

type ActionInput = Pick<InvoiceSummary, 'status' | 'total' | 'amountPaid' | 'balance' | 'sync'> & { lineCount?: number }

const NONE: InvoiceActions = {
  edit: false,
  approve: false,
  approveBlocked: null,
  send: false,
  pay: false,
  void: false,
  voidBlocked: null,
  remove: false,
  retrySync: false
}

export const invoiceActions = (invoice: ActionInput, isAdmin: boolean): InvoiceActions => {
  if (!isAdmin) return NONE

  const draft = invoice.status === 'DRAFT'
  const hasMoney = Number(invoice.amountPaid) > 0
  const empty = invoice.lineCount === 0 || Number(invoice.total) <= 0

  return {
    edit: draft,
    approve: draft && !empty,
    approveBlocked: draft && empty ? 'Add at least one line with an amount before approving.' : null,
    send: invoice.status === 'SYNCED',
    pay: PAYABLE.includes(invoice.status) && Number(invoice.balance) > 0,
    void: VOIDABLE.includes(invoice.status) && !hasMoney,
    voidBlocked:
      VOIDABLE.includes(invoice.status) && hasMoney
        ? 'A payment has been recorded, so it can no longer be voided.'
        : null,
    remove: draft,
    retrySync: invoice.sync?.accounting.state === 'DEAD' || invoice.sync?.payment.state === 'DEAD'
  }
}

/** The next thing that should happen to an invoice, in words, for the drawer's banner. */
export const nextStep = (invoice: Pick<InvoiceSummary, 'status' | 'sync'>): string | null => {
  if (invoice.sync?.accounting.state === 'DEAD')
    return 'The accounting sync failed. Retry it once the problem is fixed.'
  if (invoice.sync?.payment.state === 'DEAD') return 'Creating the pay link failed. Retry it once the problem is fixed.'

  switch (invoice.status) {
    case 'DRAFT':
      return 'Check the lines, then approve. Approving locks the amounts and syncs the invoice to accounting.'
    case 'APPROVED':
      return 'Syncing to accounting…'
    case 'SYNCED':
      return invoice.sync?.payment.state === 'PENDING'
        ? 'Creating the pay link and emailing the client…'
        : 'In accounting. Send it to email the client a pay link.'
    case 'SENT':
    case 'PARTIALLY_PAID':
      return 'Waiting for payment. Card payments are recorded automatically; record cheques and transfers here.'
    default:
      return null
  }
}
