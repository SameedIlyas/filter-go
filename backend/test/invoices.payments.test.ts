import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { D } from '../src/lib/money.js'
import { body, client, createTestApp, resetDb, signIn } from './helpers.js'
import type { TestApp } from './helpers.js'
import { addVisit, advanceTo, drainOutbox, makeWorld, runInvoice } from './invoices.helpers.js'
import type { InvoiceJson } from './invoices.helpers.js'
import { getFakeIntegrations } from '../src/modules/invoices/integrations/index.js'
import { resetFakes } from './invoices.helpers.js'

let t: TestApp

beforeAll(async () => {
  t = await createTestApp()
})
afterAll(() => t.close())
beforeEach(async () => {
  await resetDb(t.prisma)
  t.mailer.clear()
  resetFakes(t)
})

/** A SYNCED invoice of exactly 145.00 with one line. */
const syncedInvoice = async (target: 'SYNCED' | 'SENT' = 'SYNCED') => {
  const world = await makeWorld(t)

  await addVisit(t, world, { day: '2026-03-02' })

  const invoice = await runInvoice(t, world)

  await advanceTo(t, world.admin.token, invoice.id, target)

  return { world, invoice }
}

const pay = (token: string, id: string, payload: object) => client(t.app).post(`/v1/invoices/${id}/payments`, { token, body: payload })

describe('POST /invoices/:id/payments', () => {
  it('partial then full payment: amountPaid, PARTIALLY_PAID, PAID with paidAt, payment rows and audit', async () => {
    const { world, invoice } = await syncedInvoice('SENT')
    const first = await pay(world.admin.token, invoice.id, { amount: '100.00', method: 'bank_transfer', externalRef: 'WIRE-1', receivedAt: '2026-04-01T12:00:00Z' })
    const partial = body(first).data?.invoice as InvoiceJson

    expect(first.statusCode).toBe(201)
    expect(partial).toMatchObject({ status: 'PARTIALLY_PAID', amountPaid: '100.00', balance: '45.00', paidAt: null })
    expect(partial.payments).toHaveLength(1)
    expect(partial.payments[0]).toMatchObject({ amount: '100.00', method: 'bank_transfer', externalRef: 'WIRE-1', receivedAt: '2026-04-01T12:00:00.000Z' })

    const second = await pay(world.admin.token, invoice.id, { amount: '45.00', method: 'cheque', receivedAt: '2026-04-05T09:30:00Z' })
    const paid = body(second).data?.invoice as InvoiceJson

    expect(paid).toMatchObject({ status: 'PAID', amountPaid: '145.00', balance: '0.00', paidAt: '2026-04-05T09:30:00.000Z' })
    expect(paid.payments).toHaveLength(2)

    const actions = (await t.prisma.auditEvent.findMany({ where: { entityId: invoice.id }, orderBy: { createdAt: 'asc' } })).map(event => event.action)

    expect(actions.filter(action => action === 'payment_recorded')).toHaveLength(2)
    expect(actions).toContain('paid')
  })

  it('accepts a payment on a SYNCED invoice (offline payment before it was emailed)', async () => {
    const { world, invoice } = await syncedInvoice('SYNCED')
    const response = await pay(world.admin.token, invoice.id, { amount: '145.00', method: 'cash' })

    expect(response.statusCode).toBe(201)
    expect(body(response).data?.invoice).toMatchObject({ status: 'PAID' })
  })

  it('refuses overpayment with 422 and changes nothing', async () => {
    const { world, invoice } = await syncedInvoice('SENT')

    await pay(world.admin.token, invoice.id, { amount: '100.00', method: 'cash' })

    const over = await pay(world.admin.token, invoice.id, { amount: '45.01', method: 'cash' })

    expect(over.statusCode).toBe(422)
    expect(body(over).error?.code).toBe('UNPROCESSABLE')
    expect(body(over).error?.details?.context).toEqual({ outstanding: '45.00', attempted: '45.01' })
    expect((await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).amountPaid.toFixed(2)).toBe('100.00')
    expect(await t.prisma.payment.count()).toBe(1)
  })

  it('a paid invoice takes no more payments (INVALID_STATE), and neither does a draft, approved or void one', async () => {
    const { world, invoice } = await syncedInvoice('SENT')

    await pay(world.admin.token, invoice.id, { amount: '145.00', method: 'cash' })

    const again = await pay(world.admin.token, invoice.id, { amount: '1.00', method: 'cash' })

    expect(again.statusCode).toBe(409)
    expect(body(again).error?.code).toBe('INVALID_STATE')

    for (const status of ['DRAFT', 'APPROVED', 'VOID'] as const) {
      await t.prisma.invoice.update({ where: { id: invoice.id }, data: { status, amountPaid: D(0) } })
      expect((await pay(world.admin.token, invoice.id, { amount: '1.00', method: 'cash' })).statusCode, status).toBe(409)
    }
  })

  it('a repeated external reference is recorded once (409 DUPLICATE)', async () => {
    const { world, invoice } = await syncedInvoice('SENT')

    expect((await pay(world.admin.token, invoice.id, { amount: '10.00', method: 'cash', externalRef: 'CHK-9' })).statusCode).toBe(201)

    const again = await pay(world.admin.token, invoice.id, { amount: '10.00', method: 'cash', externalRef: 'CHK-9' })

    expect(again.statusCode).toBe(409)
    expect(body(again).error?.code).toBe('DUPLICATE')
    expect(await t.prisma.payment.count()).toBe(1)
  })

  it('validates the body: positive 2-decimal amount, reserved method, no future date, strict keys', async () => {
    const { world, invoice } = await syncedInvoice('SENT')
    const bad = [
      { amount: '0', method: 'cash' },
      { amount: '-5', method: 'cash' },
      { amount: '1.005', method: 'cash' },
      { amount: 'abc', method: 'cash' },
      { method: 'cash' },
      { amount: '5' },
      { amount: '5', method: '   ' },
      { amount: '5', method: 'stripe' },
      { amount: '5', method: 'STRIPE' },
      { amount: '5', method: 'cash', receivedAt: '2099-01-01T00:00:00Z' },
      { amount: '5', method: 'cash', receivedAt: 'yesterday' },
      { amount: '5', method: 'cash', status: 'PAID' },
      { amount: '5', method: 'x'.repeat(41) }
    ]

    for (const payload of bad) expect((await pay(world.admin.token, invoice.id, payload)).statusCode, JSON.stringify(payload)).toBe(400)

    expect(await t.prisma.payment.count()).toBe(0)
    expect((await pay(world.admin.token, invoice.id, { amount: 5, method: 'cash' })).statusCode).toBe(201)
  })

  it('every payment enqueues its own accounting.post_payment job and the handler posts it once', async () => {
    const { world, invoice } = await syncedInvoice('SENT')

    await pay(world.admin.token, invoice.id, { amount: '100.00', method: 'cash' })
    await pay(world.admin.token, invoice.id, { amount: '45.00', method: 'cash' })

    const payments = await t.prisma.payment.findMany({ where: { invoiceId: invoice.id } })
    const jobs = await t.prisma.outboxJob.findMany({ where: { type: 'accounting.post_payment' } })

    expect(jobs.map(job => job.dedupeKey).sort()).toEqual(payments.map(payment => `invoice:${invoice.id}:payment:${payment.id}`).sort())

    await drainOutbox(t)
    await drainOutbox(t)

    const accounting = getFakeIntegrations(t.ctx).accounting

    expect(accounting.payments.size).toBe(2)
    expect((await t.prisma.payment.findMany({ where: { invoiceId: invoice.id } })).every(payment => payment.accountingSyncedAt !== null)).toBe(true)
    expect(accounting.callCount('recordPayment')).toBe(2)
  })

  it('two simultaneous full payments: exactly one wins, the invoice is never overpaid', async () => {
    const { world, invoice } = await syncedInvoice('SENT')
    const responses = await Promise.all([1, 2, 3].map(() => pay(world.admin.token, invoice.id, { amount: '145.00', method: 'cash' })))

    expect(responses.map(response => response.statusCode).sort()).toEqual([201, 409, 409])

    const stored = await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })

    expect(stored.amountPaid.toFixed(2)).toBe('145.00')
    expect(stored.status).toBe('PAID')
    expect(await t.prisma.payment.count()).toBe(1)
  })

  it('simultaneous partial payments are all counted (no lost update) and the total never exceeds the invoice', async () => {
    const { world, invoice } = await syncedInvoice('SENT')
    const responses = await Promise.all(['50.00', '50.00', '45.00', '30.00'].map(amount => pay(world.admin.token, invoice.id, { amount, method: 'cash' })))
    const stored = await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
    const payments = await t.prisma.payment.findMany({ where: { invoiceId: invoice.id } })
    const paidSum = payments.reduce((total, payment) => total.plus(payment.amount), D(0))

    expect(stored.amountPaid.toFixed(2)).toBe(paidSum.toFixed(2))
    expect(paidSum.lte(145)).toBe(true)
    expect(responses.filter(response => response.statusCode === 201)).toHaveLength(payments.length)
    expect(stored.status).toBe(paidSum.eq(145) ? 'PAID' : 'PARTIALLY_PAID')
  })

  it('other organizations get 404 and nothing is written', async () => {
    const { invoice } = await syncedInvoice('SENT')
    const org = await t.prisma.organization.create({ data: { name: 'Nope', leadIntakeKey: randomUUID() } })
    const foreign = await signIn(t, 'ADMIN', { orgId: org.id })

    expect((await pay(foreign.token, invoice.id, { amount: '1.00', method: 'cash' })).statusCode).toBe(404)
    expect(await t.prisma.payment.count()).toBe(0)
  })
})
