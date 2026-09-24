import { z } from 'zod'

import type { AppContext } from '../../context.js'
import type { Prisma } from '../../generated/prisma/client.js'
import { D } from '../../lib/money.js'
import { recordAudit } from '../audit/record.js'
import { applyPayment } from './payments.service.js'

type Tx = Prisma.TransactionClient

export const stripeEventSchema = z.object({
  id: z.string().min(1).max(255),
  type: z.string().min(1).max(255),
  data: z.object({ object: z.record(z.string(), z.unknown()) })
})

export type StripeEvent = z.infer<typeof stripeEventSchema>

/** The only events that move money. Everything else is acknowledged and ignored. */
const PAID_EVENTS = new Set(['invoice.paid', 'invoice.payment_succeeded'])

export type WebhookResult = 'processed' | 'duplicate' | 'ignored'

const paidInvoiceSchema = z.object({
  id: z.string().min(1),
  amount_paid: z.number().int().nonnegative().optional(),
  payment_intent: z.unknown().optional(),
  charge: z.unknown().optional(),
  status_transitions: z.object({ paid_at: z.number().int().positive().nullable().optional() }).optional()
})

const asString = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null)

/** Stripe amounts are integer minor units (cents). */
const centsToAmount = (cents: number | undefined) => (cents === undefined ? null : D(cents).div(100))

const applyPaidEvent = async (ctx: AppContext, tx: Tx, event: StripeEvent): Promise<void> => {
  const parsed = paidInvoiceSchema.safeParse(event.data.object)

  if (!parsed.success) {
    ctx.log.warn({ eventId: event.id, type: event.type }, 'stripe paid event has an unreadable invoice object')

    return
  }

  const stripeInvoice = parsed.data
  const invoice = await tx.invoice.findFirst({ where: { stripeInvoiceId: stripeInvoice.id }, select: { id: true, orgId: true } })

  if (!invoice) {
    // Acknowledge so Stripe stops retrying; a human can match it by the logged ids
    ctx.log.warn({ eventId: event.id, stripeInvoiceId: stripeInvoice.id }, 'stripe paid event for an unknown invoice')

    return
  }

  const amount = centsToAmount(stripeInvoice.amount_paid)

  if (amount !== null && amount.lte(0)) return

  const paidAt = stripeInvoice.status_transitions?.paid_at

  // One payment per Stripe payment: invoice.paid and invoice.payment_succeeded for the same payment share this reference
  const outcome = await applyPayment(tx, {
    orgId: invoice.orgId,
    invoiceId: invoice.id,
    amount,
    method: 'stripe',
    receivedAt: paidAt ? new Date(paidAt * 1000) : new Date(),
    externalRef: asString(stripeInvoice.payment_intent) ?? asString(stripeInvoice.charge) ?? stripeInvoice.id,
    actor: null
  })

  if (outcome.kind !== 'rejected') return

  // Money arrived that the invoice cannot take (voided, already paid, too much). Keep the event and leave a trail for a human.
  ctx.log.warn({ eventId: event.id, invoiceId: invoice.id, reason: outcome.reason }, 'stripe payment could not be applied')
  await recordAudit(tx, null, {
    orgId: invoice.orgId,
    entity: 'invoice',
    entityId: invoice.id,
    action: 'payment_rejected',
    diff: { provider: 'stripe', eventId: event.id, reason: outcome.reason, status: outcome.invoice.status, amount: outcome.amount.toFixed(2), outstanding: outcome.outstanding.toFixed(2) }
  })
}

/**
 * Records the event and applies its payment in ONE transaction: a crash can neither lose the event id after the payment
 * nor pay twice. The insert comes first; a duplicate event id (Stripe retries, replays) returns without doing any work.
 */
export const processStripeEvent = async (ctx: AppContext, event: StripeEvent): Promise<WebhookResult> => {
  if (!PAID_EVENTS.has(event.type)) return 'ignored'

  return ctx.prisma.$transaction(async tx => {
    const inserted = await tx.webhookEvent.createMany({ data: [{ provider: 'stripe', eventId: event.id }], skipDuplicates: true })

    if (inserted.count === 0) return 'duplicate'

    await applyPaidEvent(ctx, tx, event)

    return 'processed'
  })
}
