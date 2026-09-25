import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { LEAD_TRANSITIONS } from '../src/modules/leads/leads.status.js'
import { body, client, createTestApp, createUser, ensureOrg, loginAs, resetDb } from './helpers.js'
import type { TestApp } from './helpers.js'
import { NIL_UUID, makeLead } from './leads.helpers.js'
import type { LeadStatusName } from './leads.helpers.js'

const STATUSES: LeadStatusName[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST']

type Row = { id: string }

let t: TestApp
let api: ReturnType<typeof client>
let orgId: string
let admin: Awaited<ReturnType<typeof createUser>>
let sup: Awaited<ReturnType<typeof createUser>>
let sup2: Awaited<ReturnType<typeof createUser>>
let adminToken: string
let supToken: string
let sup2Token: string
let fieldToken: string
let clientToken: string
let otherAdminToken: string

beforeAll(async () => {
  t = await createTestApp()
  api = client(t.app)
})

afterAll(() => t.close())

beforeEach(async () => {
  await resetDb(t.prisma)
  orgId = (await ensureOrg(t)).id
  admin = await createUser(t, { role: 'ADMIN', email: 'admin@a.test' })
  sup = await createUser(t, { role: 'SUPERVISOR', email: 'sup@a.test' })
  sup2 = await createUser(t, { role: 'SUPERVISOR', email: 'sup2@a.test' })
  const field = await createUser(t, { role: 'FIELD_USER', email: 'field@a.test' })
  const clientOrg = await t.prisma.client.create({ data: { orgId, legalName: 'C', billingEmail: 'c@c.test' } })
  const clientUser = await createUser(t, { role: 'CLIENT_USER', clientId: clientOrg.id, email: 'cu@a.test' })
  const otherOrg = await ensureOrg(t, 'Org B')
  const otherAdmin = await createUser(t, { role: 'ADMIN', orgId: otherOrg.id, email: 'admin@b.test' })

  adminToken = await loginAs(t, admin.email)
  supToken = await loginAs(t, sup.email)
  sup2Token = await loginAs(t, sup2.email)
  fieldToken = await loginAs(t, field.email)
  clientToken = await loginAs(t, clientUser.email)
  otherAdminToken = await loginAs(t, otherAdmin.email)
})

describe('access control', () => {
  const endpoints: Array<['get' | 'post' | 'patch' | 'put' | 'delete', string, unknown?]> = [
    ['get', '/v1/leads'],
    ['post', '/v1/leads', {}],
    ['get', `/v1/leads/${NIL_UUID}`],
    ['patch', `/v1/leads/${NIL_UUID}`, { companyName: 'x' }],
    ['post', `/v1/leads/${NIL_UUID}/status`, { status: 'CONTACTED' }],
    ['get', `/v1/leads/${NIL_UUID}/activities`],
    ['post', `/v1/leads/${NIL_UUID}/activities`, { type: 'NOTE', body: 'x' }],
    ['post', `/v1/leads/${NIL_UUID}/surveys`, {}],
    ['put', `/v1/leads/${NIL_UUID}/surveys/${NIL_UUID}`, {}],
    ['delete', `/v1/leads/${NIL_UUID}/surveys/${NIL_UUID}`],
    ['post', `/v1/leads/${NIL_UUID}/convert`, {}]
  ]

  it.each(endpoints)('%s %s: anonymous gets 401', async (method, url, payload) => {
    const response = await api[method](url, { body: payload })

    expect(response.statusCode).toBe(401)
    expect(body(response).error?.code).toBe('UNAUTHENTICATED')
  })

  it.each(endpoints)('%s %s: field users and client users get 403', async (method, url, payload) => {
    for (const token of [fieldToken, clientToken]) {
      const response = await api[method](url, { token, body: payload })

      expect(response.statusCode).toBe(403)
      expect(body(response).error?.code).toBe('FORBIDDEN')
    }
  })

  it('a supervisor may not convert', async () => {
    const lead = await makeLead(t, orgId, { ownerId: sup.id, status: 'QUALIFIED' })
    const response = await api.post(`/v1/leads/${lead.id}/convert`, { token: supToken, body: {} })

    expect(response.statusCode).toBe(403)
  })
})

describe('GET /v1/leads', () => {
  const ids = async (query: Record<string, string>, token = adminToken) =>
    (body(await api.get('/v1/leads', { token, query })).data?.leads as Row[]).map(lead => lead.id)

  it('shows an admin every lead of the org (and nothing of other orgs); a supervisor only theirs', async () => {
    const otherOrg = await ensureOrg(t, 'Org B')
    const mine = await makeLead(t, orgId, { ownerId: sup.id })
    const theirs = await makeLead(t, orgId, { ownerId: sup2.id })
    const unowned = await makeLead(t, orgId, { ownerId: null })

    await makeLead(t, otherOrg.id, { ownerId: null })

    const asAdmin = body(await api.get('/v1/leads', { token: adminToken }))

    expect((asAdmin.data?.leads as Row[]).map(lead => lead.id).sort()).toEqual([mine.id, theirs.id, unowned.id].sort())
    expect(asAdmin.meta).toMatchObject({ total: 3, page: 1, limit: 20, totalPages: 1 })
    expect(await ids({}, supToken)).toEqual([mine.id])
  })

  it('returns whitelisted fields only, with the owner name and no phoneNorm', async () => {
    await makeLead(t, orgId, { ownerId: sup.id, phone: '555-010-2030', phoneNorm: '5550102030' })

    const lead = body(await api.get('/v1/leads', { token: adminToken })).data?.leads[0]

    expect(lead.owner).toEqual({ id: sup.id, name: sup.name })
    expect(Object.keys(lead).sort()).toEqual(
      [
        'address', 'companyName', 'contactName', 'convertedClientId', 'convertedContractId', 'createdAt', 'email', 'id', 'lostReason',
        'message', 'owner', 'ownerId', 'phone', 'serviceInterest', 'source', 'sourceUrl', 'status', 'updatedAt', 'utm'
      ].sort()
    )
  })

  it('filters by status, source, owner and search text', async () => {
    const a = await makeLead(t, orgId, { companyName: 'Alpha Bakery', contactName: 'Zed', email: 'z@alpha.test', status: 'QUALIFIED', source: 'REFERRAL', ownerId: sup.id })

    await makeLead(t, orgId, { companyName: 'Beta Foods', status: 'NEW', source: 'WEBSITE', ownerId: admin.id })

    expect(await ids({ status: 'QUALIFIED' })).toEqual([a.id])
    expect(await ids({ source: 'REFERRAL' })).toEqual([a.id])
    expect(await ids({ ownerId: sup.id })).toEqual([a.id])
    expect(await ids({ q: 'ALPHA' })).toEqual([a.id])
    expect(await ids({ q: 'zed' })).toEqual([a.id])
    expect(await ids({ q: 'alpha.test' })).toEqual([a.id])
    expect(await ids({ q: 'nothing-matches' })).toEqual([])
  })

  it('a supervisor cannot widen their view with the ownerId filter', async () => {
    await makeLead(t, orgId, { ownerId: sup2.id })

    expect(await ids({ ownerId: sup2.id }, supToken)).toEqual([])
  })

  it('filters created from/to by calendar day in the organization timezone (inclusive)', async () => {
    // 2026-03-03T05:30Z is 23:30 on March 2 in Chicago (UTC-6)
    const late = await makeLead(t, orgId, { createdAt: new Date('2026-03-03T05:30:00Z') })
    const next = await makeLead(t, orgId, { createdAt: new Date('2026-03-03T06:00:00Z') })

    expect(await ids({ from: '2026-03-02', to: '2026-03-02' })).toEqual([late.id])
    expect(await ids({ from: '2026-03-03', to: '2026-03-03' })).toEqual([next.id])
    expect((await ids({ from: '2026-03-02' })).sort()).toEqual([late.id, next.id].sort())
    expect(await ids({ to: '2026-03-01' })).toEqual([])
  })

  it('pages newest first', async () => {
    const first = await makeLead(t, orgId, { createdAt: new Date('2026-01-01') })
    const second = await makeLead(t, orgId, { createdAt: new Date('2026-01-02') })
    const third = await makeLead(t, orgId, { createdAt: new Date('2026-01-03') })
    const page1 = body(await api.get('/v1/leads', { token: adminToken, query: { limit: '2' } }))

    expect((page1.data?.leads as Row[]).map(lead => lead.id)).toEqual([third.id, second.id])
    expect(await ids({ limit: '2', page: '2' })).toEqual([first.id])
    expect(page1.meta).toMatchObject({ total: 3, totalPages: 2 })
  })

  it.each([
    ['unknown param', { foo: 'bar' }],
    ['limit above 100', { limit: '101' }],
    ['page 0', { page: '0' }],
    ['bad status', { status: 'DONE' }],
    ['bad source', { source: 'FAX' }],
    ['bad owner id', { ownerId: 'x' }],
    ['bad date', { from: '2026-13-40' }],
    ['from after to', { from: '2026-03-05', to: '2026-03-01' }],
    ['empty q', { q: '' }]
  ])('%s is a 400', async (_label, query) => {
    const response = await api.get('/v1/leads', { token: adminToken, query })

    expect(response.statusCode).toBe(400)
    expect(body(response).error?.code).toBe('VALIDATION_ERROR')
  })
})

describe('POST /v1/leads', () => {
  const payload = (overrides: Record<string, unknown> = {}) => ({ companyName: 'Gamma LLC', contactName: 'Gia', email: 'Gia@Gamma.test', phone: '(555) 222-3333', ...overrides })

  it('lets an admin create a lead owned by themselves by default, lower-casing the email and storing phoneNorm', async () => {
    const response = await api.post('/v1/leads', { token: adminToken, body: payload() })

    expect(response.statusCode).toBe(201)
    expect(body(response).data?.lead).toMatchObject({ email: 'gia@gamma.test', source: 'MANUAL', status: 'NEW', ownerId: admin.id })

    const row = await t.prisma.lead.findFirstOrThrow()

    expect(row.phoneNorm).toBe('5552223333')

    const audit = await t.prisma.auditEvent.findFirstOrThrow({ where: { entity: 'lead', action: 'created' } })

    expect(audit).toMatchObject({ entityId: row.id, actorId: admin.id, orgId })
  })

  it('lets a supervisor create a lead they own', async () => {
    const response = await api.post('/v1/leads', { token: supToken, body: payload({ source: 'FIELD' }) })

    expect(response.statusCode).toBe(201)
    expect(body(response).data?.lead).toMatchObject({ ownerId: sup.id, source: 'FIELD' })
    expect(body(await api.get('/v1/leads', { token: supToken })).data?.leads).toHaveLength(1)
  })

  it('lets an admin assign the owner (and notifies them); a supervisor cannot assign someone else', async () => {
    const created = await api.post('/v1/leads', { token: adminToken, body: payload({ ownerId: sup.id }) })

    expect(created.statusCode).toBe(201)
    expect(body(created).data?.lead.ownerId).toBe(sup.id)
    expect((await t.prisma.notification.findFirstOrThrow()).type).toBe('lead.assigned')

    const denied = await api.post('/v1/leads', { token: supToken, body: payload({ email: 'other@x.test', phone: undefined, ownerId: sup2.id }) })

    expect(denied.statusCode).toBe(403)
  })

  it('does not notify when the creator is the owner', async () => {
    await api.post('/v1/leads', { token: adminToken, body: payload() })

    expect(await t.prisma.notification.count()).toBe(0)
  })

  it.each([
    ['a field user', { role: 'FIELD_USER' }],
    ['a disabled supervisor', { role: 'SUPERVISOR', status: 'DISABLED' }]
  ] as const)('rejects %s as owner', async (_label, input) => {
    const wrong = await createUser(t, input)
    const response = await api.post('/v1/leads', { token: adminToken, body: payload({ ownerId: wrong.id }) })

    expect(response.statusCode).toBe(400)
    expect(body(response).error?.details?.issues?.[0]?.field).toBe('ownerId')
  })

  it('rejects an owner from another organization', async () => {
    const otherOrg = await ensureOrg(t, 'Org B')
    const foreign = await createUser(t, { role: 'ADMIN', orgId: otherOrg.id })

    expect((await api.post('/v1/leads', { token: adminToken, body: payload({ ownerId: foreign.id }) })).statusCode).toBe(400)
  })

  it('returns 409 DUPLICATE with the existing lead id for the same email or the same phone', async () => {
    const existing = await makeLead(t, orgId, { email: 'gia@gamma.test', phone: '555 222 3333', phoneNorm: '5552223333', ownerId: sup2.id })
    const byEmail = await api.post('/v1/leads', { token: adminToken, body: payload({ phone: undefined }) })
    const byPhone = await api.post('/v1/leads', { token: adminToken, body: payload({ email: 'new@gamma.test', phone: '555.222.3333' }) })

    for (const response of [byEmail, byPhone]) {
      expect(response.statusCode).toBe(409)
      expect(body(response).error?.code).toBe('DUPLICATE')
      expect(body(response).error?.details?.context).toEqual({ leadId: existing.id })
    }

    expect(await t.prisma.lead.count()).toBe(1)
  })

  it('does not reveal the id of a lead a supervisor cannot see', async () => {
    await makeLead(t, orgId, { email: 'gia@gamma.test', ownerId: sup2.id })

    const response = await api.post('/v1/leads', { token: supToken, body: payload() })

    expect(response.statusCode).toBe(409)
    expect(body(response).error?.details?.context).toBeUndefined()
  })

  it.each(['WON', 'LOST'] as const)('a %s lead with the same email is not a duplicate', async status => {
    await makeLead(t, orgId, { email: 'gia@gamma.test', status })

    expect((await api.post('/v1/leads', { token: adminToken, body: payload() })).statusCode).toBe(201)
  })

  it('does not dedupe across organizations', async () => {
    const otherOrg = await ensureOrg(t, 'Org B')

    await makeLead(t, otherOrg.id, { email: 'gia@gamma.test' })

    expect((await api.post('/v1/leads', { token: adminToken, body: payload() })).statusCode).toBe(201)
  })

  it('two simultaneous creates of the same lead make exactly one', async () => {
    const responses = await Promise.all([api.post('/v1/leads', { token: adminToken, body: payload() }), api.post('/v1/leads', { token: supToken, body: payload() })])

    expect(responses.map(response => response.statusCode).sort()).toEqual([201, 409])
    expect(await t.prisma.lead.count()).toBe(1)
  })

  it.each([
    ['missing company', { companyName: undefined }],
    ['unknown field', { status: 'WON' }],
    ['source WEBSITE (reserved for the public form)', { source: 'WEBSITE' }],
    ['bad email', { email: 'nope' }],
    ['message too long', { message: 'x'.repeat(4001) }],
    ['address too long', { address: 'x'.repeat(501) }],
    ['bad owner id', { ownerId: 'nope' }]
  ])('%s is a 400', async (_label, overrides) => {
    const response = await api.post('/v1/leads', { token: adminToken, body: payload(overrides) })

    expect(response.statusCode).toBe(400)
    expect(body(response).error?.code).toBe('VALIDATION_ERROR')
  })
})

describe('GET /v1/leads/:id', () => {
  it('returns the lead with its latest activities, surveys and conversion links', async () => {
    const lead = await makeLead(t, orgId, { ownerId: sup.id })

    await t.prisma.leadActivity.create({ data: { leadId: lead.id, type: 'NOTE', body: 'first', at: new Date('2026-01-01') } })
    await t.prisma.leadActivity.create({ data: { leadId: lead.id, type: 'CALL', body: 'second', at: new Date('2026-01-02') } })
    await t.prisma.leadSiteSurvey.create({ data: { leadId: lead.id, address: '1 Main St', units: [{ name: 'Unit A', qty: '2' }], photoFileIds: [] } })

    for (const token of [adminToken, supToken]) {
      const response = await api.get(`/v1/leads/${lead.id}`, { token })
      const data = body(response).data

      expect(response.statusCode).toBe(200)
      expect(data?.lead.id).toBe(lead.id)
      expect(data?.activities.map((activity: { body: string }) => activity.body)).toEqual(['second', 'first'])
      expect(data?.surveys).toHaveLength(1)
      expect(data?.surveys[0].units).toEqual([{ name: 'Unit A', qty: '2' }])
      expect(data?.conversion).toBeNull()
    }
  })

  it('reports the conversion once converted', async () => {
    const lead = await makeLead(t, orgId, { status: 'WON' })

    await t.prisma.lead.update({ where: { id: lead.id }, data: { convertedClientId: 'client-1', convertedContractId: 'contract-1' } })

    expect(body(await api.get(`/v1/leads/${lead.id}`, { token: adminToken })).data?.conversion).toEqual({ clientId: 'client-1', contractId: 'contract-1' })
  })

  it('is a 404 for another supervisor, another organization and a missing id', async () => {
    const lead = await makeLead(t, orgId, { ownerId: sup.id })

    for (const [token, id] of [[sup2Token, lead.id], [otherAdminToken, lead.id], [adminToken, NIL_UUID]] as const) {
      const response = await api.get(`/v1/leads/${id}`, { token })

      expect(response.statusCode).toBe(404)
      expect(body(response).error?.code).toBe('NOT_FOUND')
    }
  })

  it('a bad id is a 400', async () => {
    expect((await api.get('/v1/leads/not-a-uuid', { token: adminToken })).statusCode).toBe(400)
  })
})

describe('PATCH /v1/leads/:id', () => {
  it('lets an admin edit contact fields and recomputes phoneNorm', async () => {
    const lead = await makeLead(t, orgId, { phone: '555 000 1111', phoneNorm: '5550001111' })
    const response = await api.patch(`/v1/leads/${lead.id}`, {
      token: adminToken,
      body: { companyName: 'Renamed', phone: '(444) 999-8888', email: 'NEW@x.test', serviceInterest: 'HVAC filters', address: '9 Elm' }
    })

    expect(response.statusCode).toBe(200)
    expect(body(response).data?.lead).toMatchObject({ companyName: 'Renamed', phone: '(444) 999-8888', email: 'new@x.test', serviceInterest: 'HVAC filters', address: '9 Elm' })
    expect((await t.prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).phoneNorm).toBe('4449998888')

    const audit = await t.prisma.auditEvent.findFirstOrThrow({ where: { entityId: lead.id, action: 'updated' } })

    expect(audit.actorId).toBe(admin.id)
    expect(audit.diff).toMatchObject({ companyName: { to: 'Renamed' } })
  })

  it('clears nullable fields and phoneNorm', async () => {
    const lead = await makeLead(t, orgId, { phone: '555 000 1111', phoneNorm: '5550001111', address: 'x', serviceInterest: 'y' })

    await api.patch(`/v1/leads/${lead.id}`, { token: adminToken, body: { phone: null, address: null, serviceInterest: null } })

    expect(await t.prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).toMatchObject({ phone: null, phoneNorm: null, address: null, serviceInterest: null })
  })

  it('lets the owning supervisor edit, but not a different supervisor', async () => {
    const lead = await makeLead(t, orgId, { ownerId: sup.id })

    expect((await api.patch(`/v1/leads/${lead.id}`, { token: supToken, body: { contactName: 'Zoe' } })).statusCode).toBe(200)
    expect((await api.patch(`/v1/leads/${lead.id}`, { token: sup2Token, body: { contactName: 'Hax' } })).statusCode).toBe(404)
    expect((await t.prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).contactName).toBe('Zoe')
  })

  it('reassigns only for admins, notifies the new owner and audits it', async () => {
    const lead = await makeLead(t, orgId, { ownerId: sup.id })

    expect((await api.patch(`/v1/leads/${lead.id}`, { token: supToken, body: { ownerId: sup2.id } })).statusCode).toBe(403)

    const response = await api.patch(`/v1/leads/${lead.id}`, { token: adminToken, body: { ownerId: sup2.id } })

    expect(response.statusCode).toBe(200)
    expect(body(response).data?.lead).toMatchObject({ ownerId: sup2.id, owner: { id: sup2.id } })
    expect(await t.prisma.notification.findFirstOrThrow()).toMatchObject({ userId: sup2.id, type: 'lead.assigned', data: { leadId: lead.id } })

    const audit = await t.prisma.auditEvent.findFirstOrThrow({ where: { entityId: lead.id, action: 'assigned' } })

    expect(audit.diff).toEqual({ from: sup.id, to: sup2.id })
    // the previous owner no longer sees it
    expect((await api.get(`/v1/leads/${lead.id}`, { token: supToken })).statusCode).toBe(404)
  })

  it('a supervisor sending their own id as owner is a harmless no-op', async () => {
    const lead = await makeLead(t, orgId, { ownerId: sup.id })

    expect((await api.patch(`/v1/leads/${lead.id}`, { token: supToken, body: { ownerId: sup.id, contactName: 'Same' } })).statusCode).toBe(200)
    expect(await t.prisma.notification.count()).toBe(0)
  })

  it('does not notify an admin who assigns a lead to themselves', async () => {
    const lead = await makeLead(t, orgId, { ownerId: sup.id })

    await api.patch(`/v1/leads/${lead.id}`, { token: adminToken, body: { ownerId: admin.id } })

    expect(await t.prisma.notification.count()).toBe(0)
  })

  it('rejects an ineligible or foreign owner with 400', async () => {
    const lead = await makeLead(t, orgId)
    const field = await createUser(t, { role: 'FIELD_USER' })
    const otherOrg = await ensureOrg(t, 'Org B')
    const foreign = await createUser(t, { role: 'ADMIN', orgId: otherOrg.id })

    for (const ownerId of [field.id, foreign.id, NIL_UUID]) {
      expect((await api.patch(`/v1/leads/${lead.id}`, { token: adminToken, body: { ownerId } })).statusCode).toBe(400)
    }
  })

  it('404s for another organization', async () => {
    const lead = await makeLead(t, orgId)

    expect((await api.patch(`/v1/leads/${lead.id}`, { token: otherAdminToken, body: { companyName: 'x' } })).statusCode).toBe(404)
  })

  it.each([
    ['empty body', {}],
    ['unknown field (status)', { status: 'WON' }],
    ['unknown field (source)', { source: 'WEBSITE' }],
    ['blank company', { companyName: '  ' }],
    ['bad email', { email: 'x' }],
    ['null email', { email: null }],
    ['null owner', { ownerId: null }],
    ['too-long phone', { phone: '1'.repeat(41) }]
  ])('%s is a 400', async (_label, payload) => {
    const lead = await makeLead(t, orgId)

    expect((await api.patch(`/v1/leads/${lead.id}`, { token: adminToken, body: payload })).statusCode).toBe(400)
  })
})

describe('POST /v1/leads/:id/status: the state machine', () => {
  const edges = STATUSES.flatMap(from => LEAD_TRANSITIONS[from].filter(to => to !== 'WON').map(to => [from, to] as const))
  const invalid = STATUSES.flatMap(from => STATUSES.filter(to => to !== from && !LEAD_TRANSITIONS[from].includes(to)).map(to => [from, to] as const))
  const move = (id: string, status: LeadStatusName, lostReason?: string, token = adminToken) =>
    api.post(`/v1/leads/${id}/status`, { token, body: { status, ...(lostReason ? { lostReason } : {}) } })

  it.each(edges)('allows %s -> %s', async (from, to) => {
    const lead = await makeLead(t, orgId, { status: from, lostReason: from === 'LOST' ? 'too pricey' : null })
    const response = await move(lead.id, to, to === 'LOST' ? 'went elsewhere' : undefined)

    expect(response.statusCode).toBe(200)
    expect(body(response).data?.lead).toMatchObject({ status: to, lostReason: to === 'LOST' ? 'went elsewhere' : null })

    const audit = await t.prisma.auditEvent.findFirstOrThrow({ where: { entityId: lead.id, action: 'status_changed' } })

    expect(audit.diff).toMatchObject({ from, to })
  })

  it.each(invalid)('refuses %s -> %s with INVALID_STATE and the allowed list', async (from, to) => {
    const lead = await makeLead(t, orgId, { status: from })
    const response = await move(lead.id, to, to === 'LOST' ? 'x' : undefined)

    expect(response.statusCode).toBe(409)
    expect(body(response).error?.code).toBe('INVALID_STATE')
    expect(body(response).error?.details).toMatchObject({ entity: 'lead', from, to })
    expect(body(response).error?.details?.allowed).not.toContain('WON')
    expect((await t.prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe(from)
  })

  it.each(['QUALIFIED', 'PROPOSAL'] as const)('WON is never reachable through the status endpoint (%s -> WON)', async from => {
    const lead = await makeLead(t, orgId, { status: from })
    const response = await move(lead.id, 'WON')

    expect(response.statusCode).toBe(409)
    expect(body(response).error?.code).toBe('INVALID_STATE')
  })

  it('allows skipping forward but not going back', async () => {
    const lead = await makeLead(t, orgId)

    expect((await move(lead.id, 'PROPOSAL')).statusCode).toBe(200)
    expect((await move(lead.id, 'QUALIFIED')).statusCode).toBe(409)
  })

  it('requires a lostReason for LOST and forbids one otherwise', async () => {
    const lead = await makeLead(t, orgId)
    const missing = await move(lead.id, 'LOST')

    expect(missing.statusCode).toBe(400)
    expect(body(missing).error?.details?.issues?.[0]?.field).toBe('lostReason')
    expect((await move(lead.id, 'CONTACTED', 'why')).statusCode).toBe(400)
    expect((await api.post(`/v1/leads/${lead.id}/status`, { token: adminToken, body: { status: 'LOST', lostReason: '   ' } })).statusCode).toBe(400)
  })

  it('reopening a LOST lead clears the reason', async () => {
    const lead = await makeLead(t, orgId, { status: 'LOST', lostReason: 'budget' })

    expect(body(await move(lead.id, 'NEW')).data?.lead).toMatchObject({ status: 'NEW', lostReason: null })
  })

  it('lets the owning supervisor move it and hides it from others', async () => {
    const lead = await makeLead(t, orgId, { ownerId: sup.id })

    expect((await move(lead.id, 'CONTACTED', undefined, supToken)).statusCode).toBe(200)
    expect((await move(lead.id, 'QUALIFIED', undefined, sup2Token)).statusCode).toBe(404)
    expect((await move(lead.id, 'QUALIFIED', undefined, otherAdminToken)).statusCode).toBe(404)
  })

  it('simultaneous conflicting moves never produce a lost update: every 200 has exactly one audit row', async () => {
    const lead = await makeLead(t, orgId)
    const responses = await Promise.all([move(lead.id, 'LOST', 'a'), move(lead.id, 'QUALIFIED'), move(lead.id, 'PROPOSAL')])
    const codes = responses.map(response => response.statusCode)

    expect(codes.some(code => code === 200)).toBe(true)
    expect(codes.every(code => code === 200 || code === 409)).toBe(true)
    expect(await t.prisma.auditEvent.count({ where: { entityId: lead.id, action: 'status_changed' } })).toBe(codes.filter(code => code === 200).length)
  })

  it('validates the body and the id', async () => {
    const lead = await makeLead(t, orgId)

    for (const payload of [{}, { status: 'DONE' }, { status: 'CONTACTED', extra: 1 }]) {
      expect((await api.post(`/v1/leads/${lead.id}/status`, { token: adminToken, body: payload })).statusCode).toBe(400)
    }

    expect((await api.post('/v1/leads/nope/status', { token: adminToken, body: { status: 'CONTACTED' } })).statusCode).toBe(400)
  })
})

describe('activities', () => {
  const add = (id: string, type: string, text = 'did a thing', token = adminToken) => api.post(`/v1/leads/${id}/activities`, { token, body: { type, body: text } })

  it.each(['CALL', 'EMAIL', 'SITE_VISIT'])('the first %s moves a NEW lead to CONTACTED', async type => {
    const lead = await makeLead(t, orgId)
    const response = await add(lead.id, type)

    expect(response.statusCode).toBe(201)
    expect(body(response).data?.activity).toMatchObject({ type, body: 'did a thing', userId: admin.id, leadId: lead.id })
    expect(body(response).data?.lead.status).toBe('CONTACTED')

    const audits = await t.prisma.auditEvent.findMany({ where: { entityId: lead.id } })

    expect(audits.map(audit => audit.action).sort()).toEqual(['activity_added', 'status_changed'])
  })

  it('a NOTE does not change the status', async () => {
    const lead = await makeLead(t, orgId)

    expect(body(await add(lead.id, 'NOTE')).data?.lead.status).toBe('NEW')
  })

  it.each(['CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST'] as const)('a call on a %s lead leaves the status alone', async status => {
    const lead = await makeLead(t, orgId, { status })

    expect(body(await add(lead.id, 'CALL')).data?.lead.status).toBe(status)
  })

  it('two simultaneous first calls move the lead once', async () => {
    const lead = await makeLead(t, orgId)

    await Promise.all([add(lead.id, 'CALL', 'one'), add(lead.id, 'EMAIL', 'two')])

    expect(await t.prisma.leadActivity.count({ where: { leadId: lead.id } })).toBe(2)
    expect(await t.prisma.auditEvent.count({ where: { entityId: lead.id, action: 'status_changed' } })).toBe(1)
    expect((await t.prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe('CONTACTED')
  })

  it('lists newest first with paging, for the owner only', async () => {
    const lead = await makeLead(t, orgId, { ownerId: sup.id })

    for (const [i, text] of ['a', 'b', 'c'].entries()) {
      await t.prisma.leadActivity.create({ data: { leadId: lead.id, type: 'NOTE', body: text, at: new Date(2026, 0, i + 1) } })
    }

    const page = body(await api.get(`/v1/leads/${lead.id}/activities`, { token: supToken, query: { limit: '2' } }))

    expect(page.data?.activities.map((activity: { body: string }) => activity.body)).toEqual(['c', 'b'])
    expect(page.meta).toMatchObject({ total: 3, totalPages: 2 })
    expect((await api.get(`/v1/leads/${lead.id}/activities`, { token: sup2Token })).statusCode).toBe(404)
    expect((await api.get(`/v1/leads/${lead.id}/activities`, { token: otherAdminToken })).statusCode).toBe(404)
  })

  it('404s adding an activity to a lead the caller cannot see', async () => {
    const lead = await makeLead(t, orgId, { ownerId: sup.id })

    expect((await add(lead.id, 'NOTE', 'x', sup2Token)).statusCode).toBe(404)
    expect((await add(lead.id, 'NOTE', 'x', otherAdminToken)).statusCode).toBe(404)
    expect(await t.prisma.leadActivity.count()).toBe(0)
  })

  it.each([
    ['bad type', { type: 'SMS', body: 'x' }],
    ['empty body', { type: 'NOTE', body: '  ' }],
    ['body too long', { type: 'NOTE', body: 'x'.repeat(4001) }],
    ['unknown field', { type: 'NOTE', body: 'x', userId: 'y' }],
    ['missing type', { body: 'x' }]
  ])('%s is a 400', async (_label, payload) => {
    const lead = await makeLead(t, orgId)

    expect((await api.post(`/v1/leads/${lead.id}/activities`, { token: adminToken, body: payload })).statusCode).toBe(400)
  })
})
