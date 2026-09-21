import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { purgeExpired } from '../src/modules/maintenance/cleanup.js'
import { STRONG_PASSWORD, body, client, createTestApp, createUser, resetDb } from './helpers.js'
import type { TestApp } from './helpers.js'

describe('response envelope, headers and errors', () => {
  let t: TestApp
  let api: ReturnType<typeof client>

  beforeAll(async () => {
    t = await createTestApp()
    api = client(t.app)
  })

  afterAll(() => t.close())
  beforeEach(() => resetDb(t.prisma))

  it('unknown routes use the error envelope', async () => {
    const response = await api.get('/v1/nope')
    const json = body(response)

    expect(response.statusCode).toBe(404)
    expect(json).toMatchObject({ success: false, data: null, error: { code: 'NOT_FOUND' } })
    expect(json.error?.requestId).toBeTruthy()
  })

  it('every response carries no-store and security headers', async () => {
    const response = await api.get('/health')

    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['x-powered-by']).toBeUndefined()
  })

  it('echoes a sane request id and replaces a hostile one', async () => {
    const good = await api.get('/health', { headers: { 'x-request-id': 'trace-12345678' } })
    const bad = await api.get('/health', { headers: { 'x-request-id': 'x\ninjected: 1' } })

    expect(good.headers['x-request-id']).toBe('trace-12345678')
    expect(bad.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('error bodies include the same request id as the header', async () => {
    const response = await api.get('/v1/auth/me')

    expect(body(response).error?.requestId).toBe(response.headers['x-request-id'])
  })

  it('health and readiness work', async () => {
    expect((await api.get('/health')).statusCode).toBe(200)
    expect(body(await api.get('/health/ready')).data?.status).toBe('ready')
  })

  it('an unexpected failure returns a generic 500 and leaks nothing', async () => {
    await createUser(t, { email: 'ada@filter-go.test' })
    const spy = vi.spyOn(t.prisma.user, 'findUnique').mockRejectedValueOnce(new Error('connection to db-internal.corp:5432 refused, password=hunter2'))

    const response = await api.post('/v1/auth/login', { body: { email: 'ada@filter-go.test', password: STRONG_PASSWORD } })

    spy.mockRestore()

    expect(response.statusCode).toBe(500)
    expect(body(response).error?.code).toBe('INTERNAL_ERROR')
    expect(response.body).not.toMatch(/hunter2|db-internal|stack|prisma/i)
  })

  it('an audit-log outage never breaks login', async () => {
    await createUser(t, { email: 'ada@filter-go.test' })
    const spy = vi.spyOn(t.prisma.auditEvent, 'create').mockRejectedValue(new Error('audit down'))

    const response = await api.post('/v1/auth/login', { body: { email: 'ada@filter-go.test', password: STRONG_PASSWORD } })

    spy.mockRestore()

    expect(response.statusCode).toBe(200)
  })

  it('no endpoint ever returns password hashes or token hashes', async () => {
    const user = await createUser(t, { email: 'ada@filter-go.test', role: 'ADMIN' })
    const login = await api.post('/v1/auth/login', { body: { email: user.email, password: STRONG_PASSWORD } })
    const token = body(login).data?.session.token as string
    const responses = [
      login,
      await api.get('/v1/auth/me', { token }),
      await api.get('/v1/auth/sessions', { token }),
      await api.get('/v1/admin/users', { token }),
      await api.get(`/v1/admin/users/${user.id}`, { token })
    ]

    for (const response of responses) {
      expect(response.body).not.toMatch(/passwordHash|tokenHash|\$argon2/)
    }
  })

  it('purges old rows but keeps recent ones and audit events inside the retention window', async () => {
    const user = await createUser(t)
    const old = new Date(Date.now() - 10 * 24 * 3600 * 1000)

    await t.prisma.session.create({
      data: { userId: user.id, tokenHash: 'old', idleExpiresAt: old, absoluteExpiresAt: old, lastUsedAt: old }
    })
    await t.prisma.session.create({
      data: { userId: user.id, tokenHash: 'new', idleExpiresAt: new Date(Date.now() + 1e6), absoluteExpiresAt: new Date(Date.now() + 1e7) }
    })
    await t.prisma.loginAttempt.create({ data: { emailKey: 'k', ip: '1.1.1.1', createdAt: old } })
    await t.prisma.auditEvent.create({ data: { type: 'LOGIN_SUCCESS', createdAt: old } })
    await t.prisma.auditEvent.create({ data: { type: 'LOGIN_SUCCESS', createdAt: new Date(Date.now() - 400 * 24 * 3600 * 1000) } })

    const result = await purgeExpired(t.ctx)

    expect(result).toEqual({ sessions: 1, tokens: 0, attempts: 1, audit: 1 })
    expect(await t.prisma.session.count()).toBe(1)
    // 10-day-old audit event is inside the 365-day retention window, the 400-day-old one is not
    expect(await t.prisma.auditEvent.count()).toBe(1)
  })
})

describe('CORS', () => {
  it('sends no CORS headers by default (browsers on other origins are blocked)', async () => {
    const t = await createTestApp()
    const response = await client(t.app).get('/health', { headers: { origin: 'https://evil.example' } })

    expect(response.headers['access-control-allow-origin']).toBeUndefined()

    await t.close()
  })

  it('allows only the configured origins', async () => {
    const t = await createTestApp({ CORS_ORIGINS: 'https://portal.example.com' })
    const api = client(t.app)
    const allowed = await api.get('/health', { headers: { origin: 'https://portal.example.com' } })
    const denied = await api.get('/health', { headers: { origin: 'https://evil.example' } })

    expect(allowed.headers['access-control-allow-origin']).toBe('https://portal.example.com')
    expect(denied.headers['access-control-allow-origin']).toBeUndefined()
    expect(allowed.headers['access-control-allow-credentials']).toBeUndefined()

    await t.close()
  })
})

describe('rate limiting', () => {
  it('limits the login route per IP and answers in the standard envelope', async () => {
    const t = await createTestApp({ RATE_LIMIT_ENABLED: 'true' })
    const api = client(t.app)

    await resetDb(t.prisma)

    let last = await api.post('/v1/auth/login', { body: { email: 'a@b.com', password: 'x' }, ip: '10.9.9.9' })

    for (let i = 0; i < 40; i++) {
      last = await api.post('/v1/auth/login', { body: { email: 'a@b.com', password: 'x' }, ip: '10.9.9.9' })
    }

    expect(last.statusCode).toBe(429)
    expect(body(last).error?.code).toBe('RATE_LIMITED')
    expect(Number(last.headers['retry-after'])).toBeGreaterThan(0)

    // a different client is unaffected
    expect((await api.post('/v1/auth/login', { body: { email: 'a@b.com', password: 'x' }, ip: '10.9.9.10' })).statusCode).toBe(401)

    await t.close()
  })

  it('limits forgot-password harder', async () => {
    const t = await createTestApp({ RATE_LIMIT_ENABLED: 'true' })
    const api = client(t.app)
    const statuses: number[] = []

    for (let i = 0; i < 7; i++) {
      statuses.push((await api.post('/v1/auth/forgot-password', { body: { email: 'a@b.com' }, ip: '10.8.8.8' })).statusCode)
    }

    expect(statuses.slice(0, 5).every(status => status === 200)).toBe(true)
    expect(statuses[6]).toBe(429)

    await t.close()
  })
})

describe('proxy / client IP handling', () => {
  it('ignores X-Forwarded-For unless the proxy is trusted (cannot dodge throttling)', async () => {
    const t = await createTestApp({ LOGIN_MAX_FAILS_PER_IP: '3', LOGIN_MAX_FAILS_PER_EMAIL_IP: '100', LOGIN_MAX_FAILS_PER_EMAIL: '100' })
    const api = client(t.app)

    await resetDb(t.prisma)

    for (let i = 0; i < 3; i++) {
      await api.post('/v1/auth/login', { body: { email: `u${i}@x.com`, password: 'x' }, ip: '10.7.7.7', headers: { 'x-forwarded-for': `1.2.3.${i}` } })
    }

    const blocked = await api.post('/v1/auth/login', { body: { email: 'u9@x.com', password: 'x' }, ip: '10.7.7.7', headers: { 'x-forwarded-for': '9.9.9.9' } })

    expect(blocked.statusCode).toBe(429)

    await t.close()
  })

  it('uses X-Forwarded-For when the proxy hop is trusted', async () => {
    const t = await createTestApp({ TRUST_PROXY: '1', LOGIN_MAX_FAILS_PER_IP: '2', LOGIN_MAX_FAILS_PER_EMAIL_IP: '100', LOGIN_MAX_FAILS_PER_EMAIL: '100' })
    const api = client(t.app)

    await resetDb(t.prisma)

    for (let i = 0; i < 2; i++) {
      await api.post('/v1/auth/login', { body: { email: `u${i}@x.com`, password: 'x' }, ip: '10.6.6.6', headers: { 'x-forwarded-for': '5.5.5.5' } })
    }

    const sameUser = await api.post('/v1/auth/login', { body: { email: 'u9@x.com', password: 'x' }, ip: '10.6.6.6', headers: { 'x-forwarded-for': '5.5.5.5' } })
    const otherUser = await api.post('/v1/auth/login', { body: { email: 'u9@x.com', password: 'x' }, ip: '10.6.6.6', headers: { 'x-forwarded-for': '6.6.6.6' } })

    expect(sameUser.statusCode).toBe(429)
    expect(otherUser.statusCode).toBe(401)

    await t.close()
  })
})
