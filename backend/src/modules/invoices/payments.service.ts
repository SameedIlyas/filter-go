import type { AppContext, ClientMeta } from '../../context.js'
import type { Invoice, InvoiceStatus, Payment, Prisma } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { AppError, Errors } from '../../lib/errors.js'
import type { Decimal } from '../../lib/money.js'
import { enqueue } from '../../jobs/outbox.js'
import { recordAudit } from '../audit/record.js'
import { lockInvoice } from './invoice-db.js'
import { assertTransition, PAYABLE_STATUSES, TRANSITIONS } from './invoice-state.js'
import { JOB_TYPES, syncKeys } from './sync-state.js'

type Tx = Prisma.TransactionClient

/**
 * The one code path that puts money on an invoice: manual payments from the admin and Stripe payments from the
 * webhook both go through `applyPayment`. It runs inside the caller's transaction, under the invoice row lock, so
 * `amountPaid` can never be lost to a concurrent payment and an invoice can never be overpaid.
 */

export interface PaymentInput {
  orgId: string
  invoiceId: string
  /** null = the whole outstanding balance (a provider event that carries no amount). */
  amount: Decimal | null
  method: string
  receivedAt: Date
  /** Provider payment id / bank reference. A repeated (invoice, reference) is recorded once. */
  externalRef: string | null
  /** null = the system (webhook). */
  actor: Actor | null
  meta?: ClientMeta
}

export type PaymentOutcome =
  | { kind: 'applied'; payment: Payment; invoice: Invoice }
  | { kind: 'duplicate' }
  | { kind: 'rejected'; reason: 'not_payable' | 'overpayment'; invoice: Invoice; outstanding: Decimal; amount: Decimal }

const nextStatus = (invoice: Invoice, amountPaid: Decimal): InvoiceStatus => (amountPaid.gte(invoice.total) ? 'PAID' : 'PARTIALLY_PAID')

export const applyPayment = async (tx: Tx, input: PaymentInput): Promise<PaymentOutcome> => {
  const invoice = await lockInvoice(tx, input.orgId, input.invoiceId)

  if (input.externalRef !== null) {
    const existing = await tx.payment.findFirst({ where: { invoiceId: invoice.id, externalRef: input.externalRef }, select: { id: true } })

    if (existing) return { kind: 'duplicate' }
  }

  const outstanding = invoice.total.minus(invoice.amountPaid)
  const amount = input.amount ?? outstanding

  if (!PAYABLE_STATUSES.includes(invoice.status)) return { kind: 'rejected', reason: 'not_payable', invoice, outstanding, amount }
  if (amount.gt(outstanding)) return { kind: 'rejected', reason: 'overpayment', invoice, outstanding, amount }

  const payment = await tx.payment.create({
    data: {
      orgId: input.orgId,
      invoiceId: invoice.id,
      amount,
      method: input.method,
      externalRef: input.externalRef,
      receivedAt: input.receivedAt,
      recordedById: input.actor?.id ?? null
    }
  })
  const amountPaid = invoice.amountPaid.plus(amount)
  const status = nextStatus(invoice, amountPaid)

  // PARTIALLY_PAID -> PARTIALLY_PAID is not a transition, just another payment
  if (status !== invoice.status) assertTransition(invoice.status, status)

  const updated = await tx.invoice.updateMany({
    where: { id: invoice.id, status: invoice.status, amountPaid: invoice.amountPaid },
    data: { amountPaid, status, ...(status === 'PAID' ? { paidAt: input.receivedAt } : {}) }
  })

  if (updated.count !== 1) throw Errors.conflict('The invoice changed while the payment was being recorded. Try again.')

  await enqueue(tx, {
    orgId: input.orgId,
    type: JOB_TYPES.postPayment,
    payload: { invoiceId: invoice.id, paymentId: payment.id },
    dedupeKey: syncKeys.payment(invoice.id, payment.id)
  })
  await recordPaymentAudit(tx, input, invoice, payment, status, amountPaid)

  return { kind: 'applied', payment, invoice: { ...invoice, amountPaid, status } }
}

const recordPaymentAudit = async (tx: Tx, input: PaymentInput, invoice: Invoice, payment: Payment, status: InvoiceStatus, amountPaid: Decimal): Promise<void> => {
  const base = { orgId: input.orgId, entity: 'invoice', entityId: invoice.id, meta: input.meta }

  await recordAudit(tx, input.actor, {
    ...base,
    action: 'payment_recorded',
    diff: { paymentId: payment.id, amount: payment.amount.toFixed(2), method: payment.method, externalRef: payment.externalRef, amountPaid: amountPaid.toFixed(2), status }
  })

  if (status === 'PAID') {
    await recordAudit(tx, input.actor, { ...base, action: 'paid', diff: { invoiceNumber: invoice.invoiceNumber, total: invoice.total.toFixed(2) } })
  }
}

export interface ManualPaymentInput {
  amount: Decimal
  method: string
  receivedAt: Date
  externalRef: string | null
}

/** Admin-recorded payment (bank transfer, cheque, cash). Refuses what cannot be applied instead of half-applying it. */
export const recordManualPayment = async (ctx: AppContext, actor: Actor, invoiceId: string, input: ManualPaymentInput, meta?: ClientMeta): Promise<void> => {
  await ctx.prisma.$transaction(async tx => {
    const outcome = await applyPayment(tx, { ...input, orgId: actor.orgId, invoiceId, actor, meta })

    if (outcome.kind === 'duplicate') throw Errors.duplicate('payment', 'A payment with this reference is already recorded on this invoice.')

    if (outcome.kind === 'rejected') {
      if (outcome.reason === 'not_payable') {
        throw Errors.invalidState('invoice', outcome.invoice.status, 'PAID', TRANSITIONS[outcome.invoice.status])
      }

      throw new AppError(422, 'UNPROCESSABLE', 'The payment is larger than the outstanding balance of the invoice.', {
        details: { context: { outstanding: outcome.outstanding.toFixed(2), attempted: outcome.amount.toFixed(2) } }
      })
    }
  })
}
