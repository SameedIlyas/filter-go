import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { STRONG_PASSWORD, body, client, createTestApp, createUser, loginAs, resetDb, tokenFromMail } from './helpers.js'
import type { TestApp } from './helpers.js'

let t: TestApp
let api: ReturnType<typeof client>
let adminToken: string
let admin: Awaited<ReturnType<typeof createUser>>

beforeAll(async () => {
  t = await createTestApp()
  api = client(t.app)
})

afterAll(() => t.close())
beforeEach(async () => {
  await resetDb(t.prisma)
  t.mailer.clear()
  admin = await createUser(t, { email: 'admin@filter-go.test', role: 'ADMIN' })
  adminToken = await loginAs(t, admin.email)
})

describe('access control', () => {
  const endpoints: Array<['get' | 'post' | 'patch', string, unknown?]> = [
    ['get', '/v1/admin/users'],
    ['get', '/v1/admin/users/00000000-0000-4000-8000-000000000000'],
    ['post', '/v1/admin/users/invite', { email: 'a@b.com', name: 'A' }],
    ['patch', '/v1/admin/users/00000000-0000-4000-8000-000000000000', { name: 'A' }],
    ['post', '/v1/admin/users/00000000-0000-4000-8000-000000000000/revoke-sessions']
  ]

  it.each(endpoints)('%s %s: anonymous gets 401', async (method, url, payload) => {
    const response = await api[method](url, { body: payload })

    expect(response.statusCode).toBe(401)
    expect(body(response).error?.code).toBe('UNAUTHENTICATED')
  })

  it.each(endpoints)('%s %s: a non-admin gets 403', async (method, url, payload) => {
    const staff = await createUser(t, { role: 'FIELD_USER' })
    const response = await api[method](url, { token: await loginAs(t, staff.email), body: payload })

    expect(response.statusCode).toBe(403)
    expect(body(response).error?.code).toBe('FORBIDDEN')
  })

  it('a demoted admin loses access immediately', async () => {
    const other = await createUser(t, { role: 'ADMIN' })
    const otherToken = await loginAs(t, other.email)

    await api.patch(`/v1/admin/users/${other.id}`, { token: adminToken, body: { role: 'FIELD_USER' } })

    expect((await api.get('/v1/admin/users', { token: otherToken })).statusCode).toBe(403)
  })
})

describe('POST /v1/admin/users/invite', () => {
  it('creates an invited user and emails them', async () => {
    const response = await api.post('/v1/admin/users/invite', { token: adminToken, body: { email: 'New@Filter-Go.test', name: 'Nina', role: 'ADMIN' } })

    expect(response.statusCode).toBe(201)
    expect(body(response).data).toMatchObject({ emailSent: true, user: { email: 'new@filter-go.test', role: 'ADMIN', status: 'INVITED' } })
    expect(response.body).not.toContain(tokenFromMail(t.mailer, 'new@filter-go.test'))
    expect(t.mailer.sent).toHaveLength(1)
  })

  it('defaults the role to STAFF', async () => {
    const response = await api.post('/v1/admin/users/invite', { token: adminToken, body: { email: 'new@filter-go.test', name: 'Nina' } })

    expect(body(response).data?.user.role).toBe('FIELD_USER')
  })

  it('rejects an email that already has a password', async () => {
    const response = await api.post('/v1/admin/users/invite', { token: adminToken, body: { email: admin.email, name: 'Dup' } })

    expect(response.statusCode).toBe(409)
    expect(body(response).error?.code).toBe('EMAIL_TAKEN')
  })

  it('re-inviting a pending user re-issues the link instead of failing', async () => {
    await api.post('/v1/admin/users/invite', { token: adminToken, body: { email: 'new@filter-go.test', name: 'Nina' } })
    const again = await api.post('/v1/admin/users/invite', { token: adminToken, body: { email: 'new@filter-go.test', name: 'Nina B', role: 'ADMIN' } })

    expect(again.statusCode).toBe(201)
    expect(body(again).data?.user).toMatchObject({ name: 'Nina B', role: 'ADMIN' })
    expect(await t.prisma.user.count({ where: { email: 'new@filter-go.test' } })).toBe(1)
    expect(t.mailer.sent).toHaveLength(2)
  })

  it('still creates the invite and reports emailSent=false if the mail server fails', async () => {
    vi.spyOn(t.ctx.mailer, 'send').mockRejectedValueOnce(new Error('smtp down'))

    const response = await api.post('/v1/admin/users/invite', { token: adminToken, body: { email: 'new@filter-go.test', name: 'Nina' } })

    expect(response.statusCode).toBe(201)
    expect(body(response).data?.emailSent).toBe(false)
  })

  it('validates input and rejects unknown roles', async () => {
    for (const payload of [{}, { email: 'x', name: 'A' }, { email: 'a@b.com', name: '' }, { email: 'a@b.com', name: 'A', role: 'OWNER' }, { email: 'a@b.com', name: 'A', status: 'ACTIVE' }]) {
      expect((await api.post('/v1/admin/users/invite', { token: adminToken, body: payload })).statusCode).toBe(400)
    }
  })

  it('records who invited whom', async () => {
    await api.post('/v1/admin/users/invite', { token: adminToken, body: { email: 'new@filter-go.test', name: 'Nina' } })

    const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: 'INVITE_SENT' } })

    expect(event.actorId).toBe(admin.id)
  })
})

describe('GET /v1/admin/users', () => {
  beforeEach(async () => {
    await createUser(t, { email: 'alice@filter-go.test', name: 'Alice Smith' })
    await createUser(t, { email: 'bob@filter-go.test', name: 'Bob Jones', role: 'ADMIN' })
    await createUser(t, { email: 'carol@filter-go.test', name: 'Carol', status: 'DISABLED' })
  })

  it('lists users with pagination metadata and no secrets', async () => {
    const response = await api.get('/v1/admin/users', { token: adminToken, query: { limit: '2', page: '1' } })
    const json = body(response)

    expect(response.statusCode).toBe(200)
    expect(json.data?.users).toHaveLength(2)
    expect(json.meta).toEqual({ page: 1, limit: 2, total: 4, totalPages: 2 })
    expect(response.body).not.toMatch(/passwordHash/)
  })

  it('returns later pages', async () => {
    const json = body(await api.get('/v1/admin/users', { token: adminToken, query: { limit: '3', page: '2' } }))

    expect(json.data?.users).toHaveLength(1)
  })

  it('filters by search, role and status', async () => {
    const search = body(await api.get('/v1/admin/users', { token: adminToken, query: { q: 'ALICE' } }))
    const role = body(await api.get('/v1/admin/users', { token: adminToken, query: { role: 'ADMIN' } }))
    const status = body(await api.get('/v1/admin/users', { token: adminToken, query: { status: 'DISABLED' } }))

    expect(search.data?.users.map((user: { name: string }) => user.name)).toEqual(['Alice Smith'])
    expect(role.meta?.total).toBe(2)
    expect(status.data?.users[0]?.email).toBe('carol@filter-go.test')
  })

  it('rejects out-of-range paging and unknown filters', async () => {
    for (const query of [{ limit: '1000' }, { page: '0' }, { limit: 'abc' }, { role: 'OWNER' }, { sort: 'name' }] as Array<Record<string, string>>) {
      expect((await api.get('/v1/admin/users', { token: adminToken, query })).statusCode).toBe(400)
    }
  })

  it('treats SQL metacharacters in search as plain text', async () => {
    const response = await api.get('/v1/admin/users', { token: adminToken, query: { q: "'; DROP TABLE users; --" } })

    expect(response.statusCode).toBe(200)
    expect(await t.prisma.user.count()).toBe(4)
  })
})

describe('GET /v1/admin/users/:id', () => {
  it('returns a user', async () => {
    const user = await createUser(t, { name: 'Zed' })
    const response = await api.get(`/v1/admin/users/${user.id}`, { token: adminToken })

    expect(body(response).data?.user).toMatchObject({ id: user.id, name: 'Zed' })
  })

  it('404s for a missing user and 400s for a malformed id', async () => {
    expect(body(await api.get('/v1/admin/users/00000000-0000-4000-8000-000000000000', { token: adminToken })).error?.code).toBe('USER_NOT_FOUND')
    expect((await api.get('/v1/admin/users/abc', { token: adminToken })).statusCode).toBe(400)
  })
})

describe('PATCH /v1/admin/users/:id', () => {
  it('updates name and role', async () => {
    const user = await createUser(t)
    const response = await api.patch(`/v1/admin/users/${user.id}`, { token: adminToken, body: { name: 'Renamed', role: 'ADMIN' } })

    expect(body(response).data?.user).toMatchObject({ name: 'Renamed', role: 'ADMIN' })
  })

  it('an admin cannot change their own role or status', async () => {
    for (const payload of [{ role: 'FIELD_USER' }, { status: 'DISABLED' }]) {
      const response = await api.patch(`/v1/admin/users/${admin.id}`, { token: adminToken, body: payload })

      expect(response.statusCode).toBe(409)
      expect(body(response).error?.code).toBe('CANNOT_MODIFY_SELF')
    }

    expect((await api.get('/v1/auth/me', { token: adminToken })).statusCode).toBe(200)
  })

  it('disabling cuts off every session at once and blocks login', async () => {
    const user = await createUser(t)
    const one = await loginAs(t, user.email)
    const two = await loginAs(t, user.email)

    const response = await api.patch(`/v1/admin/users/${user.id}`, { token: adminToken, body: { status: 'DISABLED' } })

    expect(response.statusCode).toBe(200)
    expect((await api.get('/v1/auth/me', { token: one })).statusCode).toBe(401)
    expect((await api.get('/v1/auth/me', { token: two })).statusCode).toBe(401)
    expect(body(await api.post('/v1/auth/login', { body: { email: user.email, password: STRONG_PASSWORD } })).error?.code).toBe('ACCOUNT_DISABLED')
  })

  it('re-enabling restores access', async () => {
    const user = await createUser(t)

    await api.patch(`/v1/admin/users/${user.id}`, { token: adminToken, body: { status: 'DISABLED' } })
    await api.patch(`/v1/admin/users/${user.id}`, { token: adminToken, body: { status: 'ACTIVE' } })

    expect((await api.post('/v1/auth/login', { body: { email: user.email, password: STRONG_PASSWORD } })).statusCode).toBe(200)
  })

  it('cannot activate someone who never set a password', async () => {
    const pending = await createUser(t, { password: null })
    const response = await api.patch(`/v1/admin/users/${pending.id}`, { token: adminToken, body: { status: 'ACTIVE' } })

    expect(response.statusCode).toBe(409)
    expect(body(response).error?.code).toBe('USER_NOT_ACTIVATED')
  })

  it('disabling voids pending invite/reset links', async () => {
    await api.post('/v1/admin/users/invite', { token: adminToken, body: { email: 'new@filter-go.test', name: 'Nina' } })
    const token = tokenFromMail(t.mailer, 'new@filter-go.test')
    const pending = await t.prisma.user.findUniqueOrThrow({ where: { email: 'new@filter-go.test' } })

    await api.patch(`/v1/admin/users/${pending.id}`, { token: adminToken, body: { status: 'DISABLED' } })

    expect((await api.post('/v1/auth/accept-invite', { body: { token, password: STRONG_PASSWORD } })).statusCode).toBe(400)
  })

  it('a cancelled invite can be re-issued', async () => {
    await api.post('/v1/admin/users/invite', { token: adminToken, body: { email: 'new@filter-go.test', name: 'Nina' } })
    const pending = await t.prisma.user.findUniqueOrThrow({ where: { email: 'new@filter-go.test' } })

    await api.patch(`/v1/admin/users/${pending.id}`, { token: adminToken, body: { status: 'DISABLED' } })
    const again = await api.post('/v1/admin/users/invite', { token: adminToken, body: { email: 'new@filter-go.test', name: 'Nina' } })

    expect(body(again).data?.user.status).toBe('INVITED')
  })

  it('refuses fields an admin must not edit (email, password, id)', async () => {
    const user = await createUser(t)

    for (const payload of [{ email: 'x@y.com' }, { passwordHash: 'x' }, { id: 'x' }, {}]) {
      expect((await api.patch(`/v1/admin/users/${user.id}`, { token: adminToken, body: payload })).statusCode).toBe(400)
    }
  })

  it('404s for a missing user', async () => {
    const response = await api.patch('/v1/admin/users/00000000-0000-4000-8000-000000000000', { token: adminToken, body: { name: 'X' } })

    expect(response.statusCode).toBe(404)
  })
})

describe('POST /v1/admin/users/:id/revoke-sessions', () => {
  it('force-logs-out a user without disabling them', async () => {
    const user = await createUser(t)
    const token = await loginAs(t, user.email)
    const response = await api.post(`/v1/admin/users/${user.id}/revoke-sessions`, { token: adminToken })

    expect(body(response).data?.revoked).toBe(1)
    expect((await api.get('/v1/auth/me', { token })).statusCode).toBe(401)
    expect((await api.post('/v1/auth/login', { body: { email: user.email, password: STRONG_PASSWORD } })).statusCode).toBe(200)
  })
})
