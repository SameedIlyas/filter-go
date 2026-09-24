import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { InvoiceStatus } from '../src/generated/prisma/client.js'
import { D } from '../src/lib/money.js'
import { TRANSITIONS } from '../src/modules/invoices/invoice-state.js'
import { body, client, createTestApp, makeClient, makeContract, makeSchedule, makeSite, resetDb, signIn } from './helpers.js'
import type { TestApp } from './helpers.js'
import { addVisit, advanceTo, approve, drainOutbox, flatLines, makeWorld, runInvoice } from './invoices.helpers.js'
import type { InvoiceJson, World } from './invoices.helpers.js'

let t: TestApp

beforeAll(async () => {
  t = await createTestApp()
})
afterAll(() => t.close())
beforeEach(async () => {
  await resetDb(t.prisma)
  t.mailer.clear()
})

const api = () => client(t.app)

/** A world with one billed visit and a DRAFT invoice for it. */
const draftWorld = async (input: Parameters<typeof makeWorld>[1] = {}) => {
  const world = await makeWorld(t, input)

  await addVisit(t, world, { day: '2026-03-02' })

  return { world, invoice: await runInvoice(t, world) }
}

const setStatus = (id: string, status: InvoiceStatus, extra: { amountPaid?: string } = {}) =>
  t.prisma.invoice.update({ where: { id }, data: { status, ...(extra.amountPaid ? { amountPaid: D(extra.amountPaid) } : {}) } })

const foreignAdmin = async () => {
  const org = await t.prisma.organization.create({ data: { name: `Foreign ${randomUUID()}`, leadIntakeKey: randomUUID() } })

  return signIn(t, 'ADMIN', { orgId: org.id })
}

describe('access: guards, isolation, validation', () => {
  it('every endpoint: 401 anonymous, 403 for supervisor and field user', async () => {
    const { world, invoice } = await draftWorld()
    const supervisor = await signIn(t, 'SUPERVISOR')
    const field = await signIn(t, 'FIELD_USER')
    const id = invoice.id
    const routes: Array<[string, string, object | undefined]> = [
      ['POST', '/v1/invoices/runs', { contractId: randomUUID(), periodStart: '2026-03-01', periodEnd: '2026-03-31' }],
      ['GET', '/v1/invoices', undefined],
      ['GET', `/v1/invoices/${id}`, undefined],
      ['PATCH', `/v1/invoices/${id}`, { notes: 'x' }],
      ['POST', `/v1/invoices/${id}/lines`, { description: 'x', qty: 1, unitRate: 1 }],
      ['DELETE', `/v1/invoices/${id}/lines/${randomUUID()}`, undefined],
      ['DELETE', `/v1/invoices/${id}`, undefined],
      ['POST', `/v1/invoices/${id}/approve`, undefined],
      ['POST', `/v1/invoices/${id}/void`, { reason: 'x' }],
      ['POST', `/v1/invoices/${id}/send`, undefined],
      ['POST', `/v1/invoices/${id}/payments`, { amount: 1, method: 'cash' }],
      ['POST', `/v1/invoices/${id}/retry-sync`, undefined],
      ['GET', `/v1/invoices/${id}/trace`, undefined]
    ]

    for (const [method, url, payload] of routes) {
      const call = (token?: string) => t.app.inject({ method: method as 'GET', url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} })

      expect((await call()).statusCode, `${method} ${url} anonymous`).toBe(401)
      expect((await call(supervisor.token)).statusCode, `${method} ${url} supervisor`).toBe(403)
      expect((await call(field.token)).statusCode, `${method} ${url} field user`).toBe(403)
    }

    // A client user may only read
    const clientUser = await signIn(t, 'CLIENT_USER', { clientId: world.fixture.client.id })

    for (const [method, url, payload] of routes.filter(([verb, path]) => verb !== 'GET' || path.endsWith('/trace'))) {
      const response = await t.app.inject({ method: method as 'GET', url, payload, headers: { authorization: `Bearer ${clientUser.token}` } })

      expect(response.statusCode, `${method} ${url} client user`).toBe(403)
    }
  })

  it('other organizations get 404 on every id endpoint and cannot list the invoice', async () => {
    const { invoice } = await draftWorld()
    const foreign = await foreignAdmin()
    const id = invoice.id
    const routes: Array<[string, string, object | undefined]> = [
      ['GET', `/v1/invoices/${id}`, undefined],
      ['PATCH', `/v1/invoices/${id}`, { notes: 'x' }],
      ['POST', `/v1/invoices/${id}/lines`, { description: 'x', qty: 1, unitRate: 1 }],
      ['DELETE', `/v1/invoices/${id}/lines/${randomUUID()}`, undefined],
      ['DELETE', `/v1/invoices/${id}`, undefined],
      ['POST', `/v1/invoices/${id}/approve`, undefined],
      ['POST', `/v1/invoices/${id}/void`, { reason: 'x' }],
      ['POST', `/v1/invoices/${id}/send`, undefined],
      ['POST', `/v1/invoices/${id}/payments`, { amount: 1, method: 'cash' }],
      ['POST', `/v1/invoices/${id}/retry-sync`, undefined],
      ['GET', `/v1/invoices/${id}/trace`, undefined]
    ]

    for (const [method, url, payload] of routes) {
      const response = await t.app.inject({ method: method as 'GET', url, payload, headers: { authorization: `Bearer ${foreign.token}` } })

      expect(response.statusCode, `${method} ${url}`).toBe(404)
      expect(body(response).error?.code).toBe('NOT_FOUND')
    }

    expect(body(await api().get('/v1/invoices', { token: foreign.token })).data?.invoices).toEqual([])
    expect((await t.prisma.invoice.findUniqueOrThrow({ where: { id } })).status).toBe('DRAFT')
  })

  it('bad ids and strict bodies are 400', async () => {
    const { world, invoice } = await draftWorld()
    const token = world.admin.token

    for (const url of ['/v1/invoices/nope', '/v1/invoices/nope/trace']) expect((await api().get(url, { token })).statusCode).toBe(400)

    expect((await api().post('/v1/invoices/nope/approve', { token })).statusCode).toBe(400)
    expect((await api().delete(`/v1/invoices/${invoice.id}/lines/nope`, { token })).statusCode).toBe(400)
    expect((await api().patch(`/v1/invoices/${invoice.id}`, { token, body: { notes: 'a', total: '1.00' } })).statusCode).toBe(400)
    expect((await api().patch(`/v1/invoices/${invoice.id}`, { token, body: {} })).statusCode).toBe(400)
    expect((await api().post(`/v1/invoices/${invoice.id}/void`, { token, body: {} })).statusCode).toBe(400)
    expect((await api().post(`/v1/invoices/${invoice.id}/approve`, { token, body: { force: true } })).statusCode).toBe(400)
    expect((await api().post(`/v1/invoices/${invoice.id}/lines`, { token, body: { description: 'x', qty: 1, unitRate: 1, amount: 5 } })).statusCode).toBe(400)
    expect((await api().post(`/v1/invoices/${invoice.id}/lines`, { token, body: { description: 'x', qty: 0, unitRate: 1 } })).statusCode).toBe(400)
    expect((await api().post(`/v1/invoices/${invoice.id}/lines`, { token, body: { description: 'x', qty: 1, unitRate: '1.234' } })).statusCode).toBe(400)
    expect((await api().get('/v1/invoices', { token, query: { status: 'BOGUS' } })).statusCode).toBe(400)
    expect((await api().get('/v1/invoices', { token, query: { limit: '1000' } })).statusCode).toBe(400)
    expect((await api().get('/v1/invoices', { token, query: { unknown: '1' } })).statusCode).toBe(400)
    expect((await api().get(`/v1/invoices/${randomUUID()}`, { token })).statusCode).toBe(404)
  })
})

describe('draft edits recompute totals and keep timesheets consistent', () => {
  it('PATCH updates due date and notes; due date before issue date is refused', async () => {
    const { world, invoice } = await draftWorld()
    const token = world.admin.token
    const patched = await api().patch(`/v1/invoices/${invoice.id}`, { token, body: { dueDate: '2099-01-01', notes: 'Net 90 agreed' } })

    expect(patched.statusCode).toBe(200)
    expect(body(patched).data?.invoice).toMatchObject({ dueDate: '2099-01-01', notes: 'Net 90 agreed' })
    expect((await api().patch(`/v1/invoices/${invoice.id}`, { token, body: { dueDate: '2000-01-01' } })).statusCode).toBe(400)
    expect(body(await api().patch(`/v1/invoices/${invoice.id}`, { token, body: { notes: null } })).data?.invoice).toMatchObject({ notes: null })
    expect((await t.prisma.auditEvent.findMany({ where: { entityId: invoice.id, action: 'updated' } })).length).toBe(2)
  })

  it('adds a manual line (taxed, with a site) and the totals are recomputed from the stored lines', async () => {
    const { world, invoice } = await draftWorld()
    const token = world.admin.token

    await t.prisma.taxRate.create({ data: { orgId: world.admin.user.orgId, code: 'GST', ratePercent: D('8.25') } })

    const added = await api().post(`/v1/invoices/${invoice.id}/lines`, {
      token,
      body: { description: 'Emergency call-out', qty: '2.5', unitRate: '33.33', siteId: world.fixture.site.id, taxCode: 'GST' }
    })
    const updated = body(added).data?.invoice as InvoiceJson

    expect(added.statusCode).toBe(201)
    // 2.5 * 33.33 = 83.325 -> 83.33; 83.33 * 8.25% = 6.874725 -> 6.87
    expect(flatLines(updated).find(line => line.description === 'Emergency call-out')).toMatchObject({ qty: '2.5000', amount: '83.33', taxAmount: '6.87', sourceType: 'MANUAL' })
    expect(updated.subtotal).toBe('228.33')
    expect(updated.tax).toBe('6.87')
    expect(updated.total).toBe('235.20')

    const noSite = await api().post(`/v1/invoices/${invoice.id}/lines`, { token, body: { description: 'Admin fee', qty: 1, unitRate: '10.00' } })
    const groups = (body(noSite).data?.invoice as InvoiceJson).sites

    // The line without a site is grouped last with siteId null
    expect(groups[groups.length - 1]).toMatchObject({ siteId: null, siteName: null, subtotal: '10.00' })
    expect((body(noSite).data?.invoice as InvoiceJson).total).toBe('245.20')
  })

  it('a manual line must use a site of the invoice client and an existing tax code', async () => {
    const { world, invoice } = await draftWorld()
    const otherClientSite = await makeSite(t, { orgId: world.admin.user.orgId })
    const foreignSite = await makeSite(t, { orgId: (await foreignAdmin()).user.orgId })
    const send = (payload: object) => api().post(`/v1/invoices/${invoice.id}/lines`, { token: world.admin.token, body: { description: 'x', qty: 1, unitRate: 1, ...payload } })

    expect((await send({ siteId: otherClientSite.id })).statusCode).toBe(400)
    expect((await send({ siteId: foreignSite.id })).statusCode).toBe(400)
    expect((await send({ siteId: randomUUID() })).statusCode).toBe(400)
    expect((await send({ taxCode: 'NOPE' })).statusCode).toBe(400)
    expect((await send({ qty: '99999999', unitRate: '9999999999' })).statusCode).toBe(400)
    expect(await t.prisma.invoiceLine.count({ where: { invoiceId: invoice.id, sourceType: 'MANUAL' } })).toBe(0)
  })

  it('removing a timesheet line returns its entry to APPROVED; other entries stay invoiced', async () => {
    const world = await makeWorld(t, { billingType: 'HOURLY' })
    const first = await addVisit(t, world, { day: '2026-03-02', actualMinutes: 120 })
    const second = await addVisit(t, world, { day: '2026-03-03', actualMinutes: 60 })
    const invoice = await runInvoice(t, world)
    const line = await t.prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: invoice.id, sourceId: first.entry.id } })
    const removed = await api().delete(`/v1/invoices/${invoice.id}/lines/${line.id}`, { token: world.admin.token })

    expect(removed.statusCode).toBe(200)
    expect((body(removed).data?.invoice as InvoiceJson).total).toBe('145.00')
    expect((await t.prisma.timesheetEntry.findUniqueOrThrow({ where: { id: first.entry.id } })).status).toBe('APPROVED')
    expect((await t.prisma.timesheetEntry.findUniqueOrThrow({ where: { id: second.entry.id } })).status).toBe('INVOICED')
    expect((await api().delete(`/v1/invoices/${invoice.id}/lines/${line.id}`, { token: world.admin.token })).statusCode).toBe(404)
  })

  it('a visit with several lines is released only when its LAST line is removed', async () => {
    const world = await makeWorld(t, { lines: [{ description: 'Main', billRate: '100.00' }, { description: 'Extra', qty: '2', billRate: '10.00' }] })
    const visit = await addVisit(t, world, { day: '2026-03-02', billRate: '100.00' })
    const invoice = await runInvoice(t, world)
    const [a, b] = await t.prisma.invoiceLine.findMany({ where: { invoiceId: invoice.id }, orderBy: { description: 'asc' } })

    await api().delete(`/v1/invoices/${invoice.id}/lines/${a?.id}`, { token: world.admin.token })
    expect((await t.prisma.timesheetEntry.findUniqueOrThrow({ where: { id: visit.entry.id } })).status).toBe('INVOICED')
    await api().delete(`/v1/invoices/${invoice.id}/lines/${b?.id}`, { token: world.admin.token })
    expect((await t.prisma.timesheetEntry.findUniqueOrThrow({ where: { id: visit.entry.id } })).status).toBe('APPROVED')
  })

  it('DELETE removes the draft and returns every entry (also monthly-fixed ones, which have no lines)', async () => {
    const world = await makeWorld(t, { billingType: 'MONTHLY_FIXED', lines: [{ billRate: '500.00' }] })

    await addVisit(t, world, { day: '2026-03-02' })
    await addVisit(t, world, { day: '2026-03-09' })

    const invoice = await runInvoice(t, world)

    expect(await t.prisma.timesheetEntry.count({ where: { status: 'INVOICED' } })).toBe(2)

    const deleted = await api().delete(`/v1/invoices/${invoice.id}`, { token: world.admin.token })

    expect(deleted.statusCode).toBe(200)
    expect(body(deleted).data).toEqual({ deleted: true, id: invoice.id })
    expect(await t.prisma.invoice.count()).toBe(0)
    expect(await t.prisma.invoiceLine.count()).toBe(0)
    expect(await t.prisma.timesheetEntry.count({ where: { status: 'APPROVED' } })).toBe(2)
    expect((await t.prisma.auditEvent.findFirstOrThrow({ where: { entityId: invoice.id, action: 'deleted' } })).diff).toMatchObject({ releasedTimesheets: 2 })
    // ... and the period can be run again
    expect((await runInvoice(t, world)).total).toBe('500.00')
  })

  it('every edit of a non-draft invoice is INVOICE_NOT_EDITABLE (money is immutable once approved)', async () => {
    const { world, invoice } = await draftWorld()
    const token = world.admin.token
    const lineId = (await t.prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: invoice.id } })).id

    await advanceTo(t, token, invoice.id, 'APPROVED')

    const attempts = [
      api().patch(`/v1/invoices/${invoice.id}`, { token, body: { notes: 'x' } }),
      api().post(`/v1/invoices/${invoice.id}/lines`, { token, body: { description: 'x', qty: 1, unitRate: 1 } }),
      api().delete(`/v1/invoices/${invoice.id}/lines/${lineId}`, { token }),
      api().delete(`/v1/invoices/${invoice.id}`, { token })
    ]

    for (const response of await Promise.all(attempts)) {
      expect(response.statusCode).toBe(409)
      expect(body(response).error?.code).toBe('INVOICE_NOT_EDITABLE')
    }

    expect((await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).total.toFixed(2)).toBe('145.00')
    expect(await t.prisma.invoiceLine.count({ where: { invoiceId: invoice.id } })).toBe(1)
  })
})

describe('state machine', () => {
  const statuses = Object.keys(TRANSITIONS) as InvoiceStatus[]

  const attempt = async (world: World, id: string, action: 'approve' | 'void' | 'send' | 'payment') => {
    const token = world.admin.token
    const paths = {
      approve: () => api().post(`/v1/invoices/${id}/approve`, { token }),
      void: () => api().post(`/v1/invoices/${id}/void`, { token, body: { reason: 'test' } }),
      send: () => api().post(`/v1/invoices/${id}/send`, { token }),
      payment: () => api().post(`/v1/invoices/${id}/payments`, { token, body: { amount: '1.00', method: 'bank_transfer' } })
    }

    return paths[action]()
  }

  const ALLOWED: Record<'approve' | 'void' | 'send' | 'payment', InvoiceStatus[]> = {
    approve: ['DRAFT'],
    void: ['DRAFT', 'APPROVED', 'SYNCED', 'SENT'],
    send: ['SYNCED'],
    payment: ['SYNCED', 'SENT', 'PARTIALLY_PAID']
  }

  for (const action of Object.keys(ALLOWED) as Array<keyof typeof ALLOWED>) {
    for (const status of statuses) {
      it(`${action} from ${status} is ${ALLOWED[action].includes(status) ? 'allowed' : 'INVALID_STATE'}`, async () => {
        const { world, invoice } = await draftWorld()

        await setStatus(invoice.id, status, status === 'PAID' ? { amountPaid: '145.00' } : status === 'PARTIALLY_PAID' ? { amountPaid: '10.00' } : {})

        // A partial payment exists for the states that imply one, so "void with payments" is not what this row tests
        const response = await attempt(world, invoice.id, action)

        if (ALLOWED[action].includes(status)) {
          expect(response.statusCode, response.body).toBeLessThan(300)
        } else {
          expect(response.statusCode).toBe(409)
          expect(body(response).error?.code).toBe('INVALID_STATE')
          expect(body(response).error?.details?.from).toBe(status)
          expect(Array.isArray(body(response).error?.details?.allowed)).toBe(true)
        }
      })
    }
  }

  it('walks the full happy path DRAFT -> APPROVED -> SYNCED -> SENT -> PARTIALLY_PAID -> PAID', async () => {
    const { world, invoice } = await draftWorld()
    const token = world.admin.token
    const status = async () => (await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status

    await approve(t, token, invoice.id)
    expect(await status()).toBe('APPROVED')
    await drainOutbox(t)
    expect(await status()).toBe('SYNCED')
    await api().post(`/v1/invoices/${invoice.id}/send`, { token })
    await drainOutbox(t)
    expect(await status()).toBe('SENT')
    await api().post(`/v1/invoices/${invoice.id}/payments`, { token, body: { amount: '100.00', method: 'cash' } })
    expect(await status()).toBe('PARTIALLY_PAID')
    await api().post(`/v1/invoices/${invoice.id}/payments`, { token, body: { amount: '45.00', method: 'cash' } })
    expect(await status()).toBe('PAID')
  })

  it('void: entries return to APPROVED and provider objects are voided by the outbox', async () => {
    const { world, invoice } = await draftWorld()
    const token = world.admin.token

    await advanceTo(t, token, invoice.id, 'SENT')

    const voided = await api().post(`/v1/invoices/${invoice.id}/void`, { token, body: { reason: 'Wrong client' } })

    expect(voided.statusCode).toBe(200)
    expect(body(voided).data?.invoice).toMatchObject({ status: 'VOID' })
    expect(await t.prisma.timesheetEntry.count({ where: { status: 'APPROVED' } })).toBe(1)
    expect((await t.prisma.auditEvent.findFirstOrThrow({ where: { entityId: invoice.id, action: 'voided' } })).diff).toMatchObject({ from: 'SENT', reason: 'Wrong client', releasedTimesheets: 1 })
    expect(await t.prisma.outboxJob.findMany({ where: { dedupeKey: { in: [`invoice:${invoice.id}:void`, `invoice:${invoice.id}:void-hosted`] } } })).toHaveLength(2)
  })

  it('an invoice that received a payment cannot be voided', async () => {
    const { world, invoice } = await draftWorld()
    const token = world.admin.token

    await advanceTo(t, token, invoice.id, 'SYNCED')
    await api().post(`/v1/invoices/${invoice.id}/payments`, { token, body: { amount: '10.00', method: 'cash' } })

    // PARTIALLY_PAID is not a voidable state...
    expect((await api().post(`/v1/invoices/${invoice.id}/void`, { token, body: { reason: 'x' } })).statusCode).toBe(409)

    // ...and neither is a SYNCED invoice that somehow carries a payment row
    await t.prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'SYNCED' } })

    const guarded = await api().post(`/v1/invoices/${invoice.id}/void`, { token, body: { reason: 'x' } })

    expect(guarded.statusCode).toBe(409)
    expect(body(guarded).error?.code).toBe('CONFLICT')
  })

  it('approve: needs lines and a positive total; double approve is one approval and one sync job', async () => {
    const empty = await draftWorld()
    const line = await t.prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: empty.invoice.id } })

    await api().delete(`/v1/invoices/${empty.invoice.id}/lines/${line.id}`, { token: empty.world.admin.token })
    expect(body(await approve(t, empty.world.admin.token, empty.invoice.id)).error?.code).toBe('UNPROCESSABLE')

    const { world, invoice } = await draftWorld()
    const responses = await Promise.all([1, 2, 3].map(() => approve(t, world.admin.token, invoice.id)))

    expect(responses.map(response => response.statusCode).sort()).toEqual([200, 409, 409])
    expect(await t.prisma.outboxJob.count({ where: { dedupeKey: `invoice:${invoice.id}:sync` } })).toBe(1)

    const stored = await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })

    expect(stored.approvedById).toBe(world.admin.user.id)
    expect(stored.approvedAt).not.toBeNull()
    expect((await t.prisma.auditEvent.findMany({ where: { entityId: invoice.id, action: 'approved' } })).length).toBe(1)
  })

  it('send emails the billing address with the pay link, escaped, and stores the hosted invoice', async () => {
    const world = await makeWorld(t)
    const evil = await t.prisma.client.update({ where: { id: world.fixture.client.id }, data: { legalName: '<img src=x onerror=alert(1)> & "Co"', billingEmail: 'ap@client.test' } })

    await addVisit(t, world, { day: '2026-03-02' })

    const invoice = await runInvoice(t, world)

    await advanceTo(t, world.admin.token, invoice.id, 'SYNCED')
    expect(body(await api().post(`/v1/invoices/${invoice.id}/send`, { token: world.admin.token })).data?.invoice).toMatchObject({ status: 'SYNCED' })
    await drainOutbox(t)

    const stored = await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })

    expect(stored).toMatchObject({ status: 'SENT' })
    expect(stored.stripeInvoiceId).toMatch(/^in_fake_/)
    expect(stored.paymentUrl).toBe(`https://pay.fake-stripe.test/i/${stored.stripeInvoiceId}`)
    expect(stored.sentAt).not.toBeNull()
    expect(t.mailer.sent).toHaveLength(1)

    const mail = t.mailer.sent[0]

    expect(mail?.to).toBe(evil.billingEmail)
    expect(mail?.subject).toContain(invoice.invoiceNumber)
    expect(mail?.text).toContain(stored.paymentUrl)
    expect(mail?.html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;Co&quot;')
    expect(mail?.html).not.toContain('<img')
    expect((await t.prisma.client.findUniqueOrThrow({ where: { id: evil.id } })).stripeCustomerId).toMatch(/^cus_fake_/)
  })
})

describe('visibility', () => {
  const setup = async () => {
    const world = await makeWorld(t)

    await addVisit(t, world, { day: '2026-03-02' })

    const invoice = await runInvoice(t, world)
    const clientUser = await signIn(t, 'CLIENT_USER', { clientId: world.fixture.client.id })

    await t.prisma.invoice.update({ where: { id: invoice.id }, data: { notes: 'internal: chase them', flags: { unapprovedTimesheets: 2, noShows: 1 } } })

    return { world, invoice, clientUser }
  }

  it('a client user never sees DRAFT or VOID invoices (404) but does see APPROVED..PAID', async () => {
    const { invoice, clientUser } = await setup()
    const visible: InvoiceStatus[] = ['APPROVED', 'SYNCED', 'SENT', 'PARTIALLY_PAID', 'PAID']

    for (const status of ['DRAFT', 'VOID'] as InvoiceStatus[]) {
      await setStatus(invoice.id, status)
      expect((await api().get(`/v1/invoices/${invoice.id}`, { token: clientUser.token })).statusCode, status).toBe(404)
      expect(body(await api().get('/v1/invoices', { token: clientUser.token })).data?.invoices).toEqual([])
    }

    for (const status of visible) {
      await setStatus(invoice.id, status)
      expect((await api().get(`/v1/invoices/${invoice.id}`, { token: clientUser.token })).statusCode, status).toBe(200)
      expect((body(await api().get('/v1/invoices', { token: clientUser.token })).data?.invoices as unknown[]).length).toBe(1)
    }
  })

  it('a client user only sees their own client: another client and another org are 404', async () => {
    const { invoice } = await setup()
    const otherClient = await makeClient(t)
    const stranger = await signIn(t, 'CLIENT_USER', { clientId: otherClient.id })

    await setStatus(invoice.id, 'SENT')
    expect((await api().get(`/v1/invoices/${invoice.id}`, { token: stranger.token })).statusCode).toBe(404)
    expect(body(await api().get('/v1/invoices', { token: stranger.token })).data?.invoices).toEqual([])
  })

  it('a client user without a client sees nothing', async () => {
    const { invoice } = await setup()
    const { token } = await signIn(t, 'CLIENT_USER', { clientId: null })

    await setStatus(invoice.id, 'SENT')
    expect(body(await api().get('/v1/invoices', { token })).data?.invoices).toEqual([])
    expect((await api().get(`/v1/invoices/${invoice.id}`, { token })).statusCode).toBe(404)
  })

  it('redaction: a client sees amounts and the pay link only; an admin sees everything', async () => {
    const { world, invoice, clientUser } = await setup()

    await advanceTo(t, world.admin.token, invoice.id, 'SENT')
    await t.prisma.invoice.update({ where: { id: invoice.id }, data: { notes: 'internal: chase them', flags: { unapprovedTimesheets: 2, noShows: 1 } } })
    await api().post(`/v1/invoices/${invoice.id}/payments`, { token: world.admin.token, body: { amount: '20.00', method: 'cash', externalRef: 'CHK-1' } })

    const asClient = body(await api().get(`/v1/invoices/${invoice.id}`, { token: clientUser.token })).data?.invoice as Record<string, unknown>
    const asAdmin = body(await api().get(`/v1/invoices/${invoice.id}`, { token: world.admin.token })).data?.invoice as Record<string, unknown>
    const clientList = (body(await api().get('/v1/invoices', { token: clientUser.token })).data?.invoices as Array<Record<string, unknown>>)[0] ?? {}

    for (const view of [asClient, clientList]) {
      for (const key of ['flags', 'sync', 'notes', 'accountingRef', 'stripeInvoiceId', 'approvedById', 'createdById', 'accountingSyncedAt']) {
        expect(Object.keys(view), key).not.toContain(key)
      }
    }

    expect(asClient).toMatchObject({ total: '145.00', amountPaid: '20.00', balance: '125.00', status: 'PARTIALLY_PAID' })
    expect(typeof asClient.paymentUrl).toBe('string')

    const clientLine = (asClient.sites as Array<{ lines: Array<Record<string, unknown>> }>)[0]?.lines[0] ?? {}

    expect(Object.keys(clientLine).sort()).toEqual(['amount', 'description', 'id', 'qty', 'siteId', 'siteName', 'taxAmount', 'taxCode'])

    const clientPayment = (asClient.payments as Array<Record<string, unknown>>)[0] ?? {}

    expect(Object.keys(clientPayment).sort()).toEqual(['amount', 'id', 'method', 'receivedAt'])
    expect(asAdmin).toMatchObject({ notes: 'internal: chase them', flags: { unapprovedTimesheets: 2, noShows: 1 } })
    expect(asAdmin.accountingRef).toMatch(/^QB-INV-/)
    expect(asAdmin.stripeInvoiceId).toMatch(/^in_fake_/)
    expect((asAdmin.sites as Array<{ lines: Array<Record<string, unknown>> }>)[0]?.lines[0]).toHaveProperty('unitRate', '145.00')
    expect((asAdmin.payments as Array<Record<string, unknown>>)[0]).toMatchObject({ externalRef: 'CHK-1' })
  })
})

describe('lists and detail', () => {
  it('filters by status, client, contract, issue date and number; paginates', async () => {
    const world = await makeWorld(t)

    await addVisit(t, world, { day: '2026-03-02' })
    await addVisit(t, world, { day: '2026-04-06' })

    const one = await runInvoice(t, world, { start: '2026-03-01', end: '2026-03-31' })
    const two = await runInvoice(t, world, { start: '2026-04-01', end: '2026-04-30' })
    const otherContract = await makeContract(t)
    const otherSchedule = await makeSchedule(t, otherContract, { periodStart: '2026-03-01', periodEnd: '2026-03-31' })

    await addVisit(t, { schedule: otherSchedule, worker: world.worker }, { day: '2026-03-02' })
    await runInvoice(t, { admin: world.admin, fixture: otherContract })
    await setStatus(two.id, 'APPROVED')

    const list = async (query: Record<string, string>) => body(await api().get('/v1/invoices', { token: world.admin.token, query }))

    expect((await list({})).meta).toMatchObject({ total: 3, page: 1, limit: 20, totalPages: 1 })
    expect(((await list({ status: 'APPROVED' })).data?.invoices as Array<{ id: string }>).map(invoice => invoice.id)).toEqual([two.id])
    expect(((await list({ contractId: world.fixture.contract.id })).data?.invoices as unknown[]).length).toBe(2)
    expect(((await list({ clientId: otherContract.client.id })).data?.invoices as unknown[]).length).toBe(1)
    expect(((await list({ q: one.invoiceNumber.toLowerCase() })).data?.invoices as Array<{ id: string }>).map(invoice => invoice.id)).toEqual([one.id])
    expect(((await list({ from: '2999-01-01' })).data?.invoices as unknown[]).length).toBe(0)
    expect(((await list({ to: '2000-01-01' })).data?.invoices as unknown[]).length).toBe(0)

    const paged = await list({ limit: '2', page: '2' })

    expect(paged.meta).toMatchObject({ total: 3, page: 2, limit: 2, totalPages: 2 })
    expect((paged.data?.invoices as unknown[]).length).toBe(1)
  })

  it('detail groups lines by site (site name order) with exact per-site subtotals and sync state', async () => {
    const world = await makeWorld(t, { lines: [{ description: 'Visit', billRate: '100.00' }] })
    const zulu = await makeSite(t, { orgId: world.admin.user.orgId, clientId: world.fixture.client.id, name: 'Zulu Plant' })
    const alpha = await makeSite(t, { orgId: world.admin.user.orgId, clientId: world.fixture.client.id, name: 'Alpha Depot' })

    for (const site of [zulu, alpha]) {
      await t.prisma.contractLine.create({ data: { contractId: world.fixture.contract.id, siteId: site.id, description: 'Visit', qty: D(1), billRate: D('50.05') } })

      const lines = await t.prisma.contractLine.findMany({ where: { contractId: world.fixture.contract.id } })
      const schedule = await makeSchedule(t, { ...world.fixture, site, lines: lines.filter(line => line.siteId === site.id), coverage: [] }, { periodStart: '2026-03-01', periodEnd: '2026-03-31' })

      await addVisit(t, { schedule, worker: world.worker }, { day: '2026-03-03', billRate: '50.05' })
      await addVisit(t, { schedule, worker: world.worker }, { day: '2026-03-04', billRate: '50.05' })
    }

    await addVisit(t, world, { day: '2026-03-02', billRate: '100.00' })

    const invoice = await runInvoice(t, world)

    expect(invoice.sites.map(site => site.siteName)).toEqual(['Alpha Depot', world.fixture.site.name, 'Zulu Plant'])
    expect(invoice.sites.map(site => site.subtotal)).toEqual(['100.10', '100.00', '100.10'])
    expect(invoice.sites[0]?.lines.map(line => line.description?.slice(-10))).toEqual(['2026-03-03', '2026-03-04'])
    expect(invoice.total).toBe('300.20')
    expect(invoice.sync).toEqual({ accounting: { state: 'NONE', lastError: null }, payment: { state: 'NONE', lastError: null } })
  })
})
