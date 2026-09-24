import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { D } from '../src/lib/money.js'
import { localDate, toDateOnly } from '../src/lib/time.js'
import { body, client, createTestApp, createUser, makeClient, makeContract, makeSchedule, makeSite, resetDb, signIn } from './helpers.js'
import type { TestApp } from './helpers.js'
import { addVisit, cents, flatLines, makeWorld, postRun, runInvoice } from './invoices.helpers.js'

let t: TestApp

beforeAll(async () => {
  t = await createTestApp()
})
afterAll(() => t.close())
beforeEach(async () => {
  await resetDb(t.prisma)
  t.mailer.clear()
})

const taxRate = (code: string, ratePercent: string, orgId: string) => t.prisma.taxRate.create({ data: { orgId, code, ratePercent: D(ratePercent) } })

describe('invoice run: pricing from snapshots, rounding, totals', () => {
  it('HOURLY: qty is hours with 4 decimals, amount = round2(qty * rate), totals equal the stored lines exactly', async () => {
    const world = await makeWorld(t, { billingType: 'HOURLY', lines: [{ billRate: '145.00', description: 'Cleaning' }] })

    await addVisit(t, world, { day: '2026-03-02', actualMinutes: 460 })
    await addVisit(t, world, { day: '2026-03-03', actualMinutes: 1 })
    await addVisit(t, world, { day: '2026-03-04', actualMinutes: 20 })

    const invoice = await runInvoice(t, world)
    const lines = flatLines(invoice)

    expect(lines.map(line => [line.qty, line.amount]).sort()).toEqual(
      [
        ['7.6667', '1111.67'], // 7.6667 * 145 = 1111.6715
        ['0.0167', '2.42'], // 0.0167 * 145 = 2.4215
        ['0.3333', '48.33'] // 0.3333 * 145 = 48.3285
      ].sort()
    )
    expect(invoice.subtotal).toBe('1162.42')
    expect(invoice.tax).toBe('0.00')
    expect(invoice.total).toBe('1162.42')

    const stored = await t.prisma.invoiceLine.findMany({ where: { invoiceId: invoice.id } })
    const header = await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })

    expect(header.subtotal.toFixed(2)).toBe(stored.reduce((total, line) => total.plus(line.amount), D(0)).toFixed(2))
    expect(header.total.toFixed(2)).toBe(header.subtotal.plus(header.tax).toFixed(2))
    for (const line of stored) expect(line.amount.toFixed(2)).toBe(line.qty.mul(line.unitRate).toDecimalPlaces(2, 4).toFixed(2))
  })

  it('rounds each line half up and taxes each ROUNDED line, then sums (multiple tax codes, no tax code)', async () => {
    const world = await makeWorld(t, {
      billingType: 'PER_VISIT',
      lines: [
        { description: 'Deep clean', qty: '1', billRate: '10.05', taxCode: 'GST' },
        { description: 'Supplies', qty: '2.5', billRate: '0.01', taxCode: 'PST' },
        { description: 'Fee', qty: '1', billRate: '3.33' }
      ]
    })

    await taxRate('GST', '8.250', world.fixture.contract.orgId)
    await taxRate('PST', '7.000', world.fixture.contract.orgId)
    await addVisit(t, world, { day: '2026-03-02', billRate: '10.05' })

    const invoice = await runInvoice(t, world)
    const byDescription = Object.fromEntries(flatLines(invoice).map(line => [line.description?.split(' - ')[0], line]))

    // 10.05 * 8.25% = 0.829125 -> 0.83
    expect(byDescription['Deep clean']).toMatchObject({ qty: '1.0000', amount: '10.05', taxCode: 'GST', taxAmount: '0.83' })
    // 2.5 * 0.01 = 0.025 -> 0.03 (half up); 0.03 * 7% = 0.0021 -> 0.00
    expect(byDescription['Supplies']).toMatchObject({ amount: '0.03', taxCode: 'PST', taxAmount: '0.00' })
    expect(byDescription['Fee']).toMatchObject({ amount: '3.33', taxCode: null, taxAmount: '0.00' })
    expect(invoice.subtotal).toBe('13.41')
    expect(invoice.tax).toBe('0.83')
    expect(invoice.total).toBe('14.24')
  })

  it('sums rounded line tax (three 0.825 taxes are 3 x 0.83, not round(2.475))', async () => {
    const world = await makeWorld(t, { billingType: 'PER_VISIT', lines: [{ billRate: '10.00', taxCode: 'GST' }] })

    await taxRate('GST', '8.250', world.fixture.contract.orgId)
    for (const day of ['2026-03-02', '2026-03-03', '2026-03-04']) await addVisit(t, world, { day, billRate: '10.00' })

    const invoice = await runInvoice(t, world)

    expect(flatLines(invoice).map(line => line.taxAmount)).toEqual(['0.83', '0.83', '0.83'])
    expect(invoice.tax).toBe('2.49')
    expect(invoice.total).toBe('32.49')
  })

  it('refuses an unknown tax code instead of silently charging no tax', async () => {
    const world = await makeWorld(t, { lines: [{ taxCode: 'GHOST' }] })

    await addVisit(t, world, { day: '2026-03-02' })

    const response = await postRun(t, world.admin.token, world.fixture.contract.id)

    expect(response.statusCode).toBe(422)
    expect(body(response).error?.code).toBe('UNPROCESSABLE')
    expect(await t.prisma.invoice.count()).toBe(0)
    expect((await t.prisma.timesheetEntry.findMany()).every(entry => entry.status === 'APPROVED')).toBe(true)
  })

  it('PER_VISIT: one line per snapshot item; the primary item uses the entry stamp, extra items the snapshot rate', async () => {
    const world = await makeWorld(t, {
      lines: [
        { description: 'Main visit', qty: '1', billRate: '145.00' },
        { description: 'Extra filter', qty: '3', billRate: '12.50' }
      ]
    })

    await addVisit(t, world, { day: '2026-03-02', billRate: '145.00' })

    const invoice = await runInvoice(t, world)
    const lines = flatLines(invoice)

    expect(lines).toHaveLength(2)
    expect(lines.find(line => line.description?.startsWith('Main visit'))).toMatchObject({ qty: '1.0000', unitRate: '145.00', amount: '145.00' })
    expect(lines.find(line => line.description?.startsWith('Extra filter'))).toMatchObject({ qty: '3.0000', unitRate: '12.50', amount: '37.50' })
    expect(invoice.total).toBe('182.50')
    expect(lines[0]?.description).toMatch(/ - Site \d+ - 2026-03-02$/)
  })

  it('the shift billable quantity, when set, replaces the primary item quantity', async () => {
    const world = await makeWorld(t, { lines: [{ description: 'Visit', qty: '1', billRate: '100.00' }] })

    await addVisit(t, world, { day: '2026-03-02', billRate: '100.00', billableQty: '2.50' })

    expect(flatLines(await runInvoice(t, world))[0]).toMatchObject({ qty: '2.5000', amount: '250.00' })
  })

  it('prices from the stamped snapshot: changing the live contract rate after approval and after the invoice exists moves nothing', async () => {
    const world = await makeWorld(t, { lines: [{ billRate: '145.00' }] })

    await addVisit(t, world, { day: '2026-03-02', billRate: '145.00' })
    // Renegotiated after the timesheet was approved, before the run
    await t.prisma.contractLine.updateMany({ data: { billRate: D('999.00') } })

    const invoice = await runInvoice(t, world)

    expect(invoice.total).toBe('145.00')

    // ... and after the invoice was created
    await t.prisma.contractLine.updateMany({ data: { billRate: D('1.00') } })

    const reread = body(await client(t.app).get(`/v1/invoices/${invoice.id}`, { token: world.admin.token })).data?.invoice as { total: string }

    expect(reread.total).toBe('145.00')
    expect((await t.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).total.toFixed(2)).toBe('145.00')
  })

  it('MONTHLY_FIXED: one line per contract line from the latest snapshot in the period, entries marked invoiced without lines', async () => {
    const world = await makeWorld(t, { billingType: 'MONTHLY_FIXED', lines: [{ description: 'Monthly service', qty: '1', billRate: '2500.00', taxCode: 'GST' }] })

    await taxRate('GST', '5.000', world.fixture.contract.orgId)
    await addVisit(t, world, { day: '2026-03-02' })
    await addVisit(t, world, { day: '2026-03-09' })
    // A newer schedule of the same site carries a different frozen rate: it is the "latest snapshot in the period"
    const newer = await makeSchedule(t, world.fixture, { periodStart: '2026-03-15', periodEnd: '2026-03-31' })

    await t.prisma.schedule.update({
      where: { id: newer.id },
      data: { termsSnapshot: { ...(newer.termsSnapshot as object), serviceItems: [{ ...((newer.termsSnapshot as { serviceItems: object[] }).serviceItems[0] ?? {}), billRate: '2600.00' }] } }
    })

    const invoice = await runInvoice(t, world)
    const lines = flatLines(invoice)

    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ sourceType: 'CONTRACT_LINE', sourceId: world.fixture.lines[0]?.id, unitRate: '2600.00', amount: '2600.00', taxAmount: '130.00' })
    expect(lines[0]?.description).toContain('2026-03-01 to 2026-03-31')
    expect(invoice.total).toBe('2730.00')
    expect((await t.prisma.timesheetEntry.findMany()).map(entry => entry.status)).toEqual(['INVOICED', 'INVOICED'])
  })

  it('MONTHLY_FIXED: a site with no schedule in the period falls back to the live ACTIVE contract lines', async () => {
    const world = await makeWorld(t, { billingType: 'MONTHLY_FIXED', lines: [{ description: 'Site A fee', billRate: '100.00' }] })
    const otherSite = await makeSite(t, { orgId: world.fixture.contract.orgId, clientId: world.fixture.client.id, name: 'Aardvark Annex' })

    await t.prisma.contractLine.create({ data: { contractId: world.fixture.contract.id, siteId: otherSite.id, description: 'Annex fee', qty: D('2'), billRate: D('50.00') } })

    const invoice = await runInvoice(t, world)

    expect(flatLines(invoice).map(line => [line.description?.split(' - ')[0], line.amount])).toEqual([
      ['Annex fee', '100.00'],
      ['Site A fee', '100.00']
    ])
    // Grouped by site name: Aardvark Annex before Site N
    expect(invoice.sites.map(site => site.siteName)).toEqual(['Aardvark Annex', world.fixture.site.name])
  })

  it('a monthly-fixed invoice for a period with no timesheets still bills the fixed fee', async () => {
    const world = await makeWorld(t, { billingType: 'MONTHLY_FIXED', lines: [{ billRate: '400.00' }] })

    expect((await runInvoice(t, world)).total).toBe('400.00')
  })
})

describe('invoice run: selection, flags, numbering', () => {
  it('only APPROVED billable entries whose site-local date is in the period are billed', async () => {
    const world = await makeWorld(t, { billingType: 'HOURLY', lines: [{ billRate: '100.00' }] })

    // 2026-03-01 05:00Z is Feb 28 23:00 in Chicago -> out; 2026-04-01 04:59Z is Mar 31 23:59 -> in
    const before = await addVisit(t, world, { day: '2026-02-28', time: '23:00', actualMinutes: 60 })
    const first = await addVisit(t, world, { day: '2026-03-01', time: '00:00', actualMinutes: 60 })
    const last = await addVisit(t, world, { day: '2026-03-31', time: '23:59', actualMinutes: 60 })
    const after = await addVisit(t, world, { day: '2026-04-01', time: '00:00', actualMinutes: 60 })
    const notBillable = await addVisit(t, world, { day: '2026-03-05', billable: false, actualMinutes: 60 })

    const invoice = await runInvoice(t, world)

    expect(flatLines(invoice)).toHaveLength(2)

    const status = async (id: string) => (await t.prisma.timesheetEntry.findUniqueOrThrow({ where: { id } })).status

    expect(await status(before.entry.id)).toBe('APPROVED')
    expect(await status(first.entry.id)).toBe('INVOICED')
    expect(await status(last.entry.id)).toBe('INVOICED')
    expect(await status(after.entry.id)).toBe('APPROVED')
    expect(await status(notBillable.entry.id)).toBe('APPROVED')
  })

  it('flags unapproved timesheets and no-shows', async () => {
    const world = await makeWorld(t, { lines: [{ billRate: '100.00' }] })

    await addVisit(t, world, { day: '2026-03-02' })
    await addVisit(t, world, { day: '2026-03-03', status: 'SUBMITTED' })
    await addVisit(t, world, { day: '2026-03-04', status: 'REJECTED' })
    await addVisit(t, world, { day: '2026-03-05', status: 'ADJUSTED' })
    await addVisit(t, world, { day: '2026-03-06', status: 'SUBMITTED', shiftStatus: 'NO_SHOW', billable: false })

    const invoice = await runInvoice(t, world)

    expect(invoice.flags).toEqual({ unapprovedTimesheets: 3, noShows: 1 })
  })

  it('numbers invoices INV-<year>-<6 digits> per organization and year, and derives the due date from the payment terms', async () => {
    const world = await makeWorld(t, { lines: [{ billRate: '100.00' }] })
    const year = localDate(new Date(), 'America/Chicago').slice(0, 4)

    await addVisit(t, world, { day: '2026-03-02' })
    await addVisit(t, world, { day: '2026-04-06' })

    await t.prisma.client.update({ where: { id: world.fixture.client.id }, data: { paymentTerms: 'NET15' } })

    const first = await runInvoice(t, world, { start: '2026-03-01', end: '2026-03-31' })

    expect(first.invoiceNumber).toBe(`INV-${year}-000001`)

    const issue = new Date(`${first.issueDate}T00:00:00Z`).getTime()

    expect(new Date(`${first.dueDate}T00:00:00Z`).getTime() - issue).toBe(15 * 86_400_000)

    await t.prisma.client.update({ where: { id: world.fixture.client.id }, data: { paymentTerms: 'DUE_ON_RECEIPT' } })

    const second = await runInvoice(t, world, { start: '2026-04-01', end: '2026-04-30' })

    expect(second.invoiceNumber).toBe(`INV-${year}-000002`)
    expect(second.dueDate).toBe(second.issueDate)

    // A second organization has its own counter
    const otherOrg = await t.prisma.organization.create({ data: { name: 'Other Org', timezone: 'America/Chicago', leadIntakeKey: 'other-org-key-1234' } })
    const otherWorker = await createUser(t, { role: 'FIELD_USER', orgId: otherOrg.id })
    const otherClient = await makeClient(t, { orgId: otherOrg.id })
    const otherFixture = await makeContract(t, { client: otherClient })
    const otherSchedule = await makeSchedule(t, otherFixture, { periodStart: '2026-03-01', periodEnd: '2026-03-31' })

    await addVisit(t, { schedule: otherSchedule, worker: otherWorker }, { day: '2026-03-02' })

    const login = await signIn(t, 'ADMIN', { orgId: otherOrg.id })
    const otherInvoice = await runInvoice(t, { admin: login, fixture: otherFixture })

    expect(otherInvoice.invoiceNumber).toBe(`INV-${year}-000001`)
  })

  it('NET30 is the default due date', async () => {
    const world = await makeWorld(t)

    await addVisit(t, world, { day: '2026-03-02' })

    const invoice = await runInvoice(t, world)

    expect(new Date(`${invoice.dueDate}T00:00:00Z`).getTime() - new Date(`${invoice.issueDate}T00:00:00Z`).getTime()).toBe(30 * 86_400_000)
  })

  it('422 NOTHING_TO_INVOICE when nothing is billable, and nothing is created', async () => {
    const world = await makeWorld(t)

    await addVisit(t, world, { day: '2026-03-02', status: 'SUBMITTED' })

    const response = await postRun(t, world.admin.token, world.fixture.contract.id)

    expect(response.statusCode).toBe(422)
    expect(body(response).error?.code).toBe('NOTHING_TO_INVOICE')
    expect(await t.prisma.invoice.count()).toBe(0)
  })

  it('409 DUPLICATE for an overlapping period of a live invoice; a VOID invoice frees the period', async () => {
    const world = await makeWorld(t)

    await addVisit(t, world, { day: '2026-03-02' })
    await addVisit(t, world, { day: '2026-03-20' })

    const first = await runInvoice(t, world, { start: '2026-03-01', end: '2026-03-15' })
    const overlap = await postRun(t, world.admin.token, world.fixture.contract.id, { start: '2026-03-15', end: '2026-03-31' })

    expect(overlap.statusCode).toBe(409)
    expect(body(overlap).error?.code).toBe('DUPLICATE')
    expect(body(overlap).error?.details?.context?.invoiceId).toBe(first.id)

    // The day after the first period ends is fine
    expect((await postRun(t, world.admin.token, world.fixture.contract.id, { start: '2026-03-16', end: '2026-03-31' })).statusCode).toBe(201)

    expect((await client(t.app).post(`/v1/invoices/${first.id}/void`, { token: world.admin.token, body: { reason: 'redo' } })).statusCode).toBe(200)
    expect((await postRun(t, world.admin.token, world.fixture.contract.id, { start: '2026-03-01', end: '2026-03-15' })).statusCode).toBe(201)
  })

  it('two simultaneous runs for the same contract and period make one invoice and take every entry once', async () => {
    const world = await makeWorld(t)

    for (const day of ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05']) await addVisit(t, world, { day })

    const responses = await Promise.all([1, 2, 3].map(() => postRun(t, world.admin.token, world.fixture.contract.id)))
    const codes = responses.map(response => response.statusCode).sort()

    expect(codes).toEqual([201, 409, 409])
    expect(await t.prisma.invoice.count()).toBe(1)
    expect(await t.prisma.invoiceLine.count()).toBe(4)
    expect(await t.prisma.timesheetEntry.count({ where: { status: 'INVOICED' } })).toBe(4)
  })

  it('contract rules: unknown or foreign contract 404, unsigned 409, expired allowed', async () => {
    const world = await makeWorld(t)
    const draft = await makeContract(t, { status: 'DRAFT' })
    const pending = await makeContract(t, { status: 'PENDING_SIGNATURE' })

    expect((await postRun(t, world.admin.token, '3f5b0b1e-7a53-4a8e-9d0e-7e1a1f0b9c11')).statusCode).toBe(404)
    expect(body(await postRun(t, world.admin.token, draft.contract.id)).error?.code).toBe('CONTRACT_NOT_ACTIVE')
    expect(body(await postRun(t, world.admin.token, pending.contract.id)).error?.code).toBe('CONTRACT_NOT_ACTIVE')

    await t.prisma.contract.update({ where: { id: world.fixture.contract.id }, data: { status: 'EXPIRED' } })
    await addVisit(t, world, { day: '2026-03-02' })
    expect((await postRun(t, world.admin.token, world.fixture.contract.id)).statusCode).toBe(201)

    const otherOrg = await t.prisma.organization.create({ data: { name: 'Foreign', leadIntakeKey: 'foreign-org-key-1234' } })
    const foreign = await signIn(t, 'ADMIN', { orgId: otherOrg.id })

    expect((await postRun(t, foreign.token, world.fixture.contract.id)).statusCode).toBe(404)
  })

  it('period validation: end before start, too long, bad dates, unknown fields', async () => {
    const world = await makeWorld(t)
    const send = (payload: object) => client(t.app).post('/v1/invoices/runs', { token: world.admin.token, body: payload })
    const base = { contractId: world.fixture.contract.id, periodStart: '2026-03-01', periodEnd: '2026-03-31' }

    expect((await send({ ...base, periodEnd: '2026-02-28' })).statusCode).toBe(400)
    expect((await send({ ...base, periodEnd: '2027-03-02' })).statusCode).toBe(400)
    expect((await send({ ...base, periodStart: '2026-02-30' })).statusCode).toBe(400)
    expect((await send({ ...base, contractId: 'nope' })).statusCode).toBe(400)
    expect((await send({ ...base, extra: 1 })).statusCode).toBe(400)
    expect((await send({ contractId: base.contractId })).statusCode).toBe(400)
  })

  it('an approved entry with no stamped bill rate blocks the run instead of guessing', async () => {
    const world = await makeWorld(t)
    const { entry } = await addVisit(t, world, { day: '2026-03-02' })

    await t.prisma.timesheetEntry.update({ where: { id: entry.id }, data: { billRateSnapshot: null } })

    const response = await postRun(t, world.admin.token, world.fixture.contract.id)

    expect(response.statusCode).toBe(422)
    expect(await t.prisma.invoice.count()).toBe(0)
  })

  it('stores the run in the audit trail', async () => {
    const world = await makeWorld(t)

    await addVisit(t, world, { day: '2026-03-02' })

    const invoice = await runInvoice(t, world)
    const events = await t.prisma.auditEvent.findMany({ where: { entity: 'invoice', entityId: invoice.id } })

    expect(events.map(event => event.action)).toEqual(['run_created'])
    expect(events[0]?.actorId).toBe(world.admin.user.id)
    expect(events[0]?.orgId).toBe(world.admin.user.orgId)
  })

  it('amounts on the wire are strings with two decimals and match the database to the cent', async () => {
    const world = await makeWorld(t, { billingType: 'HOURLY', lines: [{ billRate: '33.33' }] })

    await addVisit(t, world, { day: '2026-03-02', actualMinutes: 437, billRate: '33.33' })

    const invoice = await runInvoice(t, world)
    const line = flatLines(invoice)[0]

    // 437 / 60 = 7.28333 -> 7.2833; 7.2833 * 33.33 = 242.7...
    expect(line?.qty).toBe('7.2833')
    expect(cents(line?.amount ?? '0')).toBe(BigInt(D('7.2833').mul('33.33').toDecimalPlaces(2, 4).mul(100).toFixed(0)))
    expect(await t.prisma.invoice.count({ where: { periodStart: toDateOnly('2026-03-01') } })).toBe(1)
  })
})
