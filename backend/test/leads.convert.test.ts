import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { body, client, createTestApp, createUser, ensureOrg, loginAs, makeService, resetDb } from './helpers.js'
import type { TestApp } from './helpers.js'
import { NIL_UUID, makeLead } from './leads.helpers.js'
import type { LeadStatusName } from './leads.helpers.js'

let t: TestApp
let api: ReturnType<typeof client>
let orgId: string
let admin: Awaited<ReturnType<typeof createUser>>
let adminToken: string
let supToken: string
let otherAdminToken: string

const CONVERT = { billingType: 'PER_VISIT', billingCycle: 'MONTHLY', startDate: '2026-04-01' }

const convert = (id: string, payload: Record<string, unknown> = CONVERT, token = adminToken) => api.post(`/v1/leads/${id}/convert`, { token, body: payload })

const addSurvey = (leadId: string, address: string, units: Array<Record<string, unknown>>, accessNotes: string | null = null) =>
  t.prisma.leadSiteSurvey.create({ data: { leadId, address, units: units as never, accessNotes, photoFileIds: [] } })

beforeAll(async () => {
  t = await createTestApp()
  api = client(t.app)
})

afterAll(() => t.close())

beforeEach(async () => {
  await resetDb(t.prisma)
  orgId = (await ensureOrg(t)).id
  admin = await createUser(t, { role: 'ADMIN', email: 'admin@a.test' })

  const sup = await createUser(t, { role: 'SUPERVISOR', email: 'sup@a.test' })
  const otherOrg = await ensureOrg(t, 'Org B')
  const otherAdmin = await createUser(t, { role: 'ADMIN', orgId: otherOrg.id, email: 'admin@b.test' })

  ;[adminToken, supToken, otherAdminToken] = await Promise.all([admin, sup, otherAdmin].map(user => loginAs(t, user.email)))
})

const qualifiedLead = (overrides: Parameters<typeof makeLead>[2] = {}) =>
  makeLead(t, orgId, { status: 'QUALIFIED', companyName: 'Northwind Foods', email: 'ana@northwind.test', phone: '555-010-2030', address: '1 HQ Way', ownerId: admin.id, ...overrides })

describe('POST /v1/leads/:id/convert: happy path', () => {
  it('creates the client, one site per survey and a draft contract prefilled from the surveys, in one go', async () => {
    const lead = await qualifiedLead()
    const service = await makeService(t, { name: 'Filter change' })

    await addSurvey(lead.id, '12 Main St, Springfield', [{ name: 'Rooftop unit A', qty: '2', estMinutes: 30, serviceId: service.id }, { name: 'Rooftop unit B', qty: '1.5' }], 'Ask the guard')
    await addSurvey(lead.id, '99 Elm Ave', [{ name: 'Kitchen hood', qty: '4', estMinutes: 45 }])

    const response = await convert(lead.id)

    expect(response.statusCode).toBe(201)

    const data = body(response).data

    expect(data?.lead).toMatchObject({ id: lead.id, status: 'WON', convertedClientId: data?.clientId, convertedContractId: data?.contractId })
    expect(data?.siteIds).toHaveLength(2)

    const client = await t.prisma.client.findUniqueOrThrow({ where: { id: data?.clientId } })

    expect(client).toMatchObject({ orgId, legalName: 'Northwind Foods', billingEmail: 'ana@northwind.test', billingAddress: '1 HQ Way', paymentTerms: 'NET30', active: true })

    const sites = await t.prisma.site.findMany({ where: { clientId: client.id }, orderBy: { createdAt: 'asc' } })

    expect(sites.map(site => site.id)).toEqual(data?.siteIds)
    expect(sites[0]).toMatchObject({ orgId, name: '12 Main St', address: '12 Main St, Springfield', accessNotes: 'Ask the guard', timezone: null, contactName: lead.contactName, contactPhone: '555-010-2030' })
    expect(sites[1]).toMatchObject({ orgId, name: '99 Elm Ave', address: '99 Elm Ave', accessNotes: null, timezone: null })

    const contract = await t.prisma.contract.findUniqueOrThrow({ where: { id: data?.contractId }, include: { lines: true, coverage: true } })

    expect(contract).toMatchObject({ orgId, clientId: client.id, leadId: lead.id, status: 'DRAFT', version: 1, billingType: 'PER_VISIT', billingCycle: 'MONTHLY', createdById: admin.id })
    expect(contract.contractNumber).toMatch(/^C-/)
    expect(contract.startDate.toISOString().slice(0, 10)).toBe('2026-04-01')
    expect(contract.endDate).toBeNull()
    expect(contract.coverage).toHaveLength(0)
    expect(contract.lines).toHaveLength(3)

    for (const line of contract.lines) {
      expect(line.billRate.toFixed(2)).toBe('0.00')
      expect(line.payRate).toBeNull()
    }

    const byName = Object.fromEntries(contract.lines.map(line => [line.description, line]))

    expect(byName['Rooftop unit A']).toMatchObject({ siteId: sites[0]?.id, serviceId: service.id, estMinutes: 30 })
    expect(byName['Rooftop unit A']?.qty.toFixed(2)).toBe('2.00')
    expect(byName['Rooftop unit B']).toMatchObject({ siteId: sites[0]?.id, serviceId: null, estMinutes: null })
    expect(byName['Rooftop unit B']?.qty.toFixed(2)).toBe('1.50')
    expect(byName['Kitchen hood']).toMatchObject({ siteId: sites[1]?.id, estMinutes: 45 })

    const stored = await t.prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })

    expect(stored).toMatchObject({ status: 'WON', convertedClientId: client.id, convertedContractId: contract.id })
  })

  it('audits the conversion and adds a timeline note', async () => {
    const lead = await qualifiedLead()

    await addSurvey(lead.id, '1 Main', [{ name: 'Unit', qty: '1' }])

    const data = body(await convert(lead.id)).data
    const audit = await t.prisma.auditEvent.findFirstOrThrow({ where: { entityId: lead.id, action: 'converted' } })

    expect(audit).toMatchObject({ orgId, actorId: admin.id, entity: 'lead' })
    expect(audit.diff).toMatchObject({ from: 'QUALIFIED', clientId: data?.clientId, contractId: data?.contractId, siteIds: data?.siteIds })

    const note = await t.prisma.leadActivity.findFirstOrThrow({ where: { leadId: lead.id } })

    expect(note).toMatchObject({ type: 'NOTE', userId: admin.id })
    expect(note.body).toContain('Converted to contract C-')
  })

  it('works from PROPOSAL and honours every override', async () => {
    const lead = await qualifiedLead({ status: 'PROPOSAL' })

    await addSurvey(lead.id, '1 Main', [{ name: 'Unit', qty: '1' }])

    const response = await convert(lead.id, {
      clientLegalName: 'Northwind Foods Holdings LLC',
      billingEmail: 'AP@Northwind.test',
      paymentTerms: 'DUE_ON_RECEIPT',
      billingType: 'MONTHLY_FIXED',
      billingCycle: 'BIWEEKLY',
      startDate: '2026-05-01',
      endDate: '2027-04-30'
    })

    expect(response.statusCode).toBe(201)

    const data = body(response).data
    const client = await t.prisma.client.findUniqueOrThrow({ where: { id: data?.clientId } })
    const contract = await t.prisma.contract.findUniqueOrThrow({ where: { id: data?.contractId } })

    expect(client).toMatchObject({ legalName: 'Northwind Foods Holdings LLC', billingEmail: 'ap@northwind.test', paymentTerms: 'DUE_ON_RECEIPT' })
    expect(contract).toMatchObject({ billingType: 'MONTHLY_FIXED', billingCycle: 'BIWEEKLY' })
    expect(contract.endDate?.toISOString().slice(0, 10)).toBe('2027-04-30')
  })

  it('accepts a start date equal to the end date', async () => {
    const lead = await qualifiedLead()

    await addSurvey(lead.id, '1 Main', [{ name: 'Unit', qty: '1' }])

    expect((await convert(lead.id, { ...CONVERT, endDate: CONVERT.startDate })).statusCode).toBe(201)
  })

  it('without surveys creates one site from the lead address and a placeholder line from serviceInterest', async () => {
    const lead = await qualifiedLead({ serviceInterest: 'Quarterly HVAC filter swap' })
    const data = body(await convert(lead.id)).data
    const site = await t.prisma.site.findFirstOrThrow({ where: { clientId: data?.clientId } })
    const lines = await t.prisma.contractLine.findMany({ where: { contractId: data?.contractId } })

    expect(data?.siteIds).toEqual([site.id])
    expect(site).toMatchObject({ name: '1 HQ Way', address: '1 HQ Way' })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ description: 'Quarterly HVAC filter swap', siteId: site.id, serviceId: null, estMinutes: null })
    expect(lines[0]?.qty.toFixed(2)).toBe('1.00')
    expect(lines[0]?.billRate.toFixed(2)).toBe('0.00')
  })

  it('uses a generic placeholder when the lead has no serviceInterest either', async () => {
    const lead = await qualifiedLead()
    const data = body(await convert(lead.id)).data

    expect((await t.prisma.contractLine.findFirstOrThrow({ where: { contractId: data?.contractId } })).description).toBe('Service (to be defined)')
  })

  it('drops a survey unit service that no longer exists instead of failing', async () => {
    const lead = await qualifiedLead()

    await addSurvey(lead.id, '1 Main', [{ name: 'Unit', qty: '1', serviceId: NIL_UUID }])

    const data = body(await convert(lead.id)).data

    expect((await t.prisma.contractLine.findFirstOrThrow({ where: { contractId: data?.contractId } })).serviceId).toBeNull()
  })

  it('numbers contracts from the organization sequence', async () => {
    const first = await qualifiedLead()
    const second = await qualifiedLead({ email: 'b@x.test', phone: null })
    const numbers: string[] = []

    for (const lead of [first, second]) {
      const data = body(await convert(lead.id)).data

      numbers.push((await t.prisma.contract.findUniqueOrThrow({ where: { id: data?.contractId } })).contractNumber)
    }

    expect(new Set(numbers).size).toBe(2)
  })
})

describe('POST /v1/leads/:id/convert: rules', () => {
  it.each(['NEW', 'CONTACTED', 'LOST'] as const satisfies LeadStatusName[])('refuses a %s lead with INVALID_STATE and creates nothing', async status => {
    const lead = await makeLead(t, orgId, { status, address: '1 HQ Way', lostReason: status === 'LOST' ? 'x' : null })
    const response = await convert(lead.id)

    expect(response.statusCode).toBe(409)
    expect(body(response).error?.code).toBe('INVALID_STATE')
    expect(body(response).error?.details).toMatchObject({ entity: 'lead', from: status, to: 'WON' })
    expect(await t.prisma.client.count()).toBe(0)
    expect(await t.prisma.contract.count()).toBe(0)
  })

  it('refuses a lead with neither surveys nor an address (422) and rolls everything back', async () => {
    const lead = await qualifiedLead({ address: null })
    const response = await convert(lead.id)

    expect(response.statusCode).toBe(422)
    expect(body(response).error?.code).toBe('UNPROCESSABLE')
    expect(await t.prisma.client.count()).toBe(0)
    expect((await t.prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe('QUALIFIED')
  })

  it('a second convert is 409 LEAD_ALREADY_CONVERTED carrying the ids, and creates nothing more', async () => {
    const lead = await qualifiedLead()
    const first = await convert(lead.id)
    const second = await convert(lead.id)
    const data = body(first).data

    expect(second.statusCode).toBe(409)
    expect(body(second).error?.code).toBe('LEAD_ALREADY_CONVERTED')
    expect(body(second).error?.details?.context).toEqual({ clientId: data?.clientId, contractId: data?.contractId })
    expect(await t.prisma.client.count()).toBe(1)
    expect(await t.prisma.contract.count()).toBe(1)
  })

  it('a lead already WON without status history is also reported as converted', async () => {
    const lead = await qualifiedLead({ status: 'WON' })

    await t.prisma.lead.update({ where: { id: lead.id }, data: { convertedClientId: 'c', convertedContractId: 'k' } })

    const response = await convert(lead.id)

    expect(body(response).error?.code).toBe('LEAD_ALREADY_CONVERTED')
    expect(body(response).error?.details?.context).toEqual({ clientId: 'c', contractId: 'k' })
  })

  it('four simultaneous converts create exactly one client, one set of sites and one contract', async () => {
    const lead = await qualifiedLead()

    await addSurvey(lead.id, '1 Main', [{ name: 'Unit', qty: '1' }])
    await addSurvey(lead.id, '2 Main', [{ name: 'Unit', qty: '2' }])

    const responses = await Promise.all(Array.from({ length: 4 }, () => convert(lead.id)))
    const codes = responses.map(response => response.statusCode).sort()

    expect(codes).toEqual([201, 409, 409, 409])

    const winner = body(responses.find(response => response.statusCode === 201) as (typeof responses)[number]).data

    for (const loser of responses.filter(response => response.statusCode === 409)) {
      expect(body(loser).error?.code).toBe('LEAD_ALREADY_CONVERTED')
      expect(body(loser).error?.details?.context).toEqual({ clientId: winner?.clientId, contractId: winner?.contractId })
    }

    expect(await t.prisma.client.count()).toBe(1)
    expect(await t.prisma.site.count()).toBe(2)
    expect(await t.prisma.contract.count()).toBe(1)
    expect(await t.prisma.contractLine.count()).toBe(2)
    expect(await t.prisma.auditEvent.count({ where: { action: 'converted' } })).toBe(1)
  })

  it('a converted lead can no longer be moved through the status endpoint', async () => {
    const lead = await qualifiedLead()

    await convert(lead.id)

    const response = await api.post(`/v1/leads/${lead.id}/status`, { token: adminToken, body: { status: 'LOST', lostReason: 'x' } })

    expect(response.statusCode).toBe(409)
    expect(body(response).error?.code).toBe('INVALID_STATE')
  })

  it('never touches another organization: 404 for its admin and no records created', async () => {
    const lead = await qualifiedLead()
    const response = await convert(lead.id, CONVERT, otherAdminToken)

    expect(response.statusCode).toBe(404)
    expect(await t.prisma.client.count()).toBe(0)
  })

  it('404s for a missing lead and 403 for a supervisor', async () => {
    const lead = await qualifiedLead()

    expect((await convert(NIL_UUID)).statusCode).toBe(404)
    expect((await convert(lead.id, CONVERT, supToken)).statusCode).toBe(403)
  })

  it.each([
    ['missing billingType', { billingType: undefined }],
    ['missing billingCycle', { billingCycle: undefined }],
    ['missing startDate', { startDate: undefined }],
    ['bad billingType', { billingType: 'DAILY' }],
    ['bad billingCycle', { billingCycle: 'YEARLY' }],
    ['bad paymentTerms', { paymentTerms: 'NET90' }],
    ['bad date', { startDate: '2026-02-30' }],
    ['end before start', { endDate: '2026-03-31' }],
    ['bad billingEmail', { billingEmail: 'nope' }],
    ['blank legal name', { clientLegalName: '  ' }],
    ['legal name too long', { clientLegalName: 'x'.repeat(201) }],
    ['unknown field', { status: 'WON' }]
  ])('%s is a 400', async (_label, overrides) => {
    const lead = await qualifiedLead()
    const response = await convert(lead.id, { ...CONVERT, ...overrides })

    expect(response.statusCode).toBe(400)
    expect(body(response).error?.code).toBe('VALIDATION_ERROR')
    expect((await t.prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe('QUALIFIED')
  })

  it('a bad id is a 400', async () => {
    expect((await convert('nope')).statusCode).toBe(400)
  })
})
