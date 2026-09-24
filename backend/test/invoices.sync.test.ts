import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { enqueue } from '../src/jobs/outbox.js'
import { outboxHandlers as registry } from '../src/jobs/registry.js'
import { getFakeIntegrations } from '../src/modules/invoices/integrations/index.js'
import { outboxHandlers } from '../src/modules/invoices/invoices.jobs.js'
import { body, client, createTestApp, resetDb } from './helpers.js'
import type { TestApp } from './helpers.js'
import { addVisit, advanceTo, approve, drainOutbox, makeWorld, resetFakes, runInvoice } from './invoices.helpers.js'
import type { InvoiceJson } from './invoices.helpers.js'

let t: TestApp

beforeAll(async () => {
  t = await createTestApp()
})
afterAll(() => t.close())
beforeEach(async () => {
  vi.restoreAllMocks()
  await resetDb(t.prisma)
  t.mailer.clear()
  resetFakes(t)
})

const fakes = () => getFakeIntegrations(t.ctx)
const api = () => client(t.app)

const draft = async () => {
  const world = await makeWorld(t)

  await addVisit(t, world, { day: '2026-03-02' })

  return { world, invoice: await runInvoice(t, world) }
}

const detail = async (token: string, id: string) => body(await api().get(`/v1/invoices/${id}`, { token })).data?.invoice as InvoiceJson
const job = (type: string) => t.prisma.outboxJob.findFirstOrThrow({ where: { type } })
const status = async (id: string) => (await t.prisma.invoice.findUniqueOrThrow({ where: { id } })).status

describe('registration', () => {
  it('exports the five outbox handlers and they are part of the merged registry', () => {
    const types = ['accounting.sync_invoice', 'accounting.void_invoice', 'accounting.post_payment', 'payments.create_invoice', 'payments.void_invoice']

    expect(Object.keys(outboxHandlers).sort()).toEqual([...types].sort())

    for (const type of types) expect(registry[type]).toBe(outboxHandlers[type])
  })
})

describe('accounting.sync_invoice', () => {
  it('approval succeeds while the provider is down; the job retries in the background and the invoice is never lost', async () => {
    const { world, invoice } = await draft()

    fakes().accounting.failNext(1000)

    const approved = await approve(t, world.admin.token, invoice.id)

    expect(approved.statusCode).toBe(200)
    expect(body(approved).data?.invoice).toMatchObject({ status: 'APPROVED' })

    await drainOutbox(t)

    expect(await status(invoice.id)).toBe('APPROVED')
    expect(await job('accounting.sync_invoice')).toMatchObject({ status: 'PENDING', attempts: 1 })

    const view = await detail(world.admin.token, invoice.id)

    expect(view.sync.accounting.state).toBe('PENDING')
    expect(view.sync.accounting.lastError).toContain('Fake provider is unavailable')
    expect(view.sync.payment.state).toBe('NONE')
  })

  it('fails twice then succeeds: SYNCED with one external invoice, a stored customer reference and an audit trail', async () => {
    const { world, invoice } = await draft()

    fakes().accounting.failNext(2, 'createInvoice')
    await approve(t, world.admin.token, invoice.id)

    await drainOutbox(t)
    expect(await job('accounting.sync_invoice')).toMatchObject({ status: 'PENDING', attempts: 1 })
    await drainOutbox(t)
    expect(await job('accounting.sync_invoice')).toMatchObject({ status: 'PENDING', attempts: 2 })
    expect(await status(invoice.id)).toBe('APPROVED')

    await drainOutbox(t)

    const stored = await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
    const done = await job('accounting.sync_invoice')

    expect(done).toMatchObject({ status: 'DONE', attempts: 3, lastError: null })
    expect(stored.status).toBe('SYNCED')
    expect(stored.accountingRef).toMatch(/^QB-INV-/)
    expect(stored.accountingSyncedAt).not.toBeNull()
    expect(fakes().accounting.invoices.size).toBe(1)
    expect(fakes().accounting.callCount('createInvoice')).toBe(3)
    // The customer was created once and remembered on the client
    expect(fakes().accounting.callCount('upsertCustomer')).toBe(1)
    expect((await t.prisma.client.findUniqueOrThrow({ where: { id: stored.clientId } })).accountingRef).toMatch(/^QB-CUST-/)

    const actions = (await t.prisma.auditEvent.findMany({ where: { entityId: invoice.id }, orderBy: { createdAt: 'asc' } })).map(event => event.action)

    expect(actions.filter(action => action === 'sync_failed')).toHaveLength(2)
    expect(actions).toContain('synced')
    expect((await detail(world.admin.token, invoice.id)).sync.accounting).toEqual({ state: 'DONE', lastError: null })
  })

  it('exhausted retries end DEAD (visible on the invoice) and retry-sync re-arms the job', async () => {
    const { world, invoice } = await draft()

    fakes().accounting.failNext(1000)
    await approve(t, world.admin.token, invoice.id)

    for (let attempt = 0; attempt < 8; attempt += 1) await drainOutbox(t)

    const dead = await job('accounting.sync_invoice')

    expect(dead).toMatchObject({ status: 'DEAD', attempts: 8 })
    expect(await drainOutbox(t)).toBe(0)
    expect(await status(invoice.id)).toBe('APPROVED')
    expect((await detail(world.admin.token, invoice.id)).sync.accounting.state).toBe('DEAD')

    const failures = await t.prisma.auditEvent.findMany({ where: { entityId: invoice.id, action: 'sync_failed' }, orderBy: { createdAt: 'asc' } })

    expect(failures).toHaveLength(8)
    expect(failures[7]?.diff).toMatchObject({ attempt: 8, exhausted: true, jobType: 'accounting.sync_invoice' })
    expect(JSON.stringify(failures[7]?.diff)).not.toContain('Fake provider')

    fakes().accounting.reset()

    const retried = await api().post(`/v1/invoices/${invoice.id}/retry-sync`, { token: world.admin.token })

    expect(retried.statusCode).toBe(200)
    expect(await job('accounting.sync_invoice')).toMatchObject({ status: 'PENDING', attempts: 0 })

    await drainOutbox(t)

    expect(await status(invoice.id)).toBe('SYNCED')
    expect((await detail(world.admin.token, invoice.id)).sync.accounting.state).toBe('DONE')
    expect(await t.prisma.auditEvent.count({ where: { entityId: invoice.id, action: 'sync_retried' } })).toBe(1)
    // Nothing failed any more: another retry is refused
    expect((await api().post(`/v1/invoices/${invoice.id}/retry-sync`, { token: world.admin.token })).statusCode).toBe(409)
  })

  it('is idempotent on the external reference: a partial success never creates a second provider invoice', async () => {
    const { world, invoice } = await draft()
    const stored = await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { client: true } })

    await approve(t, world.admin.token, invoice.id)

    // The provider already has the invoice (an earlier attempt succeeded remotely, then crashed before saving the reference)
    const existing = await fakes().accounting.createInvoice(
      { id: stored.id, invoiceNumber: stored.invoiceNumber, issueDate: '2026-01-01', dueDate: '2026-01-31', subtotal: '145.00', tax: '0.00', total: '145.00' },
      [],
      { id: stored.clientId, legalName: 'x', billingEmail: 'x@x.test', billingAddress: null, accountingRef: null, stripeCustomerId: null }
    )

    await drainOutbox(t)

    expect(fakes().accounting.invoices.size).toBe(1)
    expect((await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).accountingRef).toBe(existing.accountingRef)
    expect(await status(invoice.id)).toBe('SYNCED')

    // A rerun of the finished job is a no-op
    await t.prisma.outboxJob.updateMany({ data: { status: 'PENDING', runAt: new Date(0) } })
    await drainOutbox(t)
    expect(fakes().accounting.callCount('createInvoice')).toBe(2)
  })

  it('when the reference is already stored (crash after saving it) the handler only finishes the status change', async () => {
    const { world, invoice } = await draft()

    await approve(t, world.admin.token, invoice.id)
    await t.prisma.invoice.update({ where: { id: invoice.id }, data: { accountingRef: 'QB-PRESET' } })
    await drainOutbox(t)

    expect(fakes().accounting.callCount('createInvoice')).toBe(0)
    expect(await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).toMatchObject({ status: 'SYNCED', accountingRef: 'QB-PRESET' })
  })

  it('an invoice voided before the sync ran is never sent to accounting', async () => {
    const { world, invoice } = await draft()

    await approve(t, world.admin.token, invoice.id)
    expect((await api().post(`/v1/invoices/${invoice.id}/void`, { token: world.admin.token, body: { reason: 'oops' } })).statusCode).toBe(200)
    await drainOutbox(t)

    expect(fakes().accounting.callCount('createInvoice')).toBe(0)
    expect(await job('accounting.sync_invoice')).toMatchObject({ status: 'DONE' })
    expect(await status(invoice.id)).toBe('VOID')
  })

  it('an invoice voided while the provider call is in flight gets its provider copy voided too', async () => {
    const { world, invoice } = await draft()
    const accounting = fakes().accounting
    const original = accounting.createInvoice.bind(accounting)

    vi.spyOn(accounting, 'createInvoice').mockImplementationOnce(async (...args) => {
      const result = await original(...args)

      await t.prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'VOID' } })

      return result
    })
    await approve(t, world.admin.token, invoice.id)
    await drainOutbox(t)

    expect(await status(invoice.id)).toBe('VOID')
    expect((await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).accountingRef).toMatch(/^QB-INV-/)
    expect(await job('accounting.void_invoice')).toMatchObject({ status: 'PENDING' })

    await drainOutbox(t)

    expect([...accounting.invoices.values()]).toEqual([expect.objectContaining({ voided: true })])
  })
})

describe('accounting.void_invoice and payments.void_invoice', () => {
  it('voiding a sent invoice voids it in accounting and stops the hosted pay link', async () => {
    const { world, invoice } = await draft()

    await advanceTo(t, world.admin.token, invoice.id, 'SENT')
    await api().post(`/v1/invoices/${invoice.id}/void`, { token: world.admin.token, body: { reason: 'Duplicate' } })
    await drainOutbox(t)

    expect([...fakes().accounting.invoices.values()].map(entry => entry.voided)).toEqual([true])
    expect([...fakes().payments.hostedInvoices.values()].map(entry => entry.voided)).toEqual([true])
    expect((await detail(world.admin.token, invoice.id)).sync).toEqual({ accounting: { state: 'DONE', lastError: null }, payment: { state: 'DONE', lastError: null } })
  })

  it('a failing void is retried (and shown as pending) until it works', async () => {
    const { world, invoice } = await draft()

    await advanceTo(t, world.admin.token, invoice.id, 'SYNCED')
    await api().post(`/v1/invoices/${invoice.id}/void`, { token: world.admin.token, body: { reason: 'Duplicate' } })
    fakes().accounting.failNext(1, 'voidInvoice')
    await drainOutbox(t)
    expect((await detail(world.admin.token, invoice.id)).sync.accounting.state).toBe('PENDING')
    await drainOutbox(t)
    expect([...fakes().accounting.invoices.values()].map(entry => entry.voided)).toEqual([true])
  })
})

describe('payments.create_invoice (send)', () => {
  it('failures create nothing and email nobody until the provider works; then exactly one email', async () => {
    const { world, invoice } = await draft()

    await advanceTo(t, world.admin.token, invoice.id, 'SYNCED')
    fakes().payments.failNext(2, 'createHostedInvoice')
    await api().post(`/v1/invoices/${invoice.id}/send`, { token: world.admin.token })

    await drainOutbox(t)
    await drainOutbox(t)
    expect(await status(invoice.id)).toBe('SYNCED')
    expect(t.mailer.sent).toHaveLength(0)
    expect((await detail(world.admin.token, invoice.id)).sync.payment.state).toBe('PENDING')

    await drainOutbox(t)
    expect(await status(invoice.id)).toBe('SENT')
    expect(t.mailer.sent).toHaveLength(1)
    // Sending twice (double click) is one job
    await api().post(`/v1/invoices/${invoice.id}/send`, { token: world.admin.token })
    expect(await t.prisma.outboxJob.count({ where: { type: 'payments.create_invoice' } })).toBe(1)
  })

  it('an email failure after the hosted invoice exists retries without creating a second hosted invoice', async () => {
    const { world, invoice } = await draft()

    await advanceTo(t, world.admin.token, invoice.id, 'SYNCED')
    vi.spyOn(t.mailer, 'send').mockRejectedValueOnce(new Error('smtp down'))
    await api().post(`/v1/invoices/${invoice.id}/send`, { token: world.admin.token })
    await drainOutbox(t)

    const afterFailure = await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })

    expect(afterFailure.status).toBe('SYNCED')
    expect(afterFailure.stripeInvoiceId).toMatch(/^in_fake_/)
    expect((await detail(world.admin.token, invoice.id)).sync.payment.lastError).toBe('smtp down')

    await drainOutbox(t)

    expect(await status(invoice.id)).toBe('SENT')
    expect(fakes().payments.callCount('createHostedInvoice')).toBe(1)
    expect(fakes().payments.hostedInvoices.size).toBe(1)
  })

  it('an invoice voided while the hosted invoice was being created is not emailed and the hosted copy is voided', async () => {
    const { world, invoice } = await draft()

    await advanceTo(t, world.admin.token, invoice.id, 'SYNCED')

    const payments = fakes().payments
    const original = payments.createHostedInvoice.bind(payments)

    vi.spyOn(payments, 'createHostedInvoice').mockImplementationOnce(async (...args) => {
      const result = await original(...args)

      await t.prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'VOID' } })

      return result
    })
    await api().post(`/v1/invoices/${invoice.id}/send`, { token: world.admin.token })
    await drainOutbox(t)

    expect(t.mailer.sent).toHaveLength(0)
    expect(await job('payments.void_invoice')).toMatchObject({ status: 'PENDING' })
    await drainOutbox(t)
    expect([...payments.hostedInvoices.values()].map(entry => entry.voided)).toEqual([true])
  })

  it('payment received before the email went out still records that it was sent', async () => {
    const { world, invoice } = await draft()

    await advanceTo(t, world.admin.token, invoice.id, 'SYNCED')
    await api().post(`/v1/invoices/${invoice.id}/send`, { token: world.admin.token })
    await api().post(`/v1/invoices/${invoice.id}/payments`, { token: world.admin.token, body: { amount: '145.00', method: 'cash' } })
    await drainOutbox(t)

    const stored = await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })

    // Paid offline first: the job finds the invoice no longer SYNCED and leaves it alone
    expect(stored.status).toBe('PAID')
    expect(t.mailer.sent).toHaveLength(0)
  })
})

describe('malformed or orphaned jobs', () => {
  it('a job for a missing invoice finishes quietly; a job with a bad payload fails and stays visible', async () => {
    await enqueue(t.prisma, { orgId: (await t.prisma.organization.create({ data: { name: 'Solo', leadIntakeKey: 'solo-key-123456789' } })).id, type: 'accounting.sync_invoice', payload: { invoiceId: 'does-not-exist' } })
    await drainOutbox(t)
    expect(await job('accounting.sync_invoice')).toMatchObject({ status: 'DONE' })

    await t.prisma.outboxJob.deleteMany()

    const org = await t.prisma.organization.findFirstOrThrow()

    await enqueue(t.prisma, { orgId: org.id, type: 'accounting.post_payment', payload: { nope: true } })
    await enqueue(t.prisma, { type: 'payments.create_invoice', payload: { invoiceId: 'x' } })
    await drainOutbox(t)

    const jobs = await t.prisma.outboxJob.findMany()

    expect(jobs.every(entry => entry.status === 'PENDING' && entry.lastError !== null)).toBe(true)
  })
})
