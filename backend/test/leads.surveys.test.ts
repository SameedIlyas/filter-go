import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { body, client, createTestApp, createUser, ensureOrg, loginAs, makeFile, makeService, resetDb } from './helpers.js'
import type { TestApp } from './helpers.js'
import { NIL_UUID, makeLead } from './leads.helpers.js'

let t: TestApp
let api: ReturnType<typeof client>
let orgId: string
let admin: Awaited<ReturnType<typeof createUser>>
let sup: Awaited<ReturnType<typeof createUser>>
let adminToken: string
let supToken: string
let sup2Token: string
let otherAdminToken: string
let otherOrgId: string

const survey = (overrides: Record<string, unknown> = {}) => ({
  address: '12 Main St, Springfield',
  units: [{ name: 'Rooftop unit A', qty: 2, estMinutes: 30 }],
  ...overrides
})

const unit = (overrides: Record<string, unknown> = {}) => ({ name: 'Unit', qty: 1, ...overrides })

beforeAll(async () => {
  t = await createTestApp()
  api = client(t.app)
})

afterAll(() => t.close())

beforeEach(async () => {
  await resetDb(t.prisma)
  orgId = (await ensureOrg(t)).id
  otherOrgId = (await ensureOrg(t, 'Org B')).id
  admin = await createUser(t, { role: 'ADMIN', email: 'admin@a.test' })
  sup = await createUser(t, { role: 'SUPERVISOR', email: 'sup@a.test' })

  const sup2 = await createUser(t, { role: 'SUPERVISOR', email: 'sup2@a.test' })
  const otherAdmin = await createUser(t, { role: 'ADMIN', orgId: otherOrgId, email: 'admin@b.test' })

  adminToken = await loginAs(t, admin.email)
  supToken = await loginAs(t, sup.email)
  sup2Token = await loginAs(t, sup2.email)
  otherAdminToken = await loginAs(t, otherAdmin.email)
})

describe('POST /v1/leads/:id/surveys', () => {
  it('creates a survey for an admin or the owning supervisor and normalises quantities to strings', async () => {
    const lead = await makeLead(t, orgId, { ownerId: sup.id })

    for (const token of [adminToken, supToken]) {
      const response = await api.post(`/v1/leads/${lead.id}/surveys`, { token, body: survey({ accessNotes: 'Ask the guard', units: [unit({ qty: '2.50', notes: 'north side' }), unit({ qty: 3 })] }) })

      expect(response.statusCode).toBe(201)
      expect(body(response).data?.survey).toMatchObject({
        leadId: lead.id,
        address: '12 Main St, Springfield',
        accessNotes: 'Ask the guard',
        photoFileIds: [],
        units: [
          { name: 'Unit', qty: '2.5', notes: 'north side' },
          { name: 'Unit', qty: '3' }
        ]
      })
    }

    expect(await t.prisma.leadSiteSurvey.count({ where: { leadId: lead.id } })).toBe(2)
    expect(await t.prisma.auditEvent.count({ where: { entityId: lead.id, action: 'survey_saved' } })).toBe(2)
  })

  it('accepts services of the organization and verified photos, deduplicating photo ids', async () => {
    const lead = await makeLead(t, orgId)
    const service = await makeService(t)
    const photo = await makeFile(t)
    const response = await api.post(`/v1/leads/${lead.id}/surveys`, {
      token: adminToken,
      body: survey({ units: [unit({ serviceId: service.id })], photoFileIds: [photo.id, photo.id] })
    })

    expect(response.statusCode).toBe(201)
    expect(body(response).data?.survey.photoFileIds).toEqual([photo.id])
    expect(body(response).data?.survey.units[0].serviceId).toBe(service.id)
  })

  it('rejects a service or a photo from another organization and a missing one', async () => {
    const lead = await makeLead(t, orgId)
    const foreignService = await makeService(t, { orgId: otherOrgId })
    const foreignFile = await makeFile(t, { orgId: otherOrgId })

    const badService = await api.post(`/v1/leads/${lead.id}/surveys`, { token: adminToken, body: survey({ units: [unit({ serviceId: foreignService.id })] }) })
    const badServiceMissing = await api.post(`/v1/leads/${lead.id}/surveys`, { token: adminToken, body: survey({ units: [unit({ serviceId: NIL_UUID })] }) })
    const badFile = await api.post(`/v1/leads/${lead.id}/surveys`, { token: adminToken, body: survey({ photoFileIds: [foreignFile.id] }) })

    expect(badService.statusCode).toBe(400)
    expect(badServiceMissing.statusCode).toBe(400)
    expect(badFile.statusCode).toBe(400)
    expect(body(badFile).error?.details?.issues?.[0]?.field).toBe('photoFileIds')
    expect(await t.prisma.leadSiteSurvey.count()).toBe(0)
  })

  it('allows many surveys per lead (one per site)', async () => {
    const lead = await makeLead(t, orgId)

    await api.post(`/v1/leads/${lead.id}/surveys`, { token: adminToken, body: survey({ address: 'Site 1' }) })
    await api.post(`/v1/leads/${lead.id}/surveys`, { token: adminToken, body: survey({ address: 'Site 2' }) })

    expect(body(await api.get(`/v1/leads/${lead.id}`, { token: adminToken })).data?.surveys).toHaveLength(2)
  })

  it('404s for a supervisor who is not the owner and for another organization', async () => {
    const lead = await makeLead(t, orgId, { ownerId: sup.id })

    expect((await api.post(`/v1/leads/${lead.id}/surveys`, { token: sup2Token, body: survey() })).statusCode).toBe(404)
    expect((await api.post(`/v1/leads/${lead.id}/surveys`, { token: otherAdminToken, body: survey() })).statusCode).toBe(404)
    expect(await t.prisma.leadSiteSurvey.count()).toBe(0)
  })

  it('refuses to change surveys of a converted lead with LEAD_ALREADY_CONVERTED', async () => {
    const lead = await makeLead(t, orgId, { status: 'WON' })

    await t.prisma.lead.update({ where: { id: lead.id }, data: { convertedClientId: 'c1', convertedContractId: 'k1' } })

    const response = await api.post(`/v1/leads/${lead.id}/surveys`, { token: adminToken, body: survey() })

    expect(response.statusCode).toBe(409)
    expect(body(response).error?.code).toBe('LEAD_ALREADY_CONVERTED')
    expect(body(response).error?.details?.context).toEqual({ clientId: 'c1', contractId: 'k1' })
  })

  describe('validation', () => {
    const many = (count: number) => Array.from({ length: count }, (_, i) => unit({ name: `Unit ${i}` }))
    const uuids = (count: number) => Array.from({ length: count }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`)

    it.each([
      ['missing address', { address: undefined }],
      ['blank address', { address: ' ' }],
      ['address too long', { address: 'x'.repeat(501) }],
      ['no units', { units: [] }],
      ['missing units', { units: undefined }],
      ['201 units', { units: many(201) }],
      ['blank unit name', { units: [unit({ name: ' ' })] }],
      ['unit name too long', { units: [unit({ name: 'x'.repeat(201) })] }],
      ['qty 0', { units: [unit({ qty: 0 })] }],
      ['negative qty', { units: [unit({ qty: -1 })] }],
      ['qty above 100000', { units: [unit({ qty: 100001 })] }],
      ['qty text', { units: [unit({ qty: 'lots' })] }],
      ['qty with 3 decimals', { units: [unit({ qty: '1.001' })] }],
      ['missing qty', { units: [{ name: 'x' }] }],
      ['estMinutes 0', { units: [unit({ estMinutes: 0 })] }],
      ['estMinutes 1441', { units: [unit({ estMinutes: 1441 })] }],
      ['estMinutes fractional', { units: [unit({ estMinutes: 1.5 })] }],
      ['unit notes too long', { units: [unit({ notes: 'x'.repeat(1001) })] }],
      ['unit unknown field', { units: [unit({ price: 5 })] }],
      ['bad serviceId', { units: [unit({ serviceId: 'nope' })] }],
      ['21 photos', { photoFileIds: uuids(21) }],
      ['bad photo id', { photoFileIds: ['nope'] }],
      ['access notes too long', { accessNotes: 'x'.repeat(2001) }],
      ['unknown field', { leadId: NIL_UUID }]
    ])('%s is a 400', async (_label, overrides) => {
      const lead = await makeLead(t, orgId)
      const response = await api.post(`/v1/leads/${lead.id}/surveys`, { token: adminToken, body: survey(overrides) })

      expect(response.statusCode).toBe(400)
      expect(body(response).error?.code).toBe('VALIDATION_ERROR')
    })

    it('accepts the boundaries: 200 units, qty 0.01 and 100000, estMinutes 1 and 1440', async () => {
      const lead = await makeLead(t, orgId)
      const boundary = [unit({ qty: '0.01', estMinutes: 1 }), unit({ qty: 100000, estMinutes: 1440 }), ...many(198)]
      const response = await api.post(`/v1/leads/${lead.id}/surveys`, { token: adminToken, body: survey({ units: boundary }) })

      expect(response.statusCode).toBe(201)
      expect(body(response).data?.survey.units).toHaveLength(200)
    })

    it('accepts exactly 20 photos when they exist', async () => {
      const lead = await makeLead(t, orgId)
      const files = await Promise.all(Array.from({ length: 20 }, () => makeFile(t)))
      const response = await api.post(`/v1/leads/${lead.id}/surveys`, { token: adminToken, body: survey({ photoFileIds: files.map(file => file.id) }) })

      expect(response.statusCode).toBe(201)
    })
  })
})

describe('PUT /v1/leads/:id/surveys/:surveyId', () => {
  const seed = (leadId: string) => t.prisma.leadSiteSurvey.create({ data: { leadId, address: 'Old', units: [{ name: 'Old unit', qty: '1' }], photoFileIds: [] } })

  it('replaces the whole survey and audits it', async () => {
    const lead = await makeLead(t, orgId, { ownerId: sup.id })
    const existing = await seed(lead.id)
    const response = await api.put(`/v1/leads/${lead.id}/surveys/${existing.id}`, { token: supToken, body: survey({ address: 'New address', accessNotes: 'Gate code 1234' }) })

    expect(response.statusCode).toBe(200)
    expect(body(response).data?.survey).toMatchObject({ id: existing.id, address: 'New address', accessNotes: 'Gate code 1234', units: [{ name: 'Rooftop unit A', qty: '2', estMinutes: 30 }] })

    const audit = await t.prisma.auditEvent.findFirstOrThrow({ where: { entityId: lead.id, action: 'survey_saved' } })

    expect(audit.diff).toMatchObject({ surveyId: existing.id, created: false, units: 1 })
  })

  it('clears optional fields that are left out', async () => {
    const lead = await makeLead(t, orgId)
    const existing = await t.prisma.leadSiteSurvey.create({ data: { leadId: lead.id, address: 'Old', accessNotes: 'x', units: [{ name: 'u', qty: '1' }], photoFileIds: [] } })

    await api.put(`/v1/leads/${lead.id}/surveys/${existing.id}`, { token: adminToken, body: survey() })

    expect((await t.prisma.leadSiteSurvey.findUniqueOrThrow({ where: { id: existing.id } })).accessNotes).toBeNull()
  })

  it('404s for a survey of another lead, a missing survey, another organization and a non-owner supervisor', async () => {
    const lead = await makeLead(t, orgId, { ownerId: sup.id })
    const otherLead = await makeLead(t, orgId, { ownerId: sup.id })
    const foreign = await seed(otherLead.id)
    const mine = await seed(lead.id)

    for (const [token, leadId, surveyId] of [
      [adminToken, lead.id, foreign.id],
      [adminToken, lead.id, NIL_UUID],
      [otherAdminToken, lead.id, mine.id],
      [sup2Token, lead.id, mine.id]
    ] as const) {
      expect((await api.put(`/v1/leads/${leadId}/surveys/${surveyId}`, { token, body: survey() })).statusCode).toBe(404)
    }

    expect((await t.prisma.leadSiteSurvey.findUniqueOrThrow({ where: { id: mine.id } })).address).toBe('Old')
  })

  it('validates the body and the ids, and checks files and services again', async () => {
    const lead = await makeLead(t, orgId)
    const existing = await seed(lead.id)
    const foreignFile = await makeFile(t, { orgId: otherOrgId })

    expect((await api.put(`/v1/leads/${lead.id}/surveys/${existing.id}`, { token: adminToken, body: {} })).statusCode).toBe(400)
    expect((await api.put(`/v1/leads/${lead.id}/surveys/nope`, { token: adminToken, body: survey() })).statusCode).toBe(400)
    expect((await api.put(`/v1/leads/${lead.id}/surveys/${existing.id}`, { token: adminToken, body: survey({ photoFileIds: [foreignFile.id] }) })).statusCode).toBe(400)
  })

  it('refuses on a converted lead', async () => {
    const lead = await makeLead(t, orgId, { status: 'WON' })
    const existing = await seed(lead.id)

    expect((await api.put(`/v1/leads/${lead.id}/surveys/${existing.id}`, { token: adminToken, body: survey() })).statusCode).toBe(409)
  })
})

describe('DELETE /v1/leads/:id/surveys/:surveyId', () => {
  it('deletes the survey, audits it, and a second delete is a 404', async () => {
    const lead = await makeLead(t, orgId, { ownerId: sup.id })
    const existing = await t.prisma.leadSiteSurvey.create({ data: { leadId: lead.id, address: 'Old', units: [], photoFileIds: [] } })
    const response = await api.delete(`/v1/leads/${lead.id}/surveys/${existing.id}`, { token: supToken })

    expect(response.statusCode).toBe(200)
    expect(body(response).data).toEqual({ deleted: true })
    expect(await t.prisma.leadSiteSurvey.count()).toBe(0)
    expect(await t.prisma.auditEvent.count({ where: { entityId: lead.id, action: 'survey_deleted' } })).toBe(1)
    expect((await api.delete(`/v1/leads/${lead.id}/surveys/${existing.id}`, { token: supToken })).statusCode).toBe(404)
  })

  it('404s for another organization, a non-owner supervisor and a survey of a different lead', async () => {
    const lead = await makeLead(t, orgId, { ownerId: sup.id })
    const other = await makeLead(t, orgId, { ownerId: sup.id })
    const mine = await t.prisma.leadSiteSurvey.create({ data: { leadId: lead.id, address: 'A', units: [], photoFileIds: [] } })

    expect((await api.delete(`/v1/leads/${lead.id}/surveys/${mine.id}`, { token: otherAdminToken })).statusCode).toBe(404)
    expect((await api.delete(`/v1/leads/${lead.id}/surveys/${mine.id}`, { token: sup2Token })).statusCode).toBe(404)
    expect((await api.delete(`/v1/leads/${other.id}/surveys/${mine.id}`, { token: adminToken })).statusCode).toBe(404)
    expect(await t.prisma.leadSiteSurvey.count()).toBe(1)
  })

  it('refuses on a converted lead', async () => {
    const lead = await makeLead(t, orgId, { status: 'WON' })
    const existing = await t.prisma.leadSiteSurvey.create({ data: { leadId: lead.id, address: 'A', units: [], photoFileIds: [] } })

    expect((await api.delete(`/v1/leads/${lead.id}/surveys/${existing.id}`, { token: adminToken })).statusCode).toBe(409)
  })
})
