import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { body, createTestApp, createUser, ensureOrg, loginAs, makeClient, makeContract, makeService, makeSite, resetDb } from './helpers.js'
import type { TestApp } from './helpers.js'
import { NIL_ID, buildWorld, contractIn, createDraft, draftBody, validLine, weekly } from './contracts.support.js'
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

const post = (path: string, payload: unknown, token = w.admin.token) => w.api.post(path, { token, body: payload })

describe('access control', () => {
  const endpoints: Array<['get' | 'post' | 'patch' | 'put', string, unknown?]> = [
    ['get', '/v1/contracts'],
    ['post', '/v1/contracts', {}],
    ['get', `/v1/contracts/${NIL_ID}`],
    ['patch', `/v1/contracts/${NIL_ID}`, { autoRenew: true }],
    ['put', `/v1/contracts/${NIL_ID}/lines`, { lines: [] }],
    ['put', `/v1/contracts/${NIL_ID}/coverage`, { coverage: [] }],
    ['post', `/v1/contracts/${NIL_ID}/submit`],
    ['post', `/v1/contracts/${NIL_ID}/sign`, { signedBy: 'A' }],
    ['post', `/v1/contracts/${NIL_ID}/suspend`],
    ['post', `/v1/contracts/${NIL_ID}/resume`],
    ['post', `/v1/contracts/${NIL_ID}/cancel`, { reason: 'x' }],
    ['post', `/v1/contracts/${NIL_ID}/new-version`]
  ]

  it.each(endpoints)('%s %s: anonymous gets 401', async (method, url, payload) => {
    const response = await w.api[method](url, { body: payload })

    expect(response.statusCode).toBe(401)
    expect(body(response).error?.code).toBe('UNAUTHENTICATED')
  })

  it.each(endpoints)('%s %s: field users and client users get 403', async (method, url, payload) => {
    for (const token of [w.field.token, w.clientUser.token]) {
      const response = await w.api[method](url, { token, body: payload })

      expect(response.statusCode).toBe(403)
      expect(body(response).error?.code).toBe('FORBIDDEN')
    }
  })

  it.each(endpoints.filter(([method]) => method !== 'get'))('%s %s: a supervisor gets 403 (read-only on contracts)', async (method, url, payload) => {
    expect((await w.api[method](url, { token: w.supervisor.token, body: payload })).statusCode).toBe(403)
  })
})

describe('POST /contracts', () => {
  it('creates a DRAFT v1 with lines and coverage in the order they were sent', async () => {
    const lines = Array.from({ length: 30 }, (_, index) => validLine(w.siteId, { description: `Line ${index}`, billRate: `${100 + index}.50` }))
    const response = await post('/v1/contracts', draftBody(w.clientId, w.siteId, { lines }))
    const contract = body(response).data?.contract

    expect(response.statusCode).toBe(201)
    expect(contract).toMatchObject({
      status: 'DRAFT',
      version: 1,
      contractNumber: 'C-000001',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      autoRenew: false,
      billingType: 'PER_VISIT',
      billingCycle: 'MONTHLY',
      signedAt: null,
      supersedesContractId: null,
      client: { id: w.clientId }
    })
    expect(contract.lines.map((line: { description: string }) => line.description)).toEqual(lines.map(line => line.description))
    expect(contract.lines[0]).toMatchObject({ qty: '1.00', billRate: '100.50', payRate: '22.00', estMinutes: 480, taxCode: null, serviceId: null })
    expect(contract.coverage).toHaveLength(1)
    expect(contract.coverage[0]).toMatchObject({ patternType: 'WEEKLY', weekdays: [1, 3, 5], timeStart: '18:00', timeEnd: '02:00' })
    expect(contract.versions).toEqual([{ id: contract.id, version: 1, status: 'DRAFT' }])
  })

  it('numbers contracts sequentially per organization and audits the creation', async () => {
    const first = await createDraft(w)
    const second = await createDraft(w)

    expect([first.contractNumber, second.contractNumber]).toEqual(['C-000001', 'C-000002'])

    const rows = await t.prisma.auditEvent.findMany({ where: { entity: 'contract', entityId: first.id } })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ action: 'created', actorId: w.admin.id, type: 'contract.created' })
  })

  it('accepts a bare header (rough draft) and normalises tax codes and quantities', async () => {
    const bare = await post('/v1/contracts', { clientId: w.clientId, startDate: '2026-01-01', billingType: 'HOURLY', billingCycle: 'WEEKLY' })

    expect(bare.statusCode).toBe(201)
    expect(body(bare).data?.contract).toMatchObject({ lines: [], coverage: [], endDate: null })

    const line = validLine(w.siteId, { taxCode: 'gst', qty: 2.5, billRate: 10, payRate: null, estMinutes: null })
    const full = await post('/v1/contracts', draftBody(w.clientId, w.siteId, { lines: [line] }))

    expect(body(full).data?.contract.lines[0]).toMatchObject({ taxCode: 'GST', qty: '2.50', billRate: '10.00', payRate: null, estMinutes: null })
  })

  it('stores a service reference that belongs to the organization', async () => {
    const service = await makeService(t)
    const response = await post('/v1/contracts', draftBody(w.clientId, w.siteId, { lines: [validLine(w.siteId, { serviceId: service.id })] }))

    expect(body(response).data?.contract.lines[0].serviceId).toBe(service.id)
  })

  it('rejects ids that do not belong to the client or the organization', async () => {
    const foreignService = await makeService(t, { orgId: (await ensureOrg(t, 'Other Org')).id })
    const foreignSite = await makeSite(t, { clientId: (await makeClient(t)).id })
    const response = await post(
      '/v1/contracts',
      draftBody(w.clientId, w.siteId, {
        lines: [validLine(w.siteId), validLine(foreignSite.id), validLine(w.siteId, { serviceId: foreignService.id })],
        coverage: [weekly(foreignSite.id)]
      })
    )
    const fields = (body(response).error?.details?.issues as Array<{ field: string; code: string }>).map(issue => `${issue.field}:${issue.code}`)

    expect(response.statusCode).toBe(400)
    expect(fields).toEqual(['lines[1].siteId:site_not_found', 'lines[2].serviceId:service_not_found', 'coverage[0].siteId:site_not_found'])
    expect(await t.prisma.contract.count()).toBe(0)
  })

  it("404s for another organization's client and a missing client, without consuming a contract number", async () => {
    const foreign = await makeClient(t, { orgId: (await ensureOrg(t, 'Other Org')).id })

    expect((await post('/v1/contracts', draftBody(foreign.id, w.siteId))).statusCode).toBe(404)
    expect((await post('/v1/contracts', draftBody(NIL_ID, w.siteId))).statusCode).toBe(404)
    expect((await post('/v1/contracts', draftBody(w.clientId, w.siteId), w.otherAdmin.token)).statusCode).toBe(404)
    expect((await createDraft(w)).contractNumber).toBe('C-000001')
  })

  it('validates strictly and reports nested paths as lines[1].billRate', async () => {
    expect((await post('/v1/contracts', { ...draftBody(w.clientId, w.siteId), extra: 1 })).statusCode).toBe(400)
    expect((await post('/v1/contracts', { ...draftBody(w.clientId, w.siteId), leadId: NIL_ID })).statusCode).toBe(400)
    expect((await post('/v1/contracts', { ...draftBody(w.clientId, w.siteId), status: 'ACTIVE' })).statusCode).toBe(400)
    expect((await post('/v1/contracts', { ...draftBody(w.clientId, w.siteId), billingType: 'DAILY' })).statusCode).toBe(400)
    expect((await post('/v1/contracts', { ...draftBody(w.clientId, w.siteId), startDate: '2026-02-30' })).statusCode).toBe(400)
    expect((await post('/v1/contracts', { clientId: 'nope' })).statusCode).toBe(400)

    const response = await post(
      '/v1/contracts',
      draftBody(w.clientId, w.siteId, {
        lines: [validLine(w.siteId), validLine(w.siteId, { billRate: '145.005', qty: '1.234', unknown: true }), validLine(w.siteId, { billRate: 'abc' })]
      })
    )
    const fields = (body(response).error?.details?.issues as Array<{ field: string }>).map(issue => issue.field)

    expect(response.statusCode).toBe(400)
    expect(fields).toEqual(expect.arrayContaining(['lines[1].billRate', 'lines[1].qty', 'lines[1].unknown', 'lines[2].billRate']))
  })

  it('rejects out-of-range coverage values and oversized arrays', async () => {
    const coverage = (row: Record<string, unknown>) => post('/v1/contracts', draftBody(w.clientId, w.siteId, { coverage: [weekly(w.siteId, row)] }))

    expect((await coverage({ weekdays: [8] })).statusCode).toBe(400)
    expect((await coverage({ weekdays: [0] })).statusCode).toBe(400)
    expect((await coverage({ timeStart: '25:00' })).statusCode).toBe(400)
    expect((await coverage({ intervalDays: 0 })).statusCode).toBe(400)
    expect((await coverage({ visitsPerPeriod: 0 })).statusCode).toBe(400)
    expect((await coverage({ patternType: 'DAILY' })).statusCode).toBe(400)
    expect((await post('/v1/contracts', draftBody(w.clientId, w.siteId, { lines: Array.from({ length: 201 }, () => validLine(w.siteId)) }))).statusCode).toBe(400)
  })
})

describe('rate redaction', () => {
  it('shows billRate to admins only and payRate to admins and supervisors, by omitting the keys', async () => {
    const { contract } = await contractIn(t, w, 'ACTIVE', { lines: [{ billRate: '145.00', payRate: '22.00' }] })
    const read = async (token: string) => body(await w.api.get(`/v1/contracts/${contract.id}`, { token })).data?.contract.lines[0]

    expect(await read(w.admin.token)).toMatchObject({ billRate: '145.00', payRate: '22.00' })

    const supervisor = await read(w.supervisor.token)

    expect(supervisor).toMatchObject({ payRate: '22.00' })
    expect(supervisor).not.toHaveProperty('billRate')
  })

  it('a null pay rate is sent as null to admins, and never leaks anywhere else in the payload', async () => {
    const { contract } = await contractIn(t, w, 'ACTIVE', { lines: [{ billRate: '987.65', payRate: null }] })
    const admin = await w.api.get(`/v1/contracts/${contract.id}`, { token: w.admin.token })
    const supervisor = await w.api.get(`/v1/contracts/${contract.id}`, { token: w.supervisor.token })

    expect(body(admin).data?.contract.lines[0].payRate).toBeNull()
    expect(supervisor.body).not.toContain('987.65')
    expect(supervisor.body).not.toContain('billRate')
  })

  it('never returns lines from the list endpoint', async () => {
    await contractIn(t, w, 'ACTIVE')

    for (const token of [w.admin.token, w.supervisor.token]) {
      const response = await w.api.get('/v1/contracts', { token })

      expect(response.body).not.toContain('billRate')
      expect(response.body).not.toContain('payRate')
    }
  })
})

describe('GET /contracts and /contracts/:id: scope', () => {
  it('admin sees the whole organization and nothing from another one', async () => {
    await contractIn(t, w, 'ACTIVE')
    await makeContract(t, { orgId: (await ensureOrg(t, 'Other Org')).id })

    expect(body(await w.api.get('/v1/contracts', { token: w.admin.token })).data?.contracts).toHaveLength(1)
    expect(body(await w.api.get('/v1/contracts', { token: w.otherAdmin.token })).data?.contracts).toHaveLength(1)
  })

  it('cross-organization ids are 404 on every id endpoint', async () => {
    const { contract } = await contractIn(t, w, 'DRAFT')
    const other = w.otherAdmin.token

    expect((await w.api.get(`/v1/contracts/${contract.id}`, { token: other })).statusCode).toBe(404)
    expect((await w.api.patch(`/v1/contracts/${contract.id}`, { token: other, body: { autoRenew: true } })).statusCode).toBe(404)
    expect((await w.api.put(`/v1/contracts/${contract.id}/lines`, { token: other, body: { lines: [] } })).statusCode).toBe(404)
    expect((await w.api.put(`/v1/contracts/${contract.id}/coverage`, { token: other, body: { coverage: [] } })).statusCode).toBe(404)

    for (const action of ['submit', 'suspend', 'resume', 'new-version']) {
      expect((await post(`/v1/contracts/${contract.id}/${action}`, undefined, other)).statusCode).toBe(404)
    }

    expect((await post(`/v1/contracts/${contract.id}/sign`, { signedBy: 'X' }, other)).statusCode).toBe(404)
    expect((await post(`/v1/contracts/${contract.id}/cancel`, { reason: 'X' }, other)).statusCode).toBe(404)
    expect((await w.api.get(`/v1/contracts/${NIL_ID}`, { token: w.admin.token })).statusCode).toBe(404)
  })

  it('a supervisor sees a contract only when a line or a coverage row is at one of their sites', async () => {
    const site = await t.prisma.site.findFirstOrThrow({ where: { id: w.siteId } })
    const elsewhere = await t.prisma.site.findFirstOrThrow({ where: { id: w.otherSiteId } })
    const client = await t.prisma.client.findFirstOrThrow({ where: { id: w.clientId } })
    const orgId = client.orgId
    const lineAtMine = await makeContract(t, { orgId, client, site, lines: [{ siteId: site.id }], coverage: [{ siteId: elsewhere.id }] })
    const coverageAtMine = await makeContract(t, { orgId, client, site, lines: [{ siteId: elsewhere.id }], coverage: [{ siteId: site.id }] })
    const neither = await makeContract(t, { orgId, client, site: elsewhere, lines: [{ siteId: elsewhere.id }], coverage: [{ siteId: elsewhere.id }] })
    const get = (id: string) => w.api.get(`/v1/contracts/${id}`, { token: w.supervisor.token })

    expect((await get(lineAtMine.contract.id)).statusCode).toBe(200)
    expect((await get(coverageAtMine.contract.id)).statusCode).toBe(200)

    const hidden = await get(neither.contract.id)

    expect(hidden.statusCode).toBe(404)
    expect(body(hidden).error?.details?.entity).toBe('contract')

    const list = body(await w.api.get('/v1/contracts', { token: w.supervisor.token })).data?.contracts as Array<{ id: string }>

    expect(list.map(row => row.id).sort()).toEqual([lineAtMine.contract.id, coverageAtMine.contract.id].sort())
    expect(body(await w.api.get('/v1/contracts', { token: w.supervisor.token })).meta).toMatchObject({ total: 2 })
  })

  it("a supervisor only gets the lines and coverage at their own sites, and only versions they can see", async () => {
    const orgId = (await ensureOrg(t)).id
    const client = await t.prisma.client.findFirstOrThrow({ where: { id: w.clientId } })
    const site = await t.prisma.site.findFirstOrThrow({ where: { id: w.siteId } })
    const elsewhere = await t.prisma.site.findFirstOrThrow({ where: { id: w.otherSiteId } })
    const v1 = await makeContract(t, {
      orgId,
      client,
      site,
      contractNumber: 'C-CHAIN',
      lines: [{ siteId: site.id, description: 'Mine' }, { siteId: elsewhere.id, description: 'Not mine', payRate: '99.00' }],
      coverage: [{ siteId: site.id }, { siteId: elsewhere.id }]
    })
    const v2 = await makeContract(t, { orgId, client, site: elsewhere, contractNumber: 'C-CHAIN', version: 2, status: 'DRAFT', lines: [{ siteId: elsewhere.id }], coverage: [{ siteId: elsewhere.id }] })
    const supervisor = await w.api.get(`/v1/contracts/${v1.contract.id}`, { token: w.supervisor.token })
    const seen = body(supervisor).data?.contract

    expect(seen.lines.map((line: { description: string }) => line.description)).toEqual(['Mine'])
    expect(seen.coverage.map((row: { siteId: string }) => row.siteId)).toEqual([site.id])
    expect(seen.versions).toEqual([{ id: v1.contract.id, version: 1, status: 'ACTIVE' }])
    expect(supervisor.body).not.toContain('99.00')
    expect(body(await w.api.get(`/v1/contracts/${v1.contract.id}`, { token: w.admin.token })).data?.contract.versions).toEqual([
      { id: v1.contract.id, version: 1, status: 'ACTIVE' },
      { id: v2.contract.id, version: 2, status: 'DRAFT' }
    ])
  })

  it('a supervisor without any site access sees nothing', async () => {
    const user = await createUser(t, { role: 'SUPERVISOR' })
    const lonely = await loginAs(t, user.email)

    await contractIn(t, w, 'ACTIVE')

    expect(body(await w.api.get('/v1/contracts', { token: lonely })).data?.contracts).toHaveLength(0)
  })
})

describe('GET /contracts filters', () => {
  it('filters by status, client and number, and pages', async () => {
    const other = await makeClient(t)
    const orgId = (await ensureOrg(t)).id
    const active = await contractIn(t, w, 'ACTIVE', { contractNumber: 'C-AAA' })

    await contractIn(t, w, 'DRAFT', { contractNumber: 'C-BBB' })
    await makeContract(t, { orgId, client: other, status: 'ACTIVE', contractNumber: 'C-CCC' })

    const list = (query: Record<string, string>) => w.api.get('/v1/contracts', { token: w.admin.token, query })
    const ids = async (query: Record<string, string>) => ((body(await list(query)).data?.contracts ?? []) as Array<{ id: string }>).map(row => row.id)

    expect(await ids({ status: 'ACTIVE' })).toHaveLength(2)
    expect(await ids({ status: 'ACTIVE', clientId: w.clientId })).toEqual([active.contract.id])
    expect(await ids({ q: 'bbb' })).toHaveLength(1)
    expect(await ids({ q: 'nothing' })).toHaveLength(0)
    expect(body(await list({ limit: '2' })).meta).toMatchObject({ total: 3, totalPages: 2 })
    expect((await list({ status: 'BOGUS' })).statusCode).toBe(400)
    expect((await list({ latestOnly: 'yes' })).statusCode).toBe(400)
    expect((await list({ extra: '1' })).statusCode).toBe(400)
    expect((await list({ clientId: 'nope' })).statusCode).toBe(400)
  })

  it('latestOnly returns the highest version per number (one row per contract number)', async () => {
    const orgId = (await ensureOrg(t)).id
    const client = await t.prisma.client.findFirstOrThrow({ where: { id: w.clientId } })
    const site = await t.prisma.site.findFirstOrThrow({ where: { id: w.siteId } })
    const make = (contractNumber: string, version: number, status: 'ACTIVE' | 'DRAFT' | 'EXPIRED' | 'CANCELLED') =>
      makeContract(t, { orgId, client, site, contractNumber, version, status })

    await make('C-1', 1, 'EXPIRED')
    await make('C-1', 2, 'EXPIRED')

    const top = await make('C-1', 3, 'ACTIVE')
    const cancelledTop = await make('C-2', 2, 'CANCELLED')

    await make('C-2', 1, 'ACTIVE')

    const single = await make('C-3', 1, 'DRAFT')
    const list = await w.api.get('/v1/contracts', { token: w.admin.token, query: { latestOnly: 'true' } })
    const rows = body(list).data?.contracts as Array<{ id: string; contractNumber: string; version: number }>

    expect(rows.map(row => row.id).sort()).toEqual([top.contract.id, cancelledTop.contract.id, single.contract.id].sort())
    expect(body(list).meta).toMatchObject({ total: 3 })
    expect(body(await w.api.get('/v1/contracts', { token: w.admin.token })).meta).toMatchObject({ total: 6 })
    expect(body(await w.api.get('/v1/contracts', { token: w.admin.token, query: { latestOnly: 'true', status: 'ACTIVE' } })).data?.contracts).toHaveLength(1)
    expect(body(await w.api.get('/v1/contracts', { token: w.admin.token, query: { latestOnly: 'true', clientId: w.clientId } })).meta).toMatchObject({ total: 3 })
    expect(body(await w.api.get('/v1/contracts', { token: w.admin.token, query: { latestOnly: 'true', clientId: NIL_ID } })).meta).toMatchObject({ total: 0 })
  })
})

describe('PATCH /contracts/:id', () => {
  it('edits header fields of a draft and audits only what changed', async () => {
    const draft = await createDraft(w)
    const response = await w.api.patch(`/v1/contracts/${draft.id}`, {
      token: w.admin.token,
      body: { endDate: null, autoRenew: true, billingCycle: 'WEEKLY', startDate: '2026-01-01' }
    })

    expect(response.statusCode).toBe(200)
    expect(body(response).data?.contract).toMatchObject({ endDate: null, autoRenew: true, billingCycle: 'WEEKLY', startDate: '2026-01-01' })

    const row = await t.prisma.auditEvent.findFirstOrThrow({ where: { entityId: draft.id, action: 'updated' } })

    expect(row.diff).toEqual({ endDate: { from: '2026-12-31', to: null }, autoRenew: { from: false, to: true }, billingCycle: { from: 'MONTHLY', to: 'WEEKLY' } })
  })

  it.each(['PENDING_SIGNATURE', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED'] as const)('is refused on a %s contract with CONTRACT_NOT_EDITABLE', async status => {
    const { contract } = await contractIn(t, w, status)
    const attempts = [
      w.api.patch(`/v1/contracts/${contract.id}`, { token: w.admin.token, body: { autoRenew: true } }),
      w.api.put(`/v1/contracts/${contract.id}/lines`, { token: w.admin.token, body: { lines: [] } }),
      w.api.put(`/v1/contracts/${contract.id}/coverage`, { token: w.admin.token, body: { coverage: [] } })
    ]

    for (const response of await Promise.all(attempts)) {
      expect(response.statusCode).toBe(409)
      expect(body(response).error).toMatchObject({ code: 'CONTRACT_NOT_EDITABLE', details: { context: { status } } })
    }

    expect(await t.prisma.contractLine.count({ where: { contractId: contract.id } })).toBe(1)
  })

  it('validates strictly', async () => {
    const draft = await createDraft(w)
    const patch = (payload: unknown, id = draft.id) => w.api.patch(`/v1/contracts/${id}`, { token: w.admin.token, body: payload })

    expect((await patch({})).statusCode).toBe(400)
    expect((await patch({ status: 'ACTIVE' })).statusCode).toBe(400)
    expect((await patch({ clientId: w.clientId })).statusCode).toBe(400)
    expect((await patch({ startDate: 'tomorrow' })).statusCode).toBe(400)
    expect((await patch({ autoRenew: 'yes' })).statusCode).toBe(400)
    expect((await patch({ autoRenew: true }, 'nope')).statusCode).toBe(400)
    expect((await patch({ autoRenew: true }, NIL_ID)).statusCode).toBe(404)
  })
})

describe('PUT /contracts/:id/lines and /coverage', () => {
  it('replaces every line, in order, and audits the swap', async () => {
    const draft = await createDraft(w)
    const service = await makeService(t)
    const lines = [validLine(w.siteId, { description: 'B', billRate: '10' }), validLine(w.otherSiteId, { description: 'A', serviceId: service.id, taxCode: 'x-1' })]
    const response = await w.api.put(`/v1/contracts/${draft.id}/lines`, { token: w.admin.token, body: { lines } })
    const saved = body(response).data?.contract

    expect(response.statusCode).toBe(200)
    expect(saved.lines.map((line: { description: string }) => line.description)).toEqual(['B', 'A'])
    expect(saved.lines[1]).toMatchObject({ serviceId: service.id, taxCode: 'X-1', siteId: w.otherSiteId })
    expect(await t.prisma.contractLine.count({ where: { contractId: draft.id } })).toBe(2)

    const row = await t.prisma.auditEvent.findFirstOrThrow({ where: { entityId: draft.id, action: 'lines_replaced' } })

    expect(row.diff).toEqual({ removed: 1, added: 2 })

    const cleared = await w.api.put(`/v1/contracts/${draft.id}/lines`, { token: w.admin.token, body: { lines: [] } })

    expect(body(cleared).data?.contract.lines).toEqual([])
  })

  it('replaces coverage, keeping the lines', async () => {
    const draft = await createDraft(w)
    const rows = [
      { siteId: w.siteId, patternType: 'INTERVAL', intervalDays: 14 },
      { siteId: w.otherSiteId, patternType: 'AD_HOC', visitsPerPeriod: 4 }
    ]
    const response = await w.api.put(`/v1/contracts/${draft.id}/coverage`, { token: w.admin.token, body: { coverage: rows } })
    const saved = body(response).data?.contract

    expect(saved.coverage).toMatchObject([
      { patternType: 'INTERVAL', intervalDays: 14, weekdays: [], timeStart: null },
      { patternType: 'AD_HOC', visitsPerPeriod: 4 }
    ])
    expect(saved.lines).toHaveLength(1)
    expect((await t.prisma.auditEvent.findFirstOrThrow({ where: { entityId: draft.id, action: 'coverage_replaced' } })).diff).toEqual({ removed: 1, added: 2 })
  })

  it("rejects sites of another client or organization, leaving the old rows untouched", async () => {
    const draft = await createDraft(w)
    const foreign = await makeSite(t, { clientId: (await makeClient(t)).id })
    const badLines = await w.api.put(`/v1/contracts/${draft.id}/lines`, { token: w.admin.token, body: { lines: [validLine(w.siteId), validLine(foreign.id)] } })
    const badCoverage = await w.api.put(`/v1/contracts/${draft.id}/coverage`, { token: w.admin.token, body: { coverage: [weekly(foreign.id)] } })

    expect(body(badLines).error?.details?.issues).toMatchObject([{ field: 'lines[1].siteId', code: 'site_not_found' }])
    expect(body(badCoverage).error?.details?.issues).toMatchObject([{ field: 'coverage[0].siteId', code: 'site_not_found' }])
    expect(await t.prisma.contractLine.count({ where: { contractId: draft.id } })).toBe(1)
    expect(await t.prisma.contractCoverage.count({ where: { contractId: draft.id } })).toBe(1)
  })

  it('validates bodies strictly', async () => {
    const draft = await createDraft(w)
    const put = (path: string, payload: unknown) => w.api.put(`/v1/contracts/${draft.id}/${path}`, { token: w.admin.token, body: payload })

    expect((await put('lines', {})).statusCode).toBe(400)
    expect((await put('lines', { lines: [], extra: 1 })).statusCode).toBe(400)
    expect((await put('lines', { lines: 'x' })).statusCode).toBe(400)
    expect((await put('lines', { lines: [validLine(w.siteId, { billRate: '-1' })] })).statusCode).toBe(400)
    expect((await put('coverage', {})).statusCode).toBe(400)
    expect((await put('coverage', { coverage: [{ siteId: w.siteId }] })).statusCode).toBe(400)
    expect((await w.api.put('/v1/contracts/nope/lines', { token: w.admin.token, body: { lines: [] } })).statusCode).toBe(400)
  })

  it('a submit racing a lines replacement never validates stale lines', async () => {
    const draft = await createDraft(w)
    const bad = w.api.put(`/v1/contracts/${draft.id}/lines`, { token: w.admin.token, body: { lines: [validLine(w.siteId, { billRate: '0' })] } })
    const submit = post(`/v1/contracts/${draft.id}/submit`, undefined)
    const [replaced, submitted] = await Promise.all([bad, submit])
    const row = await t.prisma.contract.findUniqueOrThrow({ where: { id: draft.id }, include: { lines: true } })

    // Whichever ran first, the result is consistent: a pending contract never has an invalid line
    if (row.status === 'PENDING_SIGNATURE') {
      expect(row.lines.every(line => line.billRate.gt(0))).toBe(true)
      expect(replaced.statusCode).toBe(409)
    } else {
      expect(submitted.statusCode).toBe(400)
      expect(row.status).toBe('DRAFT')
    }
  })
})
