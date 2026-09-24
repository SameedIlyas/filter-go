import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { issueToken } from '../src/modules/auth/one-time-token.js'
import { createMailer } from '../src/modules/mail/mailer.js'
import {
  OTHER_STRONG_PASSWORD,
  STRONG_PASSWORD,
  body,
  client,
  createTestApp,
  createUser,
  loginAs,
  resetDb,
  testConfig,
  tokenFromMail
} from './helpers.js'
import type { TestApp } from './helpers.js'

const SERVICE_KEY = 'service-key-'.padEnd(48, 'x')

describe('service key (only the Next.js server may call the API)', () => {
  let t: TestApp

  beforeAll(async () => {
    t = await createTestApp({ SERVICE_API_KEY: SERVICE_KEY })
  })

  afterAll(() => t.close())

  it('refuses requests without the key, with a distinct 403 (never 401, which means "signed out")', async () => {
    const response = await client(t.app).post('/v1/auth/login', { body: { email: 'a@b.com', password: 'x' } })

    expect(response.statusCode).toBe(403)
    expect(body(response).error?.code).toBe('INVALID_SERVICE_KEY')
  })

  it.each(['wrong', SERVICE_KEY.slice(0, -1), `${SERVICE_KEY}x`, ''])('refuses the key %j', async key => {
    const response = await client(t.app).get('/v1/auth/me', { headers: { 'x-service-key': key } })

    expect(response.statusCode).toBe(403)
  })

  it('accepts the right key', async () => {
    const response = await client(t.app).post('/v1/auth/login', {
      body: { email: 'a@b.com', password: 'x' },
      headers: { 'x-service-key': SERVICE_KEY }
    })

    expect(response.statusCode).toBe(401)
    expect(body(response).error?.code).toBe('INVALID_CREDENTIALS')
  })

  it('leaves health checks open for load balancers', async () => {
    expect((await client(t.app).get('/health')).statusCode).toBe(200)
    expect((await client(t.app).get('/health/ready')).statusCode).toBe(200)
  })

  it('is checked before authentication', async () => {
    const response = await client(t.app).get('/v1/admin/users')

    expect(body(response).error?.code).toBe('INVALID_SERVICE_KEY')
  })
})

describe('concurrency and races', () => {
  let t: TestApp
  let api: ReturnType<typeof client>

  beforeAll(async () => {
    t = await createTestApp({ LOGIN_MAX_FAILS_PER_EMAIL_IP: '3', LOGIN_MAX_FAILS_PER_EMAIL: '50', LOGIN_MAX_FAILS_PER_IP: '50' })
    api = client(t.app)
  })

  afterAll(() => t.close())
  beforeEach(async () => {
    await resetDb(t.prisma)
    t.mailer.clear()
  })

  it('a burst of parallel guesses cannot exceed the attempt limit', async () => {
    await createUser(t, { email: 'ada@filter-go.test' })

    const responses = await Promise.all(
      Array.from({ length: 12 }, () => api.post('/v1/auth/login', { body: { email: 'ada@filter-go.test', password: 'wrong-guess-1' }, ip: '10.1.1.1' }))
    )
    const guessesThatReachedThePasswordCheck = responses.filter(response => response.statusCode === 401).length

    expect(guessesThatReachedThePasswordCheck).toBeLessThanOrEqual(3)
    expect(responses.every(response => [401, 429].includes(response.statusCode))).toBe(true)
  })

  it('a correct password on a disabled account is not counted as a guess', async () => {
    await createUser(t, { email: 'off@filter-go.test', status: 'DISABLED' })

    for (let i = 0; i < 6; i++) {
      const response = await api.post('/v1/auth/login', { body: { email: 'off@filter-go.test', password: STRONG_PASSWORD }, ip: '10.1.1.2' })

      expect(response.statusCode).toBe(403)
    }
  })

  it('parallel reset-password with one link: exactly one wins', async () => {
    const user = await createUser(t, { email: 'ada@filter-go.test' })

    await api.post('/v1/auth/forgot-password', { body: { email: user.email } })
    await t.ctx.background.flush()

    const token = tokenFromMail(t.mailer, user.email)
    const results = await Promise.all([
      api.post('/v1/auth/reset-password', { body: { token, password: OTHER_STRONG_PASSWORD } }),
      api.post('/v1/auth/reset-password', { body: { token, password: 'Yet-Another-Long-Passphrase-77' } })
    ])

    expect(results.map(result => result.statusCode).sort()).toEqual([200, 400])
  })

  it('parallel token issuing leaves exactly one live link', async () => {
    const user = await createUser(t)

    await Promise.all(Array.from({ length: 6 }, () => issueToken(t.ctx, user.id, 'PASSWORD_RESET', 600)))

    expect(await t.prisma.oneTimeToken.count({ where: { userId: user.id, usedAt: null } })).toBe(1)
  })

  it('changing the password voids reset links that were already emailed', async () => {
    const user = await createUser(t, { email: 'ada@filter-go.test' })

    await api.post('/v1/auth/forgot-password', { body: { email: user.email } })
    await t.ctx.background.flush()

    const resetToken = tokenFromMail(t.mailer, user.email)
    const session = await loginAs(t, user.email)

    await api.post('/v1/auth/change-password', { token: session, body: { currentPassword: STRONG_PASSWORD, newPassword: OTHER_STRONG_PASSWORD } })

    const response = await api.post('/v1/auth/reset-password', { body: { token: resetToken, password: 'Yet-Another-Long-Passphrase-77' } })

    expect(body(response).error?.code).toBe('INVALID_TOKEN')
  })
})

describe('session edge cases', () => {
  let t: TestApp
  let api: ReturnType<typeof client>

  beforeAll(async () => {
    t = await createTestApp({ SESSION_IDLE_SECONDS: '10', SESSION_ABSOLUTE_SECONDS: '100', SESSION_MAX_PER_USER: '2' })
    api = client(t.app)
  })

  afterAll(() => t.close())
  beforeEach(() => resetDb(t.prisma))

  it('a very short idle timeout still slides while the user is active', async () => {
    const user = await createUser(t)
    const token = await loginAs(t, user.email)
    const before = await t.prisma.session.findFirstOrThrow()

    // 6s since last use: more than half the 10s idle window, so this request must extend it
    await t.prisma.session.update({ where: { id: before.id }, data: { lastUsedAt: new Date(Date.now() - 6000) } })
    await api.get('/v1/auth/me', { token })

    const after = await t.prisma.session.findFirstOrThrow()

    expect(after.idleExpiresAt.getTime()).toBeGreaterThan(before.idleExpiresAt.getTime())
  })

  it('a disabled user\'s live session stops working even if nothing revoked it', async () => {
    const user = await createUser(t)
    const token = await loginAs(t, user.email)

    await t.prisma.user.update({ where: { id: user.id }, data: { status: 'DISABLED' } })

    expect((await api.get('/v1/auth/me', { token })).statusCode).toBe(401)
  })

  it('records why sessions were revoked', async () => {
    const user = await createUser(t)

    await loginAs(t, user.email)
    await loginAs(t, user.email)
    await loginAs(t, user.email)

    expect(await t.prisma.session.count({ where: { revokedReason: 'session_limit' } })).toBe(1)
  })

  it('revoking the current session by id signs you out and is audited; repeating it is a 404', async () => {
    const user = await createUser(t)
    const token = await loginAs(t, user.email)
    const current = await t.prisma.session.findFirstOrThrow({ where: { userId: user.id } })

    const first = await api.delete(`/v1/auth/sessions/${current.id}`, { token })

    expect(body(first).data?.wasCurrent).toBe(true)
    expect((await api.get('/v1/auth/me', { token })).statusCode).toBe(401)
    expect(await t.prisma.auditEvent.count({ where: { type: 'SESSION_REVOKED' } })).toBe(1)

    const again = await api.delete(`/v1/auth/sessions/${current.id}`, { token: await loginAs(t, user.email) })

    expect(again.statusCode).toBe(404)
  })
})

describe('audit trail', () => {
  let t: TestApp
  let api: ReturnType<typeof client>

  beforeAll(async () => {
    t = await createTestApp()
    api = client(t.app)
  })

  afterAll(() => t.close())
  beforeEach(async () => {
    await resetDb(t.prisma)
    t.mailer.clear()
  })

  const types = async () => (await t.prisma.auditEvent.findMany({ orderBy: { createdAt: 'asc' } })).map(event => event.type)

  it('covers account actions', async () => {
    const user = await createUser(t, { email: 'ada@filter-go.test' })
    const token = await loginAs(t, user.email)

    await api.patch('/v1/auth/me', { token, body: { name: 'Ada L' } })
    await api.post('/v1/auth/change-password', { token, body: { currentPassword: STRONG_PASSWORD, newPassword: OTHER_STRONG_PASSWORD } })
    await api.post('/v1/auth/logout-all', { token })
    await api.post('/v1/auth/forgot-password', { body: { email: user.email } })
    await t.ctx.background.flush()
    await api.post('/v1/auth/reset-password', { body: { token: tokenFromMail(t.mailer, user.email), password: 'Yet-Another-Long-Passphrase-77' } })

    expect(await types()).toEqual([
      'LOGIN_SUCCESS',
      'PROFILE_UPDATED',
      'PASSWORD_CHANGED',
      'LOGOUT_ALL',
      'PASSWORD_RESET_REQUESTED',
      'PASSWORD_RESET_COMPLETED'
    ])
  })

  it('covers admin actions and invite acceptance, naming the actor', async () => {
    const admin = await createUser(t, { role: 'ADMIN' })
    const adminToken = await loginAs(t, admin.email)
    const target = await createUser(t)

    await api.patch(`/v1/admin/users/${target.id}`, { token: adminToken, body: { name: 'Renamed' } })
    await api.patch(`/v1/admin/users/${target.id}`, { token: adminToken, body: { status: 'DISABLED' } })
    await api.patch(`/v1/admin/users/${target.id}`, { token: adminToken, body: { status: 'ACTIVE' } })
    await api.post(`/v1/admin/users/${target.id}/revoke-sessions`, { token: adminToken })
    await api.post('/v1/admin/users/invite', { token: adminToken, body: { email: 'new@filter-go.test', name: 'Nina' } })
    await api.post('/v1/auth/accept-invite', { body: { token: tokenFromMail(t.mailer, 'new@filter-go.test'), password: STRONG_PASSWORD } })

    const all = await types()

    for (const expected of ['USER_UPDATED', 'USER_DISABLED', 'USER_ENABLED', 'SESSIONS_REVOKED_BY_ADMIN', 'INVITE_SENT', 'INVITE_ACCEPTED']) {
      expect(all).toContain(expected)
    }

    expect((await t.prisma.auditEvent.findFirstOrThrow({ where: { type: 'USER_DISABLED' } })).actorId).toBe(admin.id)
  })

  it('records logout', async () => {
    const user = await createUser(t)
    const token = await loginAs(t, user.email)

    await api.post('/v1/auth/logout', { token })

    expect(await types()).toEqual(['LOGIN_SUCCESS', 'LOGOUT'])
  })
})

describe('infrastructure paths', () => {
  let t: TestApp
  let api: ReturnType<typeof client>

  beforeAll(async () => {
    t = await createTestApp()
    api = client(t.app)
  })

  afterAll(() => t.close())
  beforeEach(() => resetDb(t.prisma))

  it('readiness reports 503 SERVICE_UNAVAILABLE when the database is down', async () => {
    const spy = vi.spyOn(t.prisma, '$queryRaw').mockRejectedValueOnce(new Error('db down'))
    const response = await api.get('/health/ready')

    spy.mockRestore()

    expect(response.statusCode).toBe(503)
    expect(body(response).error?.code).toBe('SERVICE_UNAVAILABLE')
  })

  it('keeps the original status for framework-level 4xx errors', async () => {
    const response = await t.app.inject({ method: 'GET', url: '/v1/auth/%E0%A4%A' })

    expect(response.statusCode).toBe(400)
    expect(body(response).success).toBe(false)
  })

  it('admin list: an absurd page number is a 400, a page past the end is just empty', async () => {
    const admin = await createUser(t, { role: 'ADMIN' })
    const token = await loginAs(t, admin.email)

    expect((await api.get('/v1/admin/users', { token, query: { page: '99999999999' } })).statusCode).toBe(400)

    const past = body(await api.get('/v1/admin/users', { token, query: { page: '50' } }))

    expect(past.data?.users).toEqual([])
    expect(past.meta).toMatchObject({ page: 50, total: 1, totalPages: 1 })
  })

  it('mailer factory picks the configured driver', async () => {
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const message = { to: 'a@b.com', subject: 's', text: 'hello', html: '<p>hello</p>' }

    await createMailer(testConfig({ MAIL_DRIVER: 'console' }), log).send(message)
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('EMAIL to a@b.com'))

    expect(() => createMailer(testConfig({ MAIL_DRIVER: 'smtp', SMTP_HOST: 'smtp.example.com' }), log)).not.toThrow()
  })

  it('shutdown waits for background work', async () => {
    const extra = await createTestApp()
    let finished = false

    extra.ctx.background.run('slow', async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
      finished = true
    })

    await extra.close()

    expect(finished).toBe(true)
  })
})
