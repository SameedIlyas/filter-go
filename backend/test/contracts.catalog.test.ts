import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { body, createTestApp, ensureOrg, makeContract, makeService, resetDb } from './helpers.js'
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

describe('services', () => {
  it('rejects anonymous callers and unauthorized roles', async () => {
    expect((await w.api.get('/v1/services')).statusCode).toBe(401)
    expect((await w.api.post('/v1/services', { body: { name: 'X' } })).statusCode).toBe(401)
    expect((await w.api.patch(`/v1/services/${NIL_ID}`, { body: { name: 'X' } })).statusCode).toBe(401)

    for (const token of [w.field.token, w.clientUser.token]) {
      expect((await w.api.get('/v1/services', { token })).statusCode).toBe(403)
    }

    expect((await w.api.post('/v1/services', { token: w.supervisor.token, body: { name: 'X' } })).statusCode).toBe(403)
    expect((await w.api.patch(`/v1/services/${NIL_ID}`, { token: w.supervisor.token, body: { name: 'X' } })).statusCode).toBe(403)
  })

  it('admin creates, lists (admin and supervisor) and edits a service', async () => {
    const created = await w.api.post('/v1/services', { token: w.admin.token, body: { name: 'Deep clean', description: 'Kitchens' } })

    expect(created.statusCode).toBe(201)
    expect(body(created).data?.service).toMatchObject({ name: 'Deep clean', description: 'Kitchens', active: true })

    const id = body(created).data?.service.id as string
    const updated = await w.api.patch(`/v1/services/${id}`, { token: w.admin.token, body: { active: false, description: null } })

    expect(body(updated).data?.service).toMatchObject({ active: false, description: null })

    for (const token of [w.admin.token, w.supervisor.token]) {
      const list = await w.api.get('/v1/services', { token, query: { active: 'false' } })

      expect(body(list).data?.services).toHaveLength(1)
      expect(body(list).meta).toMatchObject({ page: 1, total: 1 })
    }

    expect(body(await w.api.get('/v1/services', { token: w.admin.token, query: { active: 'true', q: 'deep' } })).data?.services).toHaveLength(0)
  })

  it('writes audit rows', async () => {
    const id = body(await w.api.post('/v1/services', { token: w.admin.token, body: { name: 'A' } })).data?.service.id as string

    await w.api.patch(`/v1/services/${id}`, { token: w.admin.token, body: { name: 'B' } })

    const rows = await t.prisma.auditEvent.findMany({ where: { entity: 'service', entityId: id }, orderBy: { createdAt: 'asc' } })

    expect(rows.map(row => row.action)).toEqual(['created', 'updated'])
    expect(rows[0]?.actorId).toBe(w.admin.id)
  })

  it('refuses a duplicate name on create and on rename (DUPLICATE), per organization', async () => {
    await w.api.post('/v1/services', { token: w.admin.token, body: { name: 'Windows' } })

    const dup = await w.api.post('/v1/services', { token: w.admin.token, body: { name: 'Windows' } })

    expect(dup.statusCode).toBe(409)
    expect(body(dup).error?.code).toBe('DUPLICATE')

    const other = body(await w.api.post('/v1/services', { token: w.admin.token, body: { name: 'Floors' } })).data?.service.id as string
    const rename = await w.api.patch(`/v1/services/${other}`, { token: w.admin.token, body: { name: 'Windows' } })

    expect(body(rename).error?.code).toBe('DUPLICATE')
    expect((await w.api.post('/v1/services', { token: w.otherAdmin.token, body: { name: 'Windows' } })).statusCode).toBe(201)
  })

  it('other organizations cannot see or edit it (404)', async () => {
    const service = await makeService(t, { name: 'Private' })

    expect((await w.api.patch(`/v1/services/${service.id}`, { token: w.otherAdmin.token, body: { name: 'Hijack' } })).statusCode).toBe(404)
    expect(body(await w.api.get('/v1/services', { token: w.otherAdmin.token })).data?.services).toHaveLength(0)
  })

  it('validates bodies, ids and queries strictly', async () => {
    const post = (payload: unknown) => w.api.post('/v1/services', { token: w.admin.token, body: payload })

    expect((await post({ name: 'X', extra: 1 })).statusCode).toBe(400)
    expect((await post({})).statusCode).toBe(400)
    expect((await post({ name: '' })).statusCode).toBe(400)
    expect((await post({ name: 'x'.repeat(101) })).statusCode).toBe(400)
    expect((await w.api.patch('/v1/services/nope', { token: w.admin.token, body: { name: 'X' } })).statusCode).toBe(400)
    expect((await w.api.patch(`/v1/services/${NIL_ID}`, { token: w.admin.token, body: {} })).statusCode).toBe(400)
    expect((await w.api.patch(`/v1/services/${NIL_ID}`, { token: w.admin.token, body: { name: 'X' } })).statusCode).toBe(404)
    expect((await w.api.get('/v1/services', { token: w.admin.token, query: { limit: '1000' } })).statusCode).toBe(400)
    expect((await w.api.get('/v1/services', { token: w.admin.token, query: { active: 'maybe' } })).statusCode).toBe(400)
  })
})

describe('tax rates', () => {
  const put = (code: string, payload: unknown, token = w.admin.token) => w.api.put(`/v1/tax-rates/${code}`, { token, body: payload })

  it('is admin only', async () => {
    expect((await w.api.get('/v1/tax-rates')).statusCode).toBe(401)
    expect((await put('GST', { ratePercent: '5' }, '')).statusCode).toBe(401)

    for (const token of [w.supervisor.token, w.field.token, w.clientUser.token]) {
      expect((await w.api.get('/v1/tax-rates', { token })).statusCode).toBe(403)
      expect((await put('GST', { ratePercent: '5' }, token)).statusCode).toBe(403)
      expect((await w.api.delete('/v1/tax-rates/GST', { token })).statusCode).toBe(403)
    }
  })

  it('upserts with 3 decimals, upper-cases the code and lists sorted', async () => {
    const created = await put('vat', { ratePercent: '8.25' })

    expect(created.statusCode).toBe(200)
    expect(body(created).data?.taxRate).toEqual({ code: 'VAT', ratePercent: '8.250' })
    expect(body(await put('VAT', { ratePercent: 20 })).data?.taxRate.ratePercent).toBe('20.000')

    await put('GST', { ratePercent: '5.125' })

    const list = await w.api.get('/v1/tax-rates', { token: w.admin.token })

    expect(body(list).data?.taxRates).toEqual([
      { code: 'GST', ratePercent: '5.125' },
      { code: 'VAT', ratePercent: '20.000' }
    ])
    expect(await t.prisma.taxRate.count()).toBe(2)
  })

  it('accepts the 0 and 100 boundaries and rejects everything outside', async () => {
    expect((await put('ZERO', { ratePercent: '0' })).statusCode).toBe(200)
    expect((await put('FULL', { ratePercent: '100.000' })).statusCode).toBe(200)

    for (const bad of ['100.001', '-1', '8.2501', 'abc', '', 101, null]) {
      expect((await put('BAD', { ratePercent: bad })).statusCode).toBe(400)
    }

    expect((await put('BAD', { ratePercent: '5', extra: 1 })).statusCode).toBe(400)
    expect((await put('BAD', {})).statusCode).toBe(400)
    expect((await put('bad code', { ratePercent: '5' })).statusCode).toBe(400)
  })

  it('serialises concurrent first-time upserts of the same code without an error', async () => {
    const results = await Promise.all([put('RACE', { ratePercent: '1' }), put('RACE', { ratePercent: '2' }), put('RACE', { ratePercent: '3' })])

    expect(results.map(result => result.statusCode)).toEqual([200, 200, 200])
    expect(await t.prisma.taxRate.count({ where: { code: 'RACE' } })).toBe(1)
  })

  it('isolates organizations', async () => {
    await put('GST', { ratePercent: '5' })
    await put('GST', { ratePercent: '9' }, w.otherAdmin.token)

    expect(body(await w.api.get('/v1/tax-rates', { token: w.admin.token })).data?.taxRates).toEqual([{ code: 'GST', ratePercent: '5.000' }])
    expect((await w.api.delete('/v1/tax-rates/GST', { token: w.otherAdmin.token })).statusCode).toBe(200)
    expect(body(await w.api.get('/v1/tax-rates', { token: w.admin.token })).data?.taxRates).toHaveLength(1)
  })

  it('deletes an unused code, 404 when it does not exist, and audits both writes', async () => {
    await put('OLD', { ratePercent: '5' })

    expect((await w.api.delete('/v1/tax-rates/OLD', { token: w.admin.token })).statusCode).toBe(200)
    expect((await w.api.delete('/v1/tax-rates/OLD', { token: w.admin.token })).statusCode).toBe(404)
    expect((await t.prisma.auditEvent.findMany({ where: { entity: 'tax_rate' }, orderBy: { createdAt: 'asc' } })).map(row => row.action)).toEqual(['upserted', 'deleted'])
  })

  it.each(['DRAFT', 'PENDING_SIGNATURE', 'ACTIVE', 'SUSPENDED'] as const)('refuses to delete a code used by a %s contract (CONFLICT)', async status => {
    await put('GST', { ratePercent: '5' })

    const org = await ensureOrg(t)

    await makeContract(t, { orgId: org.id, status, lines: [{ taxCode: 'GST' }] })

    const response = await w.api.delete('/v1/tax-rates/GST', { token: w.admin.token })

    expect(response.statusCode).toBe(409)
    expect(body(response).error?.code).toBe('CONFLICT')
    expect(await t.prisma.taxRate.count({ where: { code: 'GST' } })).toBe(1)
  })

  it.each(['EXPIRED', 'CANCELLED'] as const)('allows deleting a code only used by a %s contract', async status => {
    await put('GST', { ratePercent: '5' })
    await makeContract(t, { orgId: (await ensureOrg(t)).id, status, lines: [{ taxCode: 'GST' }] })

    expect((await w.api.delete('/v1/tax-rates/GST', { token: w.admin.token })).statusCode).toBe(200)
  })

  it("does not count another organization's contract lines", async () => {
    await put('GST', { ratePercent: '5' })
    await makeContract(t, { orgId: (await ensureOrg(t, 'Other Org')).id, status: 'ACTIVE', lines: [{ taxCode: 'GST' }] })

    expect((await w.api.delete('/v1/tax-rates/GST', { token: w.admin.token })).statusCode).toBe(200)
  })
})
