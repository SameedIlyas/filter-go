import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { addDays, localDate } from '../src/lib/time.js'
import { body, createTestApp, ensureOrg, grantSiteAccess, makeClient, makeFile, makeSite, resetDb } from './helpers.js'
import type { TestApp } from './helpers.js'
import { OTHER_ORG, ZERO_ID, api as makeApi, person } from './platform.helpers.js'
import type { Person } from './platform.helpers.js'

let t: TestApp
let api: ReturnType<typeof makeApi>

interface World {
  admin: Person
  sup1: Person
  sup2: Person
  fieldA: Person
  fieldB: Person
  fieldC: Person
  clientUser: Person
  otherAdmin: Person
  otherField: Person
  s1: { id: string }
  s2: { id: string }
  otherSite: { id: string }
}

let w: World

beforeAll(async () => {
  t = await createTestApp()
  api = makeApi(t)
})

afterAll(() => t.close())

beforeEach(async () => {
  await resetDb(t.prisma)

  const org = await ensureOrg(t)
  const s1 = await makeSite(t, { orgId: org.id, name: 'Site One' })
  const s2 = await makeSite(t, { orgId: org.id, name: 'Site Two' })
  const otherOrg = await ensureOrg(t, OTHER_ORG)
  const otherSite = await makeSite(t, { orgId: otherOrg.id, name: 'Elsewhere' })
  const client = await makeClient(t, { orgId: org.id })

  w = {
    admin: await person(t, 'ADMIN'),
    sup1: await person(t, 'SUPERVISOR', undefined, { name: 'Sup One' }),
    sup2: await person(t, 'SUPERVISOR', undefined, { name: 'Sup Two' }),
    fieldA: await person(t, 'FIELD_USER', undefined, { name: 'Alice Field' }),
    fieldB: await person(t, 'FIELD_USER', undefined, { name: 'Bob Field' }),
    fieldC: await person(t, 'FIELD_USER', undefined, { name: 'Cara Field' }),
    clientUser: await person(t, 'CLIENT_USER', undefined, { clientId: client.id }),
    otherAdmin: await person(t, 'ADMIN', OTHER_ORG),
    otherField: await person(t, 'FIELD_USER', OTHER_ORG),
    s1,
    s2,
    otherSite
  }

  // sup1 manages s1, sup2 manages s2; fieldA works s1, fieldB works s2, fieldC nowhere
  await grantSiteAccess(t, w.sup1.user.id, s1.id)
  await grantSiteAccess(t, w.sup2.user.id, s2.id)
  await grantSiteAccess(t, w.fieldA.user.id, s1.id)
  await grantSiteAccess(t, w.fieldB.user.id, s2.id)
})

const audits = (entity: string, action: string) => t.prisma.auditEvent.findMany({ where: { entity, action }, orderBy: { createdAt: 'asc' } })

describe('access control', () => {
  const allSignedIn = (): Array<[string, string, unknown?]> => [
    ['get', `/v1/users/${w.fieldA.user.id}`],
    ['get', `/v1/users/${w.fieldA.user.id}/availability`],
    ['put', `/v1/users/${w.fieldA.user.id}/availability`, { windows: [] }],
    ['get', `/v1/users/${w.fieldA.user.id}/sites`],
    ['get', `/v1/users/${w.fieldA.user.id}/documents`],
    ['post', `/v1/users/${w.fieldA.user.id}/documents`, { type: 'x' }],
    ['get', `/v1/users/${w.fieldA.user.id}/compliance`]
  ]

  const staffOnly = (): Array<[string, string, unknown?]> => [
    ['get', '/v1/users'],
    ['put', `/v1/users/${w.fieldA.user.id}/sites`, { siteIds: [] }],
    ['patch', `/v1/users/${w.fieldA.user.id}/documents/${ZERO_ID}`, { type: 'x' }],
    ['delete', `/v1/users/${w.fieldA.user.id}/documents/${ZERO_ID}`],
    ['get', '/v1/compliance/expiring']
  ]

  const call = (method: string, url: string, token?: string, payload?: unknown) =>
    (api as unknown as Record<string, (u: string, c: unknown) => Promise<{ statusCode: number }>>)[method]!(url, { token, body: payload })

  it('anonymous gets 401 everywhere', async () => {
    for (const [method, url, payload] of [...allSignedIn(), ...staffOnly()]) {
      expect((await call(method, url, undefined, payload)).statusCode, `${method} ${url}`).toBe(401)
    }
  })

  it('staff-only endpoints refuse field and client users with 403', async () => {
    for (const who of [w.fieldA, w.clientUser]) {
      for (const [method, url, payload] of staffOnly()) {
        expect((await call(method, url, who.token, payload)).statusCode, `${method} ${url}`).toBe(403)
      }
    }
  })

  it('PUT sites is admin only: a supervisor gets 403', async () => {
    const response = await api.put(`/v1/users/${w.fieldA.user.id}/sites`, { token: w.sup1.token, body: { siteIds: [] } })

    expect(response.statusCode).toBe(403)
  })

  it('bad ids are a 400, not a 404 or 500', async () => {
    expect((await api.get('/v1/users/not-a-uuid', { token: w.admin.token })).statusCode).toBe(400)
    expect((await api.get('/v1/users/not-a-uuid/availability', { token: w.admin.token })).statusCode).toBe(400)
    expect((await api.patch(`/v1/users/${w.fieldA.user.id}/documents/nope`, { token: w.admin.token, body: { type: 'x' } })).statusCode).toBe(400)
  })
})

describe('GET /users (directory)', () => {
  it('admin sees the whole organization and nothing of another one', async () => {
    const response = await api.get('/v1/users', { token: w.admin.token, query: { limit: '100' } })
    const users = body(response).data?.users as Array<{ id: string; orgId: string }>

    expect(response.statusCode).toBe(200)
    expect(users).toHaveLength(7)
    expect(users.every(user => user.orgId === w.admin.user.orgId)).toBe(true)
    expect(body(response).meta).toMatchObject({ page: 1, total: 7 })
  })

  it('a supervisor sees themselves and people who share a site, no one else', async () => {
    const response = await api.get('/v1/users', { token: w.sup1.token })
    const ids = (body(response).data?.users as Array<{ id: string }>).map(user => user.id).sort()

    expect(ids).toEqual([w.sup1.user.id, w.fieldA.user.id].sort())
  })

  it('a supervisor with no sites sees only themselves', async () => {
    const lonely = await person(t, 'SUPERVISOR')
    const users = body(await api.get('/v1/users', { token: lonely.token })).data?.users as Array<{ id: string }>

    expect(users.map(user => user.id)).toEqual([lonely.user.id])
  })

  it('supervisor scope changes immediately when their sites change', async () => {
    await grantSiteAccess(t, w.sup1.user.id, w.s2.id)

    const ids = (body(await api.get('/v1/users', { token: w.sup1.token })).data?.users as Array<{ id: string }>).map(user => user.id)

    expect(ids).toEqual(expect.arrayContaining([w.sup1.user.id, w.fieldA.user.id, w.fieldB.user.id, w.sup2.user.id]))
    expect(ids).not.toContain(w.fieldC.user.id)
  })

  it('filters by q, role, status and site', async () => {
    const byName = body(await api.get('/v1/users', { token: w.admin.token, query: { q: 'alice' } })).data?.users
    const byRole = body(await api.get('/v1/users', { token: w.admin.token, query: { role: 'SUPERVISOR' } })).meta
    const bySite = body(await api.get('/v1/users', { token: w.admin.token, query: { siteId: w.s2.id } })).data?.users as Array<{ id: string }>

    await t.prisma.user.update({ where: { id: w.fieldC.user.id }, data: { status: 'DISABLED' } })

    const byStatus = body(await api.get('/v1/users', { token: w.admin.token, query: { status: 'DISABLED' } })).data?.users as Array<{ id: string }>

    expect(byName).toHaveLength(1)
    expect(byRole?.total).toBe(2)
    expect(bySite.map(user => user.id).sort()).toEqual([w.sup2.user.id, w.fieldB.user.id].sort())
    expect(byStatus.map(user => user.id)).toEqual([w.fieldC.user.id])
  })

  it('pages the results', async () => {
    const page = await api.get('/v1/users', { token: w.admin.token, query: { limit: '3', page: '3' } })

    expect(body(page).data?.users).toHaveLength(1)
    expect(body(page).meta).toMatchObject({ page: 3, limit: 3, total: 7, totalPages: 3 })
  })

  it('a site filter outside the supervisor scope, or in another org, is 404', async () => {
    expect((await api.get('/v1/users', { token: w.sup1.token, query: { siteId: w.s2.id } })).statusCode).toBe(404)
    expect((await api.get('/v1/users', { token: w.admin.token, query: { siteId: w.otherSite.id } })).statusCode).toBe(404)
  })

  it('shows defaultPayRate to admins and supervisors only, and never leaks the password hash', async () => {
    await t.prisma.user.update({ where: { id: w.fieldA.user.id }, data: { defaultPayRate: '21.50' } })

    const asAdmin = body(await api.get('/v1/users', { token: w.admin.token, query: { q: 'alice' } })).data?.users[0]
    const asSup = body(await api.get('/v1/users', { token: w.sup1.token, query: { q: 'alice' } })).data?.users[0]
    const raw = (await api.get('/v1/users', { token: w.admin.token })).body

    expect(asAdmin.defaultPayRate).toBe('21.50')
    expect(asSup.defaultPayRate).toBe('21.50')
    expect(raw).not.toContain('passwordHash')
  })

  it('rejects unknown or invalid query values', async () => {
    expect((await api.get('/v1/users', { token: w.admin.token, query: { nope: '1' } })).statusCode).toBe(400)
    expect((await api.get('/v1/users', { token: w.admin.token, query: { role: 'KING' } })).statusCode).toBe(400)
    expect((await api.get('/v1/users', { token: w.admin.token, query: { limit: '1000' } })).statusCode).toBe(400)
    expect((await api.get('/v1/users', { token: w.admin.token, query: { siteId: 'x' } })).statusCode).toBe(400)
  })
})

describe('GET /users/:id', () => {
  it('admin, a supervisor sharing a site, and the user themselves can read', async () => {
    for (const who of [w.admin, w.sup1, w.fieldA]) {
      const response = await api.get(`/v1/users/${w.fieldA.user.id}`, { token: who.token })

      expect(response.statusCode).toBe(200)
      expect(body(response).data?.user.id).toBe(w.fieldA.user.id)
    }
  })

  it('a supervisor can always read themselves, even with no site', async () => {
    const lonely = await person(t, 'SUPERVISOR')

    expect((await api.get(`/v1/users/${lonely.user.id}`, { token: lonely.token })).statusCode).toBe(200)
  })

  it('out-of-scope users are 404: unshared site, other field user, other org', async () => {
    expect((await api.get(`/v1/users/${w.fieldB.user.id}`, { token: w.sup1.token })).statusCode).toBe(404)
    expect((await api.get(`/v1/users/${w.fieldB.user.id}`, { token: w.fieldA.token })).statusCode).toBe(404)
    expect((await api.get(`/v1/users/${w.otherField.user.id}`, { token: w.admin.token })).statusCode).toBe(404)
    expect((await api.get(`/v1/users/${w.fieldA.user.id}`, { token: w.otherAdmin.token })).statusCode).toBe(404)
    expect((await api.get(`/v1/users/${ZERO_ID}`, { token: w.admin.token })).statusCode).toBe(404)
  })

  it('redacts the pay rate for the user themselves and for client users', async () => {
    await t.prisma.user.update({ where: { id: w.fieldA.user.id }, data: { defaultPayRate: '19.00' } })

    const self = body(await api.get(`/v1/users/${w.fieldA.user.id}`, { token: w.fieldA.token })).data?.user
    const admin = body(await api.get(`/v1/users/${w.fieldA.user.id}`, { token: w.admin.token })).data?.user
    const sup = body(await api.get(`/v1/users/${w.fieldA.user.id}`, { token: w.sup1.token })).data?.user

    expect('defaultPayRate' in self).toBe(false)
    expect(admin.defaultPayRate).toBe('19.00')
    expect(sup.defaultPayRate).toBe('19.00')
  })
})

describe('availability', () => {
  const windows = [
    { weekday: 3, startTime: '13:00', endTime: '17:00' },
    { weekday: 1, startTime: '09:00', endTime: '12:00' },
    { weekday: 1, startTime: '12:00', endTime: '15:00' }
  ]
  const url = () => `/v1/users/${w.fieldA.user.id}/availability`

  it('starts empty and reports the org timezone', async () => {
    const response = await api.get(url(), { token: w.admin.token })

    expect(body(response).data).toEqual({ userId: w.fieldA.user.id, timezone: 'America/Chicago', windows: [] })
  })

  it('replaces all windows, returns them sorted, and audits the change', async () => {
    const first = await api.put(url(), { token: w.fieldA.token, body: { windows } })

    expect(first.statusCode).toBe(200)
    expect(body(first).data?.windows.map((row: { weekday: number; startTime: string }) => `${row.weekday}@${row.startTime}`)).toEqual(['1@09:00', '1@12:00', '3@13:00'])

    const second = await api.put(url(), { token: w.admin.token, body: { windows: [{ weekday: 7, startTime: '00:00', endTime: '23:59' }] } })

    expect(body(second).data?.windows).toHaveLength(1)
    expect(await t.prisma.userAvailability.count({ where: { userId: w.fieldA.user.id } })).toBe(1)

    const [one, two] = await audits('user', 'availability_replaced')

    expect(one?.actorId).toBe(w.fieldA.user.id)
    expect(one?.diff).toMatchObject({ before: [], after: expect.any(Array) })
    expect(two?.actorId).toBe(w.admin.user.id)
    expect((two?.diff as { before: unknown[] }).before).toHaveLength(3)
    expect(two?.entityId).toBe(w.fieldA.user.id)
  })

  it('an empty list clears every window', async () => {
    await api.put(url(), { token: w.admin.token, body: { windows } })
    await api.put(url(), { token: w.admin.token, body: { windows: [] } })

    expect(await t.prisma.userAvailability.count({ where: { userId: w.fieldA.user.id } })).toBe(0)
  })

  it('a supervisor sharing a site may read and write; others are 404', async () => {
    expect((await api.put(url(), { token: w.sup1.token, body: { windows } })).statusCode).toBe(200)
    expect((await api.get(url(), { token: w.sup1.token })).statusCode).toBe(200)
    expect((await api.get(url(), { token: w.sup2.token })).statusCode).toBe(404)
    expect((await api.put(url(), { token: w.sup2.token, body: { windows } })).statusCode).toBe(404)
    expect((await api.get(url(), { token: w.fieldB.token })).statusCode).toBe(404)
    expect((await api.put(url(), { token: w.fieldB.token, body: { windows } })).statusCode).toBe(404)
  })

  it('another organization gets 404', async () => {
    expect((await api.get(url(), { token: w.otherAdmin.token })).statusCode).toBe(404)
    expect((await api.put(url(), { token: w.otherAdmin.token, body: { windows } })).statusCode).toBe(404)
    expect(await t.prisma.userAvailability.count()).toBe(0)
  })

  it.each([
    ['end before start', [{ weekday: 1, startTime: '12:00', endTime: '09:00' }], 'windows.0.endTime'],
    ['zero length', [{ weekday: 1, startTime: '09:00', endTime: '09:00' }], 'windows.0.endTime'],
    ['overlap on a weekday', [{ weekday: 2, startTime: '09:00', endTime: '12:00' }, { weekday: 2, startTime: '11:59', endTime: '14:00' }], 'windows.1.startTime'],
    ['duplicate window', [{ weekday: 2, startTime: '09:00', endTime: '12:00' }, { weekday: 2, startTime: '09:00', endTime: '12:00' }], 'windows.1.startTime'],
    ['weekday 0', [{ weekday: 0, startTime: '09:00', endTime: '10:00' }], 'windows.0.weekday'],
    ['weekday 8', [{ weekday: 8, startTime: '09:00', endTime: '10:00' }], 'windows.0.weekday'],
    ['bad time', [{ weekday: 1, startTime: '9am', endTime: '10:00' }], 'windows.0.startTime'],
    ['24:00', [{ weekday: 1, startTime: '09:00', endTime: '24:00' }], 'windows.0.endTime'],
    ['extra key', [{ weekday: 1, startTime: '09:00', endTime: '10:00', note: 'x' }], 'windows.0.note']
  ])('rejects %s', async (_name, rows, field) => {
    const response = await api.put(url(), { token: w.admin.token, body: { windows: rows } })

    expect(response.statusCode).toBe(400)
    expect(body(response).error?.details?.issues.map((issue: { field: string }) => issue.field)).toContain(field)
    expect(await t.prisma.userAvailability.count()).toBe(0)
  })

  it('the same time on different weekdays is fine, and a failed replace keeps the old windows', async () => {
    await api.put(url(), { token: w.admin.token, body: { windows: [1, 2, 3].map(weekday => ({ weekday, startTime: '09:00', endTime: '10:00' })) } })
    await api.put(url(), { token: w.admin.token, body: { windows: [{ weekday: 1, startTime: '10:00', endTime: '09:00' }] } })

    expect(await t.prisma.userAvailability.count({ where: { userId: w.fieldA.user.id } })).toBe(3)
  })

  it('rejects unknown body keys, a missing windows key, and more than 70 windows', async () => {
    expect((await api.put(url(), { token: w.admin.token, body: { windows: [], extra: 1 } })).statusCode).toBe(400)
    expect((await api.put(url(), { token: w.admin.token, body: {} })).statusCode).toBe(400)

    const many = Array.from({ length: 71 }, (_v, index) => ({ weekday: (index % 7) + 1, startTime: '09:00', endTime: '10:00' }))

    expect((await api.put(url(), { token: w.admin.token, body: { windows: many } })).statusCode).toBe(400)
  })

  it('two simultaneous replaces never leave a mixture behind', async () => {
    const setA = [{ weekday: 1, startTime: '08:00', endTime: '09:00' }, { weekday: 2, startTime: '08:00', endTime: '09:00' }]
    const setB = [{ weekday: 5, startTime: '10:00', endTime: '11:00' }, { weekday: 6, startTime: '10:00', endTime: '11:00' }, { weekday: 7, startTime: '10:00', endTime: '11:00' }]

    const responses = await Promise.all([
      api.put(url(), { token: w.admin.token, body: { windows: setA } }),
      api.put(url(), { token: w.admin.token, body: { windows: setB } })
    ])

    expect(responses.map(response => response.statusCode)).toEqual([200, 200])

    const stored = await t.prisma.userAvailability.count({ where: { userId: w.fieldA.user.id } })

    expect([2, 3]).toContain(stored)
  })
})

describe('site access', () => {
  const url = (id = w.fieldC.user.id) => `/v1/users/${id}/sites`

  it('admin replaces the set, and the response lists the sites', async () => {
    const response = await api.put(url(), { token: w.admin.token, body: { siteIds: [w.s1.id, w.s2.id, w.s1.id] } })

    expect(response.statusCode).toBe(200)
    expect(body(response).data?.siteIds.sort()).toEqual([w.s1.id, w.s2.id].sort())
    expect(body(response).data?.sites[0]).toMatchObject({ name: 'Site One', active: true })

    const shrink = await api.put(url(), { token: w.admin.token, body: { siteIds: [w.s2.id] } })

    expect(body(shrink).data?.siteIds).toEqual([w.s2.id])
    expect(await t.prisma.userSiteAccess.count({ where: { userId: w.fieldC.user.id } })).toBe(1)
  })

  it('audits what was added and removed', async () => {
    await api.put(url(), { token: w.admin.token, body: { siteIds: [w.s1.id] } })
    await api.put(url(), { token: w.admin.token, body: { siteIds: [w.s2.id] } })

    const [first, second] = await audits('user', 'sites_replaced')

    expect(first?.diff).toEqual({ added: [w.s1.id], removed: [] })
    expect(second?.diff).toEqual({ added: [w.s2.id], removed: [w.s1.id] })
    expect(second?.actorId).toBe(w.admin.user.id)
  })

  it('an empty list removes all access', async () => {
    await api.put(url(w.fieldA.user.id), { token: w.admin.token, body: { siteIds: [] } })

    expect(await t.prisma.userSiteAccess.count({ where: { userId: w.fieldA.user.id } })).toBe(0)
  })

  it('rejects a site of another organization or an unknown site (400) and changes nothing', async () => {
    const foreign = await api.put(url(w.fieldA.user.id), { token: w.admin.token, body: { siteIds: [w.s2.id, w.otherSite.id] } })
    const unknown = await api.put(url(w.fieldA.user.id), { token: w.admin.token, body: { siteIds: [ZERO_ID] } })

    expect(foreign.statusCode).toBe(400)
    expect(body(foreign).error?.details?.issues[0].field).toBe('siteIds')
    expect(unknown.statusCode).toBe(400)
    expect((await t.prisma.userSiteAccess.findMany({ where: { userId: w.fieldA.user.id } })).map(row => row.siteId)).toEqual([w.s1.id])
  })

  it('refuses client users with 422', async () => {
    const response = await api.put(url(w.clientUser.user.id), { token: w.admin.token, body: { siteIds: [w.s1.id] } })

    expect(response.statusCode).toBe(422)
    expect(body(response).error?.code).toBe('UNPROCESSABLE')
  })

  it('a user of another organization is 404', async () => {
    expect((await api.put(url(w.otherField.user.id), { token: w.admin.token, body: { siteIds: [] } })).statusCode).toBe(404)
    expect((await api.put(url(), { token: w.otherAdmin.token, body: { siteIds: [] } })).statusCode).toBe(404)
  })

  it('validates the body strictly', async () => {
    expect((await api.put(url(), { token: w.admin.token, body: { siteIds: ['nope'] } })).statusCode).toBe(400)
    expect((await api.put(url(), { token: w.admin.token, body: { siteIds: [], x: 1 } })).statusCode).toBe(400)
    expect((await api.put(url(), { token: w.admin.token, body: {} })).statusCode).toBe(400)
  })

  it('granting a supervisor a site widens their directory at once', async () => {
    expect(body(await api.get('/v1/users', { token: w.sup1.token })).meta?.total).toBe(2)

    await api.put(url(w.sup1.user.id), { token: w.admin.token, body: { siteIds: [w.s1.id, w.s2.id] } })

    expect(body(await api.get('/v1/users', { token: w.sup1.token })).meta?.total).toBe(4)
  })

  it('reads: admin and self see everything; a supervisor only sees the overlap with their own sites', async () => {
    await api.put(url(w.fieldA.user.id), { token: w.admin.token, body: { siteIds: [w.s1.id, w.s2.id] } })

    const asAdmin = body(await api.get(url(w.fieldA.user.id), { token: w.admin.token })).data?.siteIds
    const asSelf = body(await api.get(url(w.fieldA.user.id), { token: w.fieldA.token })).data?.siteIds
    const asSup = body(await api.get(url(w.fieldA.user.id), { token: w.sup1.token })).data?.siteIds

    expect(asAdmin).toHaveLength(2)
    expect(asSelf).toHaveLength(2)
    expect(asSup).toEqual([w.s1.id])
    expect((await api.get(url(w.fieldB.user.id), { token: w.sup1.token })).statusCode).toBe(404)
    expect((await api.get(url(w.fieldB.user.id), { token: w.fieldA.token })).statusCode).toBe(404)
    expect((await api.get(url(), { token: w.otherAdmin.token })).statusCode).toBe(404)
  })

  it('two simultaneous replaces both succeed and leave one consistent set', async () => {
    const responses = await Promise.all([
      api.put(url(), { token: w.admin.token, body: { siteIds: [w.s1.id] } }),
      api.put(url(), { token: w.admin.token, body: { siteIds: [w.s1.id, w.s2.id] } })
    ])

    expect(responses.map(response => response.statusCode)).toEqual([200, 200])
    expect([1, 2]).toContain(await t.prisma.userSiteAccess.count({ where: { userId: w.fieldC.user.id } }))
  })
})

describe('documents', () => {
  const url = (id = w.fieldA.user.id) => `/v1/users/${id}/documents`

  it('admin, a supervisor sharing a site and the user themselves can create; type is trimmed and lower-cased', async () => {
    for (const who of [w.admin, w.sup1, w.fieldA]) {
      const response = await api.post(url(), { token: who.token, body: { type: '  Driver LICENSE ', expiresAt: '2030-01-31', notes: 'front and back' } })

      expect(response.statusCode).toBe(201)
      expect(body(response).data?.document).toMatchObject({ type: 'driver license', expiresAt: '2030-01-31', notes: 'front and back', userId: w.fieldA.user.id, fileId: null })
    }

    const list = body(await api.get(url(), { token: w.fieldA.token })).data?.documents

    expect(list).toHaveLength(3)
    expect((await audits('user_document', 'created')).map(row => row.actorId).sort()).toEqual([w.admin.user.id, w.sup1.user.id, w.fieldA.user.id].sort())
  })

  it('a supervisor without a shared site, other field users and other orgs get 404', async () => {
    for (const who of [w.sup2, w.fieldB, w.otherAdmin]) {
      expect((await api.post(url(), { token: who.token, body: { type: 'x' } })).statusCode).toBe(404)
      expect((await api.get(url(), { token: who.token })).statusCode).toBe(404)
    }

    expect(await t.prisma.userDocument.count()).toBe(0)
  })

  it('attaches a file only when it exists in the organization', async () => {
    const own = await makeFile(t, { orgId: w.admin.user.orgId, uploadedById: w.admin.user.id })
    const foreign = await makeFile(t, { orgId: w.otherAdmin.user.orgId })

    const good = await api.post(url(), { token: w.admin.token, body: { type: 'license', fileId: own.id } })
    const bad = await api.post(url(), { token: w.admin.token, body: { type: 'license', fileId: foreign.id } })
    const missing = await api.post(url(), { token: w.admin.token, body: { type: 'license', fileId: ZERO_ID } })

    expect(good.statusCode).toBe(201)
    expect(body(good).data?.document.fileId).toBe(own.id)
    expect(bad.statusCode).toBe(400)
    expect(body(bad).error?.details?.issues[0]).toMatchObject({ field: 'fileId', code: 'file_not_found' })
    expect(missing.statusCode).toBe(400)
  })

  it('validates the body strictly', async () => {
    const cases: unknown[] = [{}, { type: '' }, { type: 'x'.repeat(61) }, { type: 'x', expiresAt: '2030-02-30' }, { type: 'x', expiresAt: 'soon' }, { type: 'x', extra: 1 }, { type: 'x', notes: 'n'.repeat(1001) }, { type: 'x', fileId: 'nope' }]

    for (const payload of cases) {
      expect((await api.post(url(), { token: w.admin.token, body: payload })).statusCode, JSON.stringify(payload)).toBe(400)
    }
  })

  it('caps the number of documents per person', async () => {
    await t.prisma.userDocument.createMany({ data: Array.from({ length: 200 }, () => ({ orgId: w.admin.user.orgId, userId: w.fieldA.user.id, type: 'bulk' })) })

    const response = await api.post(url(), { token: w.admin.token, body: { type: 'one too many' } })

    expect(response.statusCode).toBe(422)
  })

  it('PATCH updates only the given fields and audits before/after (admin and supervisor)', async () => {
    const created = body(await api.post(url(), { token: w.admin.token, body: { type: 'license', expiresAt: '2030-01-01', notes: 'n' } })).data?.document

    const patched = await api.patch(`${url()}/${created.id}`, { token: w.sup1.token, body: { expiresAt: '2031-06-30', notes: null } })

    expect(patched.statusCode).toBe(200)
    expect(body(patched).data?.document).toMatchObject({ type: 'license', expiresAt: '2031-06-30', notes: null })

    const cleared = await api.patch(`${url()}/${created.id}`, { token: w.admin.token, body: { expiresAt: null, type: 'Insurance' } })

    expect(body(cleared).data?.document).toMatchObject({ type: 'insurance', expiresAt: null })

    const [first] = await audits('user_document', 'updated')

    expect(first?.diff).toMatchObject({ before: { expiresAt: '2030-01-01', notes: 'n' }, after: { expiresAt: '2031-06-30', notes: null } })
  })

  it('PATCH and DELETE are staff only and scoped: the user themselves gets 403, an unshared supervisor 404', async () => {
    const created = body(await api.post(url(), { token: w.admin.token, body: { type: 'license' } })).data?.document

    expect((await api.patch(`${url()}/${created.id}`, { token: w.fieldA.token, body: { type: 'x' } })).statusCode).toBe(403)
    expect((await api.delete(`${url()}/${created.id}`, { token: w.fieldA.token })).statusCode).toBe(403)
    expect((await api.patch(`${url()}/${created.id}`, { token: w.sup2.token, body: { type: 'x' } })).statusCode).toBe(404)
    expect((await api.delete(`${url()}/${created.id}`, { token: w.sup2.token })).statusCode).toBe(404)
    expect((await api.patch(`${url()}/${created.id}`, { token: w.otherAdmin.token, body: { type: 'x' } })).statusCode).toBe(404)
    expect((await api.patch(`${url()}/${created.id}`, { token: w.admin.token, body: {} })).statusCode).toBe(400)
    expect((await api.patch(`${url()}/${created.id}`, { token: w.admin.token, body: { fileId: ZERO_ID } })).statusCode).toBe(400)
  })

  it("a document cannot be reached through someone else's user id", async () => {
    const created = body(await api.post(url(), { token: w.admin.token, body: { type: 'license' } })).data?.document

    expect((await api.patch(`${url(w.fieldC.user.id)}/${created.id}`, { token: w.admin.token, body: { type: 'x' } })).statusCode).toBe(404)
    expect((await api.delete(`${url(w.fieldC.user.id)}/${created.id}`, { token: w.admin.token })).statusCode).toBe(404)
    expect(await t.prisma.userDocument.count()).toBe(1)
  })

  it('DELETE removes the document once and audits it; a second delete is 404', async () => {
    const created = body(await api.post(url(), { token: w.admin.token, body: { type: 'license' } })).data?.document

    const first = await api.delete(`${url()}/${created.id}`, { token: w.sup1.token })
    const second = await api.delete(`${url()}/${created.id}`, { token: w.admin.token })

    expect(first.statusCode).toBe(200)
    expect(body(first).data).toEqual({ deleted: true })
    expect(second.statusCode).toBe(404)
    expect(await audits('user_document', 'deleted')).toHaveLength(1)
  })

  it('two simultaneous deletes: one wins, the other is 404, one audit row', async () => {
    const created = body(await api.post(url(), { token: w.admin.token, body: { type: 'license' } })).data?.document
    const responses = await Promise.all([api.delete(`${url()}/${created.id}`, { token: w.admin.token }), api.delete(`${url()}/${created.id}`, { token: w.admin.token })])

    expect(responses.map(response => response.statusCode).sort()).toEqual([200, 404])
    expect(await audits('user_document', 'deleted')).toHaveLength(1)
  })
})

describe('compliance', () => {
  const today = () => localDate(new Date(), 'America/Chicago')
  const url = (id = w.fieldA.user.id) => `/v1/users/${id}/compliance`

  const addDoc = (type: string, expiresAt: string | null, userId = w.fieldA.user.id) =>
    t.prisma.userDocument.create({ data: { orgId: w.admin.user.orgId, userId, type, expiresAt: expiresAt ? new Date(`${expiresAt}T00:00:00.000Z`) : null } })

  it('classifies each document at the exact boundaries', async () => {
    const day = today()

    await Promise.all([
      addDoc('yesterday', addDays(day, -1)),
      addDoc('today', day),
      addDoc('in 30 days', addDays(day, 30)),
      addDoc('in 31 days', addDays(day, 31)),
      addDoc('never', null)
    ])

    const data = body(await api.get(url(), { token: w.admin.token })).data as { today: string; overall: string; documents: Array<{ type: string; status: string; daysUntilExpiry: number | null }> }
    const byType = Object.fromEntries(data.documents.map(document => [document.type, document]))

    expect(data.today).toBe(day)
    expect(byType['yesterday']).toMatchObject({ status: 'EXPIRED', daysUntilExpiry: -1 })
    expect(byType['today']).toMatchObject({ status: 'EXPIRING', daysUntilExpiry: 0 })
    expect(byType['in 30 days']).toMatchObject({ status: 'EXPIRING', daysUntilExpiry: 30 })
    expect(byType['in 31 days']).toMatchObject({ status: 'VALID', daysUntilExpiry: 31 })
    expect(byType['never']).toMatchObject({ status: 'VALID', daysUntilExpiry: null })
    expect(data.overall).toBe('EXPIRED')
    expect(data.documents[0]?.type).toBe('yesterday')
  })

  it('overall is the worst status; nothing on file is VALID', async () => {
    expect(body(await api.get(url(), { token: w.admin.token })).data?.overall).toBe('VALID')

    await addDoc('license', addDays(today(), 10))

    expect(body(await api.get(url(), { token: w.admin.token })).data?.overall).toBe('EXPIRING')

    await addDoc('insurance', addDays(today(), 400))

    expect(body(await api.get(url(), { token: w.admin.token })).data?.overall).toBe('EXPIRING')
  })

  it('is readable by admin, a supervisor sharing a site and the user; 404 otherwise', async () => {
    for (const who of [w.admin, w.sup1, w.fieldA]) expect((await api.get(url(), { token: who.token })).statusCode).toBe(200)
    for (const who of [w.sup2, w.fieldB, w.otherAdmin]) expect((await api.get(url(), { token: who.token })).statusCode).toBe(404)
  })

  it('GET /compliance/expiring lists lapsed and soon-to-lapse documents, oldest first, honouring days', async () => {
    const day = today()

    await Promise.all([
      addDoc('long gone', addDays(day, -400)),
      addDoc('soon', addDays(day, 5)),
      addDoc('later', addDays(day, 45)),
      addDoc('never', null),
      addDoc('bobs', addDays(day, -2), w.fieldB.user.id)
    ])

    const thirty = body(await api.get('/v1/compliance/expiring', { token: w.admin.token })).data as { days: number; documents: Array<{ type: string; status: string; user: { id: string; name: string } }> }
    const sixty = body(await api.get('/v1/compliance/expiring', { token: w.admin.token, query: { days: '60' } })).data as typeof thirty
    const zero = body(await api.get('/v1/compliance/expiring', { token: w.admin.token, query: { days: '0' } })).data as typeof thirty

    expect(thirty.days).toBe(30)
    expect(thirty.documents.map(document => document.type)).toEqual(['long gone', 'bobs', 'soon'])
    expect(thirty.documents[0]).toMatchObject({ status: 'EXPIRED', user: { id: w.fieldA.user.id, name: 'Alice Field' } })
    expect(sixty.documents.map(document => document.type)).toEqual(['long gone', 'bobs', 'soon', 'later'])
    expect(zero.documents.map(document => document.type)).toEqual(['long gone', 'bobs'])
  })

  it('a supervisor only sees documents of people in their scope; disabled users are left out', async () => {
    const day = today()

    await Promise.all([addDoc('alice doc', addDays(day, 1)), addDoc('bob doc', addDays(day, 1), w.fieldB.user.id), addDoc('cara doc', addDays(day, 1), w.fieldC.user.id)])

    const asSup = body(await api.get('/v1/compliance/expiring', { token: w.sup1.token })).data?.documents as Array<{ type: string }>

    expect(asSup.map(document => document.type)).toEqual(['alice doc'])

    await t.prisma.user.update({ where: { id: w.fieldA.user.id }, data: { status: 'DISABLED' } })

    const asAdmin = body(await api.get('/v1/compliance/expiring', { token: w.admin.token })).data?.documents as Array<{ type: string }>

    expect(asAdmin.map(document => document.type).sort()).toEqual(['bob doc', 'cara doc'])
  })

  it('never shows another organization and pages the list', async () => {
    await addDoc('mine', addDays(today(), 1))
    await t.prisma.userDocument.create({ data: { orgId: w.otherAdmin.user.orgId, userId: w.otherField.user.id, type: 'theirs', expiresAt: new Date(`${addDays(today(), 1)}T00:00:00.000Z`) } })

    const list = await api.get('/v1/compliance/expiring', { token: w.admin.token, query: { limit: '1' } })
    const other = body(await api.get('/v1/compliance/expiring', { token: w.otherAdmin.token })).data?.documents as Array<{ type: string }>

    expect(body(list).data?.documents).toHaveLength(1)
    expect(body(list).meta).toMatchObject({ total: 1, limit: 1 })
    expect(other.map(document => document.type)).toEqual(['theirs'])
  })

  it('rejects a bad days value', async () => {
    for (const days of ['-1', 'abc', '99999', '1.5']) {
      expect((await api.get('/v1/compliance/expiring', { token: w.admin.token, query: { days } })).statusCode, days).toBe(400)
    }
  })

  it('uses the organization calendar day, not the server day', async () => {
    await t.prisma.organization.update({ where: { id: w.admin.user.orgId }, data: { timezone: 'Pacific/Kiritimati' } })

    const expected = localDate(new Date(), 'Pacific/Kiritimati')

    expect(body(await api.get(url(), { token: w.admin.token })).data?.today).toBe(expected)
  })
})
