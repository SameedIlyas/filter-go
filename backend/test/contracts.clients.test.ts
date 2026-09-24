import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { body, createTestApp, ensureOrg, grantSiteAccess, makeClient, makeSite, resetDb } from './helpers.js'
import type { TestApp } from './helpers.js'
import { NIL_ID, buildWorld } from './contracts.support.js'
import type { World } from './contracts.support.js'

let t: TestApp
let w: World

beforeAll(async () => {
  t = await createTestApp()
})

afterAll(() => t.close())

beforeEach(async () => {
  await resetDb(t.prisma)
  w = await buildWorld(t)
})

const newClient = { legalName: 'Globex Corp', billingEmail: 'AP@Globex.test', billingAddress: '9 Elm St', paymentTerms: 'NET15' }

describe('clients: access', () => {
  it('rejects anonymous callers and roles without access', async () => {
    expect((await w.api.get('/v1/clients')).statusCode).toBe(401)
    expect((await w.api.get(`/v1/clients/${NIL_ID}`)).statusCode).toBe(401)
    expect((await w.api.post('/v1/clients', { body: newClient })).statusCode).toBe(401)
    expect((await w.api.patch(`/v1/clients/${NIL_ID}`, { body: { active: false } })).statusCode).toBe(401)
    expect((await w.api.get('/v1/clients', { token: w.field.token })).statusCode).toBe(403)
    expect((await w.api.get(`/v1/clients/${w.clientId}`, { token: w.field.token })).statusCode).toBe(403)

    for (const token of [w.supervisor.token, w.clientUser.token, w.field.token]) {
      expect((await w.api.post('/v1/clients', { token, body: newClient })).statusCode).toBe(403)
      expect((await w.api.patch(`/v1/clients/${w.clientId}`, { token, body: { active: false } })).statusCode).toBe(403)
    }
  })

  it('admin creates, reads and edits a client; integration ids are admin-only and not writable', async () => {
    const created = await w.api.post('/v1/clients', { token: w.admin.token, body: newClient })

    expect(created.statusCode).toBe(201)
    expect(body(created).data?.client).toMatchObject({
      legalName: 'Globex Corp',
      billingEmail: 'ap@globex.test',
      paymentTerms: 'NET15',
      active: true,
      accountingRef: null,
      stripeCustomerId: null
    })

    const id = body(created).data?.client.id as string

    await t.prisma.client.update({ where: { id }, data: { accountingRef: 'QB-77', stripeCustomerId: 'cus_123' } })

    const admin = body(await w.api.get(`/v1/clients/${id}`, { token: w.admin.token })).data?.client

    expect(admin).toMatchObject({ accountingRef: 'QB-77', stripeCustomerId: 'cus_123' })

    const writable = await w.api.patch(`/v1/clients/${id}`, { token: w.admin.token, body: { accountingRef: 'X' } })

    expect(writable.statusCode).toBe(400)

    const patched = await w.api.patch(`/v1/clients/${id}`, { token: w.admin.token, body: { legalName: 'Globex Inc', active: false, billingAddress: null } })

    expect(body(patched).data?.client).toMatchObject({ legalName: 'Globex Inc', active: false, billingAddress: null })
  })

  it('supervisors and client users never see accountingRef or stripeCustomerId', async () => {
    await t.prisma.client.update({ where: { id: w.clientId }, data: { accountingRef: 'QB-1', stripeCustomerId: 'cus_1' } })

    for (const token of [w.supervisor.token, w.clientUser.token]) {
      const one = await w.api.get(`/v1/clients/${w.clientId}`, { token })
      const list = await w.api.get('/v1/clients', { token })

      expect(one.statusCode).toBe(200)
      expect(one.body).not.toContain('QB-1')
      expect(one.body).not.toContain('cus_1')
      expect(list.body).not.toContain('accountingRef')
      expect(list.body).not.toContain('stripeCustomerId')
    }
  })

  it('admin lists all clients of the organization only, with search and paging', async () => {
    await makeClient(t, { legalName: 'Zeta Holdings' })
    await makeClient(t, { orgId: (await ensureOrg(t, 'Other Org')).id, legalName: 'Foreign Co' })

    const list = await w.api.get('/v1/clients', { token: w.admin.token, query: { limit: '1', page: '2' } })

    expect(body(list).data?.clients).toHaveLength(1)
    expect(body(list).meta).toMatchObject({ page: 2, limit: 1, total: 2, totalPages: 2 })
    expect(body(await w.api.get('/v1/clients', { token: w.admin.token, query: { q: 'zeta' } })).data?.clients).toHaveLength(1)
    expect(body(await w.api.get('/v1/clients', { token: w.admin.token, query: { q: 'foreign' } })).data?.clients).toHaveLength(0)
    expect(body(await w.api.get('/v1/clients', { token: w.admin.token, query: { active: 'false' } })).data?.clients).toHaveLength(0)
  })

  it('a supervisor only sees clients that own one of their sites', async () => {
    const hidden = await makeClient(t, { legalName: 'Hidden Co' })

    await makeSite(t, { clientId: hidden.id })

    const list = body(await w.api.get('/v1/clients', { token: w.supervisor.token })).data?.clients as Array<{ id: string }>

    expect(list.map(client => client.id)).toEqual([w.clientId])
    expect((await w.api.get(`/v1/clients/${hidden.id}`, { token: w.supervisor.token })).statusCode).toBe(404)
    expect((await w.api.get(`/v1/clients/${w.clientId}`, { token: w.supervisor.token })).statusCode).toBe(200)
  })

  it('a client user only sees their own client', async () => {
    const other = await makeClient(t, { legalName: 'Other Client' })
    const list = body(await w.api.get('/v1/clients', { token: w.clientUser.token })).data?.clients as Array<{ id: string }>

    expect(list.map(client => client.id)).toEqual([w.clientId])
    expect((await w.api.get(`/v1/clients/${other.id}`, { token: w.clientUser.token })).statusCode).toBe(404)
  })

  it('cross-organization ids are 404', async () => {
    expect((await w.api.get(`/v1/clients/${w.clientId}`, { token: w.otherAdmin.token })).statusCode).toBe(404)
    expect((await w.api.patch(`/v1/clients/${w.clientId}`, { token: w.otherAdmin.token, body: { active: false } })).statusCode).toBe(404)
    expect((await w.api.get(`/v1/clients/${NIL_ID}`, { token: w.admin.token })).statusCode).toBe(404)
  })

  it('validates strictly and audits writes', async () => {
    const post = (payload: unknown) => w.api.post('/v1/clients', { token: w.admin.token, body: payload })

    expect((await post({ ...newClient, extra: 1 })).statusCode).toBe(400)
    expect((await post({ legalName: 'X' })).statusCode).toBe(400)
    expect((await post({ ...newClient, billingEmail: 'nope' })).statusCode).toBe(400)
    expect((await post({ ...newClient, paymentTerms: 'NET90' })).statusCode).toBe(400)
    expect((await w.api.get('/v1/clients/nope', { token: w.admin.token })).statusCode).toBe(400)
    expect((await w.api.patch(`/v1/clients/${w.clientId}`, { token: w.admin.token, body: {} })).statusCode).toBe(400)

    const id = body(await post(newClient)).data?.client.id as string

    await w.api.patch(`/v1/clients/${id}`, { token: w.admin.token, body: { legalName: 'Renamed' } })

    const rows = await t.prisma.auditEvent.findMany({ where: { entity: 'client', entityId: id }, orderBy: { createdAt: 'asc' } })

    expect(rows.map(row => row.action)).toEqual(['created', 'updated'])
  })
})

describe('sites', () => {
  const siteBody = { name: 'Depot', address: '5 Dock Rd', lat: 40.7, lng: -74, timezone: 'America/New_York', accessNotes: 'Back door', contactName: 'Sam', contactPhone: '555-0100' }

  it('rejects anonymous callers and non-admin writers', async () => {
    expect((await w.api.get('/v1/sites')).statusCode).toBe(401)
    expect((await w.api.get(`/v1/sites/${w.siteId}`)).statusCode).toBe(401)
    expect((await w.api.post(`/v1/clients/${w.clientId}/sites`, { body: siteBody })).statusCode).toBe(401)
    expect((await w.api.patch(`/v1/sites/${w.siteId}`, { body: { name: 'X' } })).statusCode).toBe(401)

    for (const token of [w.supervisor.token, w.field.token, w.clientUser.token]) {
      expect((await w.api.post(`/v1/clients/${w.clientId}/sites`, { token, body: siteBody })).statusCode).toBe(403)
      expect((await w.api.patch(`/v1/sites/${w.siteId}`, { token, body: { name: 'X' } })).statusCode).toBe(403)
    }
  })

  it('admin creates a site with coordinates and a timezone, then edits it', async () => {
    const created = await w.api.post(`/v1/clients/${w.clientId}/sites`, { token: w.admin.token, body: siteBody })

    expect(created.statusCode).toBe(201)
    expect(body(created).data?.site).toMatchObject({ clientId: w.clientId, name: 'Depot', lat: 40.7, lng: -74, timezone: 'America/New_York', active: true })

    const id = body(created).data?.site.id as string
    const patched = await w.api.patch(`/v1/sites/${id}`, { token: w.admin.token, body: { lat: null, lng: null, timezone: null, active: false, accessNotes: null } })

    expect(body(patched).data?.site).toMatchObject({ lat: null, lng: null, timezone: null, active: false, accessNotes: null })
    expect((await t.prisma.auditEvent.findMany({ where: { entity: 'site', entityId: id }, orderBy: { createdAt: 'asc' } })).map(row => row.action)).toEqual(['created', 'updated'])
  })

  it('creates a site with only the required fields', async () => {
    const created = await w.api.post(`/v1/clients/${w.clientId}/sites`, { token: w.admin.token, body: { name: 'Bare', address: '1 Road' } })

    expect(body(created).data?.site).toMatchObject({ lat: null, lng: null, timezone: null, accessNotes: null })
  })

  it('requires lat and lng together and inside range (boundaries included)', async () => {
    const post = (extra: unknown) => w.api.post(`/v1/clients/${w.clientId}/sites`, { token: w.admin.token, body: { name: 'S', address: 'A', ...(extra as object) } })

    expect((await post({ lat: 1 })).statusCode).toBe(400)
    expect((await post({ lng: 1 })).statusCode).toBe(400)
    expect((await post({ lat: 90.0001, lng: 0 })).statusCode).toBe(400)
    expect((await post({ lat: -90.0001, lng: 0 })).statusCode).toBe(400)
    expect((await post({ lat: 0, lng: 180.0001 })).statusCode).toBe(400)
    expect((await post({ lat: 0, lng: -180.0001 })).statusCode).toBe(400)
    expect((await post({ lat: null, lng: null })).statusCode).toBe(400)
    expect((await post({ lat: 90, lng: 180 })).statusCode).toBe(201)
    expect((await post({ lat: -90, lng: -180 })).statusCode).toBe(201)

    const patch = (payload: unknown) => w.api.patch(`/v1/sites/${w.siteId}`, { token: w.admin.token, body: payload })

    expect((await patch({ lat: 1 })).statusCode).toBe(400)
    expect((await patch({ lat: 1, lng: null })).statusCode).toBe(400)
    expect((await patch({ lat: null, lng: 5 })).statusCode).toBe(400)
    expect((await patch({ lat: 12, lng: 13 })).statusCode).toBe(200)
  })

  it('validates timezone, strict bodies and ids', async () => {
    const post = (payload: unknown) => w.api.post(`/v1/clients/${w.clientId}/sites`, { token: w.admin.token, body: payload })

    expect((await post({ name: 'S', address: 'A', timezone: 'Mars/Base' })).statusCode).toBe(400)
    expect((await post({ name: 'S', address: 'A', extra: 1 })).statusCode).toBe(400)
    expect((await post({ name: 'S', address: 'A', clientId: w.clientId })).statusCode).toBe(400)
    expect((await post({ name: 'S' })).statusCode).toBe(400)
    expect((await w.api.post('/v1/clients/nope/sites', { token: w.admin.token, body: siteBody })).statusCode).toBe(400)
    expect((await w.api.patch(`/v1/sites/${w.siteId}`, { token: w.admin.token, body: { clientId: w.clientId } })).statusCode).toBe(400)
    expect((await w.api.patch(`/v1/sites/${w.siteId}`, { token: w.admin.token, body: {} })).statusCode).toBe(400)
    expect((await w.api.get('/v1/sites/nope', { token: w.admin.token })).statusCode).toBe(400)
  })

  it('cross-organization ids are 404 for every site endpoint', async () => {
    expect((await w.api.post(`/v1/clients/${w.clientId}/sites`, { token: w.otherAdmin.token, body: siteBody })).statusCode).toBe(404)
    expect((await w.api.get(`/v1/sites/${w.siteId}`, { token: w.otherAdmin.token })).statusCode).toBe(404)
    expect((await w.api.patch(`/v1/sites/${w.siteId}`, { token: w.otherAdmin.token, body: { name: 'X' } })).statusCode).toBe(404)
    expect(body(await w.api.get('/v1/sites', { token: w.otherAdmin.token })).data?.sites).toHaveLength(0)
    expect((await w.api.post(`/v1/clients/${NIL_ID}/sites`, { token: w.admin.token, body: siteBody })).statusCode).toBe(404)
  })

  it('site scope: admin all, supervisor and field user their granted sites, client user every site of their client', async () => {
    const foreignClient = await makeClient(t)
    const foreignSite = await makeSite(t, { clientId: foreignClient.id })

    await grantSiteAccess(t, w.field.id, w.otherSiteId)

    const ids = async (token: string) =>
      ((body(await w.api.get('/v1/sites', { token })).data?.sites ?? []) as Array<{ id: string }>).map(site => site.id).sort()

    expect(await ids(w.admin.token)).toEqual([w.siteId, w.otherSiteId, foreignSite.id].sort())
    expect(await ids(w.supervisor.token)).toEqual([w.siteId])
    expect(await ids(w.field.token)).toEqual([w.otherSiteId])
    expect(await ids(w.clientUser.token)).toEqual([w.siteId, w.otherSiteId].sort())

    expect((await w.api.get(`/v1/sites/${w.otherSiteId}`, { token: w.supervisor.token })).statusCode).toBe(404)
    expect((await w.api.get(`/v1/sites/${foreignSite.id}`, { token: w.clientUser.token })).statusCode).toBe(404)
    expect((await w.api.get(`/v1/sites/${w.siteId}`, { token: w.clientUser.token })).statusCode).toBe(200)
    expect((await w.api.get(`/v1/sites/${w.siteId}`, { token: w.supervisor.token })).statusCode).toBe(200)
  })

  it('filters by client, text and active, with paging', async () => {
    await t.prisma.site.update({ where: { id: w.otherSiteId }, data: { active: false } })

    const list = (query: Record<string, string>) => w.api.get('/v1/sites', { token: w.admin.token, query })

    expect(body(await list({ active: 'false' })).data?.sites).toHaveLength(1)
    expect(body(await list({ q: 'warehouse' })).data?.sites).toHaveLength(1)
    expect(body(await list({ clientId: w.clientId, limit: '1' })).meta).toMatchObject({ total: 2, totalPages: 2 })
    expect(body(await list({ clientId: NIL_ID })).data?.sites).toHaveLength(0)
    expect((await list({ clientId: 'nope' })).statusCode).toBe(400)
    expect((await list({ other: '1' })).statusCode).toBe(400)
  })
})
