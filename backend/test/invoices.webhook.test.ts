import { createHmac } from 'node:crypto'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { verifyStripeSignature } from '../src/modules/invoices/stripe-signature.js'
import { body, client, createTestApp, resetDb } from './helpers.js'
import type { TestApp } from './helpers.js'
import { addVisit, advanceTo, drainOutbox, makeWorld, postWebhook, resetFakes, runInvoice, STRIPE_SECRET, stripePaidEvent, stripeSignature } from './invoices.helpers.js'
import type { InvoiceJson } from './invoices.helpers.js'

let t: TestApp
let noSecret: TestApp

beforeAll(async () => {
  t = await createTestApp({ STRIPE_WEBHOOK_SECRET: STRIPE_SECRET })
  noSecret = await createTestApp()
})
afterAll(async () => {
  await noSecret.close()
  await t.close()
})
beforeEach(async () => {
  vi.restoreAllMocks()
  await resetDb(t.prisma)
  resetFakes(t)
})

/** A SENT invoice of 145.00 with a hosted Stripe invoice. */
const sentInvoice = async () => {
  const world = await makeWorld(t)

  await addVisit(t, world, { day: '2026-03-02' })

  const invoice = await runInvoice(t, world)

  await advanceTo(t, world.admin.token, invoice.id, 'SENT')

  const stored = await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })

  return { world, invoice, stripeInvoiceId: stored.stripeInvoiceId ?? '' }
}

const paymentsOf = (invoiceId: string) => t.prisma.payment.findMany({ where: { invoiceId } })

describe('signature verification (unit)', () => {
  const payload = '{"id":"evt_1"}'
  const now = 1_800_000_000_000
  const sign = (timestamp: number, secret = STRIPE_SECRET, text = payload) => `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${text}`).digest('hex')}`
  const check = (header: string | undefined, over: Partial<Parameters<typeof verifyStripeSignature>[0]> = {}) =>
    verifyStripeSignature({ header, rawBody: payload, secret: STRIPE_SECRET, nowMs: now, ...over })

  it('accepts a fresh, correct signature and rejects everything else', () => {
    const ts = now / 1000

    expect(check(sign(ts))).toBe(true)
    expect(check(sign(ts, 'whsec_other_secret_0123456789'))).toBe(false)
    expect(check(sign(ts), { rawBody: `${payload} ` })).toBe(false)
    expect(check(sign(ts), { secret: null })).toBe(false)
    expect(check(sign(ts), { secret: '' })).toBe(false)
    expect(check(undefined)).toBe(false)
    expect(check(sign(ts), { rawBody: undefined })).toBe(false)
    expect(check('')).toBe(false)
    expect(check('garbage')).toBe(false)
    expect(check(`t=${ts}`)).toBe(false)
    expect(check(`v1=${'a'.repeat(64)}`)).toBe(false)
    expect(check(`t=${ts},v1=short`)).toBe(false)
    expect(check(`t=abc,v1=${'a'.repeat(64)}`)).toBe(false)
    expect(check(`t=${ts},t=${ts},v1=${sign(ts).split('v1=')[1]}`)).toBe(false)
  })

  it('tolerance is exactly 5 minutes in both directions', () => {
    const ts = now / 1000

    expect(check(sign(ts - 300))).toBe(true)
    expect(check(sign(ts - 301))).toBe(false)
    expect(check(sign(ts + 300))).toBe(true)
    expect(check(sign(ts + 301))).toBe(false)
  })

  it('accepts any matching v1 while a secret is being rotated, ignores v0', () => {
    const ts = now / 1000
    const good = sign(ts).split('v1=')[1]
    const stale = 'f'.repeat(64)

    expect(check(`t=${ts},v1=${stale},v1=${good}`)).toBe(true)
    expect(check(`t=${ts},v0=${good}`)).toBe(false)
    expect(check(`t=${ts},v1=${stale},v0=${good}`)).toBe(false)
  })
})

describe('POST /webhooks/stripe', () => {
  it('a correctly signed invoice.paid pays the invoice: payment row, PAID, accounting job, no session needed', async () => {
    const { world, invoice, stripeInvoiceId } = await sentInvoice()
    const payload = stripePaidEvent({ eventId: 'evt_paid_1', stripeInvoiceId, amountCents: 14500, paymentIntent: 'pi_123' })
    const response = await postWebhook(t, payload, stripeSignature(payload))

    expect(response.statusCode).toBe(200)
    expect(body(response).data).toEqual({ received: true, result: 'processed' })

    const [payment] = await paymentsOf(invoice.id)

    expect(payment).toMatchObject({ method: 'stripe', externalRef: 'pi_123', recordedById: null })
    expect(payment?.amount.toFixed(2)).toBe('145.00')

    const stored = await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })

    expect(stored).toMatchObject({ status: 'PAID' })
    expect(stored.amountPaid.toFixed(2)).toBe('145.00')
    expect(stored.paidAt).not.toBeNull()
    expect(await t.prisma.webhookEvent.count({ where: { provider: 'stripe', eventId: 'evt_paid_1' } })).toBe(1)

    // The payment is posted to accounting by the outbox, through the same path as a manual payment
    await drainOutbox(t)
    expect((await paymentsOf(invoice.id))[0]?.accountingSyncedAt).not.toBeNull()

    const view = body(await client(t.app).get(`/v1/invoices/${invoice.id}`, { token: world.admin.token })).data?.invoice as InvoiceJson

    expect(view.payments[0]).toMatchObject({ method: 'stripe', externalRef: 'pi_123' })

    const audit = await t.prisma.auditEvent.findMany({ where: { entityId: invoice.id, action: { in: ['payment_recorded', 'paid'] } } })

    expect(audit.map(event => event.actorId)).toEqual([null, null])
  })

  it('invoice.payment_succeeded is handled the same way', async () => {
    const { invoice, stripeInvoiceId } = await sentInvoice()
    const payload = stripePaidEvent({ eventId: 'evt_ps_1', type: 'invoice.payment_succeeded', stripeInvoiceId, amountCents: 14500 })

    expect((await postWebhook(t, payload, stripeSignature(payload))).statusCode).toBe(200)
    expect((await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe('PAID')
  })

  it('a partial Stripe amount leaves the invoice PARTIALLY_PAID', async () => {
    const { invoice, stripeInvoiceId } = await sentInvoice()
    const payload = stripePaidEvent({ eventId: 'evt_part', stripeInvoiceId, amountCents: 5000 })

    await postWebhook(t, payload, stripeSignature(payload))

    const stored = await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })

    expect(stored.status).toBe('PARTIALLY_PAID')
    expect(stored.amountPaid.toFixed(2)).toBe('50.00')
  })

  it('a duplicate event id is acknowledged with 200 and does no work', async () => {
    const { invoice, stripeInvoiceId } = await sentInvoice()
    const payload = stripePaidEvent({ eventId: 'evt_dup', stripeInvoiceId, amountCents: 5000, paymentIntent: 'pi_dup' })
    const first = await postWebhook(t, payload, stripeSignature(payload))
    const replay = await postWebhook(t, payload, stripeSignature(payload))

    expect(first.statusCode).toBe(200)
    expect(replay.statusCode).toBe(200)
    expect(body(replay).data).toEqual({ received: true, result: 'duplicate' })
    expect(await paymentsOf(invoice.id)).toHaveLength(1)
    expect((await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).amountPaid.toFixed(2)).toBe('50.00')
    expect(await t.prisma.outboxJob.count({ where: { type: 'accounting.post_payment' } })).toBe(1)
  })

  it('simultaneous deliveries of the same event pay once', async () => {
    const { invoice, stripeInvoiceId } = await sentInvoice()
    const payload = stripePaidEvent({ eventId: 'evt_race', stripeInvoiceId, amountCents: 14500 })
    const responses = await Promise.all([1, 2, 3, 4].map(() => postWebhook(t, payload, stripeSignature(payload))))

    expect(responses.every(response => response.statusCode === 200)).toBe(true)
    expect(responses.filter(response => body(response).data?.result === 'processed')).toHaveLength(1)
    expect(await paymentsOf(invoice.id)).toHaveLength(1)
    expect((await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).amountPaid.toFixed(2)).toBe('145.00')
  })

  it('two different events for the same Stripe payment (paid + payment_succeeded) are one payment', async () => {
    const { invoice, stripeInvoiceId } = await sentInvoice()
    const paid = stripePaidEvent({ eventId: 'evt_a', type: 'invoice.paid', stripeInvoiceId, amountCents: 14500, paymentIntent: 'pi_same' })
    const succeeded = stripePaidEvent({ eventId: 'evt_b', type: 'invoice.payment_succeeded', stripeInvoiceId, amountCents: 14500, paymentIntent: 'pi_same' })

    await postWebhook(t, paid, stripeSignature(paid))
    expect((await postWebhook(t, succeeded, stripeSignature(succeeded))).statusCode).toBe(200)
    expect(await paymentsOf(invoice.id)).toHaveLength(1)
    expect((await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).amountPaid.toFixed(2)).toBe('145.00')
  })

  it('falls back to the outstanding balance when the event carries no amount', async () => {
    const { invoice, stripeInvoiceId } = await sentInvoice()
    const payload = stripePaidEvent({ eventId: 'evt_noamt', stripeInvoiceId })

    await postWebhook(t, payload, stripeSignature(payload))
    expect((await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe('PAID')
  })

  describe('rejects with 400 WEBHOOK_SIGNATURE_INVALID and a generic message, and changes nothing', () => {
    const cases: Array<[string, (payload: string) => { payload?: string; signature?: string }]> = [
      ['missing header', () => ({ signature: undefined })],
      ['empty header', () => ({ signature: '' })],
      ['garbage header', () => ({ signature: 'v1=nope' })],
      ['wrong secret', payload => ({ signature: stripeSignature(payload, 'whsec_wrong_secret_0123456789') })],
      ['tampered body (amount changed after signing)', payload => ({ payload: payload.replace('14500', '14501'), signature: stripeSignature(payload) })],
      ['body with only whitespace changed', payload => ({ payload: `${payload} `, signature: stripeSignature(payload) })],
      ['stale timestamp (replay)', payload => ({ signature: stripeSignature(payload, STRIPE_SECRET, Math.floor(Date.now() / 1000) - 301) })],
      ['future timestamp', payload => ({ signature: stripeSignature(payload, STRIPE_SECRET, Math.floor(Date.now() / 1000) + 301) })],
      ['signature of another timestamp', payload => ({ signature: stripeSignature(payload).replace(/t=\d+/, `t=${Math.floor(Date.now() / 1000) - 5}`) })]
    ]

    for (const [name, mutate] of cases) {
      it(name, async () => {
        const { invoice, stripeInvoiceId } = await sentInvoice()
        const original = stripePaidEvent({ eventId: 'evt_bad', stripeInvoiceId, amountCents: 14500 })
        const change = mutate(original)
        const response = await postWebhook(t, change.payload ?? original, 'signature' in change ? change.signature : stripeSignature(original))

        expect(response.statusCode).toBe(400)
        expect(body(response).error).toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID', message: 'The webhook signature is invalid.' })
        expect(await paymentsOf(invoice.id)).toHaveLength(0)
        expect(await t.prisma.webhookEvent.count()).toBe(0)
        expect((await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe('SENT')
      })
    }

    it('with no secret configured, even a well-formed signature is refused', async () => {
      const payload = stripePaidEvent({ eventId: 'evt_x', stripeInvoiceId: 'in_x' })
      const response = await postWebhook(noSecret, payload, stripeSignature(payload))

      expect(response.statusCode).toBe(400)
      expect(body(response).error?.code).toBe('WEBHOOK_SIGNATURE_INVALID')
    })
  })

  it('a valid signature over an unreadable event is a 400 (never a 500)', async () => {
    const payload = JSON.stringify({ hello: 'world' })
    const response = await postWebhook(t, payload, stripeSignature(payload))

    expect(response.statusCode).toBe(400)
    expect(body(response).error?.code).toBe('VALIDATION_ERROR')
  })

  it('an unknown invoice and unrelated event types are acknowledged with 200 and change nothing', async () => {
    const { invoice } = await sentInvoice()
    const unknown = stripePaidEvent({ eventId: 'evt_unknown', stripeInvoiceId: 'in_does_not_exist', amountCents: 100 })
    const other = stripePaidEvent({ eventId: 'evt_other', type: 'customer.created', stripeInvoiceId: 'in_x' })

    expect((await postWebhook(t, unknown, stripeSignature(unknown))).statusCode).toBe(200)

    const ignored = await postWebhook(t, other, stripeSignature(other))

    expect(ignored.statusCode).toBe(200)
    expect(body(ignored).data?.result).toBe('ignored')
    expect(await paymentsOf(invoice.id)).toHaveLength(0)
    expect(await t.prisma.webhookEvent.count({ where: { eventId: 'evt_other' } })).toBe(0)
  })

  it('money for a voided invoice is not applied; the event is kept and a rejection is audited for a human', async () => {
    const { world, invoice, stripeInvoiceId } = await sentInvoice()

    await client(t.app).post(`/v1/invoices/${invoice.id}/void`, { token: world.admin.token, body: { reason: 'oops' } })

    const payload = stripePaidEvent({ eventId: 'evt_void', stripeInvoiceId, amountCents: 14500 })

    expect((await postWebhook(t, payload, stripeSignature(payload))).statusCode).toBe(200)
    expect(await paymentsOf(invoice.id)).toHaveLength(0)
    expect((await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe('VOID')

    const rejected = await t.prisma.auditEvent.findFirstOrThrow({ where: { entityId: invoice.id, action: 'payment_rejected' } })

    expect(rejected.diff).toMatchObject({ provider: 'stripe', eventId: 'evt_void', reason: 'not_payable', status: 'VOID' })
  })

  it('an amount larger than the balance is never applied (no overpayment through the webhook either)', async () => {
    const { invoice, stripeInvoiceId } = await sentInvoice()
    const payload = stripePaidEvent({ eventId: 'evt_over', stripeInvoiceId, amountCents: 20000 })

    expect((await postWebhook(t, payload, stripeSignature(payload))).statusCode).toBe(200)
    expect(await paymentsOf(invoice.id)).toHaveLength(0)
    expect((await t.prisma.auditEvent.findFirstOrThrow({ where: { entityId: invoice.id, action: 'payment_rejected' } })).diff).toMatchObject({ reason: 'overpayment' })
  })

  it('the event id and the payment commit together: a failure after the work leaves neither, and Stripe\'s retry succeeds', async () => {
    const { invoice, stripeInvoiceId } = await sentInvoice()
    const payload = stripePaidEvent({ eventId: 'evt_crash', stripeInvoiceId, amountCents: 14500 })
    const realTransaction = t.ctx.prisma.$transaction.bind(t.ctx.prisma) as (fn: (tx: unknown) => Promise<unknown>, options?: unknown) => Promise<unknown>

    vi.spyOn(t.ctx.prisma, '$transaction').mockImplementationOnce((async (fn: (tx: unknown) => Promise<unknown>, options?: unknown) =>
      realTransaction(async tx => {
        await fn(tx)

        throw new Error('process died before commit')
      }, options)) as never)

    const crashed = await postWebhook(t, payload, stripeSignature(payload))

    expect(crashed.statusCode).toBe(500)
    expect(await t.prisma.webhookEvent.count()).toBe(0)
    expect(await paymentsOf(invoice.id)).toHaveLength(0)
    expect((await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe('SENT')

    const retry = await postWebhook(t, payload, stripeSignature(payload))

    expect(retry.statusCode).toBe(200)
    expect(body(retry).data?.result).toBe('processed')
    expect(await paymentsOf(invoice.id)).toHaveLength(1)
  })

  it('a large signed event (over the app-wide 16 KiB body limit) is accepted', async () => {
    const { invoice, stripeInvoiceId } = await sentInvoice()
    const event = JSON.parse(stripePaidEvent({ eventId: 'evt_big', stripeInvoiceId, amountCents: 14500 })) as { data: { object: Record<string, unknown> } }

    event.data.object.lines = Array.from({ length: 300 }, (_, index) => ({ id: `il_${index}`, description: 'x'.repeat(100) }))

    const payload = JSON.stringify(event)

    expect(payload.length).toBeGreaterThan(16 * 1024)
    expect((await postWebhook(t, payload, stripeSignature(payload))).statusCode).toBe(200)
    expect(await paymentsOf(invoice.id)).toHaveLength(1)
  })

  it('needs no session and no service key, and is not reachable with GET', async () => {
    const response = await t.app.inject({ method: 'GET', url: '/webhooks/stripe' })

    expect(response.statusCode).toBe(404)
  })
})
