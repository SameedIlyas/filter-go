import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { sha256 } from '../src/lib/crypto.js'
import { STRONG_PASSWORD, body, client, createTestApp, createUser, resetDb } from './helpers.js'
import type { TestApp } from './helpers.js'

let t: TestApp
let api: ReturnType<typeof client>

beforeAll(async () => {
  t = await createTestApp({ LOGIN_MAX_FAILS_PER_EMAIL_IP: '3', LOGIN_MAX_FAILS_PER_EMAIL: '6', LOGIN_MAX_FAILS_PER_IP: '8' })
  api = client(t.app)
})

afterAll(() => t.close())
beforeEach(() => resetDb(t.prisma))

const login = (email: string, password: string, extra: Record<string, unknown> = {}, ip = '10.0.0.1') =>
  api.post('/v1/auth/login', { body: { email, password, ...extra }, ip })

describe('POST /v1/auth/login', () => {
  it('signs in with valid credentials', async () => {
    const user = await createUser(t, { email: 'ada@filter-go.test', name: 'Ada' })
    const response = await login('ada@filter-go.test', STRONG_PASSWORD)
    const json = body(response)

    expect(response.statusCode).toBe(200)
    expect(json.success).toBe(true)
    expect(json.error).toBeNull()
    expect(json.data?.user).toMatchObject({ id: user.id, email: 'ada@filter-go.test', name: 'Ada', role: 'FIELD_USER', status: 'ACTIVE' })
    expect(json.data?.session.token).toMatch(/^fps_[A-Za-z0-9_-]{43}$/)
    expect(new Date(json.data?.session.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('never exposes the password hash or any secret', async () => {
    await createUser(t, { email: 'ada@filter-go.test' })
    const response = await login('ada@filter-go.test', STRONG_PASSWORD)

    expect(response.body).not.toMatch(/passwordHash|argon2|tokenHash/)
  })

  it('normalises email case and whitespace', async () => {
    await createUser(t, { email: 'ada@filter-go.test' })

    expect((await login('  ADA@Filter-Go.TEST ', STRONG_PASSWORD)).statusCode).toBe(200)
  })

  it('stores only a hash of the session token', async () => {
    await createUser(t, { email: 'ada@filter-go.test' })
    const token = body(await login('ada@filter-go.test', STRONG_PASSWORD)).data?.session.token as string
    const stored = await t.prisma.session.findFirstOrThrow()

    expect(stored.tokenHash).toBe(sha256(token))
    expect(JSON.stringify(stored)).not.toContain(token)
  })

  it('records last login time', async () => {
    const user = await createUser(t, { email: 'ada@filter-go.test' })

    await login('ada@filter-go.test', STRONG_PASSWORD)

    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).lastLoginAt).not.toBeNull()
  })

  it('"remember me" gives a longer session', async () => {
    await createUser(t, { email: 'ada@filter-go.test' })
    const normal = body(await login('ada@filter-go.test', STRONG_PASSWORD)).data?.session
    const remembered = body(await login('ada@filter-go.test', STRONG_PASSWORD, { rememberMe: true })).data?.session

    expect(new Date(remembered.expiresAt).getTime()).toBeGreaterThan(new Date(normal.expiresAt).getTime() + 24 * 3600 * 1000)
    expect(remembered.remember).toBe(true)
    expect(normal.remember).toBe(false)
  })

  it('gives the same error for a wrong password and an unknown email', async () => {
    await createUser(t, { email: 'ada@filter-go.test' })
    const wrong = await login('ada@filter-go.test', 'not-the-password')
    const unknown = await login('nobody@filter-go.test', 'not-the-password')

    expect(wrong.statusCode).toBe(401)
    expect(unknown.statusCode).toBe(401)
    expect(body(wrong).error?.code).toBe('INVALID_CREDENTIALS')
    expect(body(unknown).error?.code).toBe('INVALID_CREDENTIALS')
    expect(body(wrong).error?.message).toBe(body(unknown).error?.message)
  })

  it('refuses a user who was invited but has no password yet', async () => {
    await createUser(t, { email: 'new@filter-go.test', password: null })

    const response = await login('new@filter-go.test', STRONG_PASSWORD)

    expect(response.statusCode).toBe(401)
    expect(body(response).error?.code).toBe('INVALID_CREDENTIALS')
  })

  it('tells a disabled user so only after the correct password', async () => {
    await createUser(t, { email: 'off@filter-go.test', status: 'DISABLED' })

    const right = await login('off@filter-go.test', STRONG_PASSWORD)
    const wrong = await login('off@filter-go.test', 'wrong-password-here')

    expect(right.statusCode).toBe(403)
    expect(body(right).error?.code).toBe('ACCOUNT_DISABLED')
    expect(wrong.statusCode).toBe(401)
    expect(body(wrong).error?.code).toBe('INVALID_CREDENTIALS')
  })

  describe('validation', () => {
    it('lists every invalid field', async () => {
      const response = await api.post('/v1/auth/login', { body: { email: 'not-an-email' } })
      const json = body(response)

      expect(response.statusCode).toBe(400)
      expect(json.error?.code).toBe('VALIDATION_ERROR')
      expect(json.error?.details?.issues.map((issue: { field: string }) => issue.field).sort()).toEqual(['email', 'password'])
    })

    it('rejects unknown fields so typos are caught', async () => {
      const response = await login('a@b.com', 'x', { remember_me: true })

      expect(response.statusCode).toBe(400)
      expect(body(response).error?.details?.issues[0]).toMatchObject({ field: 'remember_me', code: 'unrecognized_key' })
    })

    it('rejects wrong types', async () => {
      const response = await login('a@b.com', 'x', { rememberMe: 'yes' })

      expect(response.statusCode).toBe(400)
    })

    it('treats an empty body as missing fields, not a crash', async () => {
      const response = await api.post('/v1/auth/login', { headers: { 'content-type': 'application/json' } })

      expect(response.statusCode).toBe(400)
      expect(body(response).error?.code).toBe('VALIDATION_ERROR')
    })

    it('returns INVALID_JSON for malformed JSON', async () => {
      const response = await t.app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        headers: { 'content-type': 'application/json' },
        payload: '{"email": '
      })

      expect(response.statusCode).toBe(400)
      expect(body(response).error?.code).toBe('INVALID_JSON')
    })

    it('rejects non-JSON content types', async () => {
      const response = await t.app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'email=a@b.com&password=x'
      })

      expect(response.statusCode).toBe(415)
      expect(body(response).error?.code).toBe('UNSUPPORTED_MEDIA_TYPE')
    })

    it('rejects oversized bodies', async () => {
      const response = await api.post('/v1/auth/login', { body: { email: 'a@b.com', password: 'x'.repeat(20_000) } })

      expect(response.statusCode).toBe(413)
      expect(body(response).error?.code).toBe('PAYLOAD_TOO_LARGE')
    })

    it('rejects passwords over 128 characters without hashing them', async () => {
      const response = await login('a@b.com', 'x'.repeat(129))

      expect(response.statusCode).toBe(400)
    })

    it('is not fooled by prototype-pollution style keys', async () => {
      const response = await t.app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        headers: { 'content-type': 'application/json' },
        payload: '{"email":"a@b.com","password":"x","__proto__":{"role":"ADMIN"}}'
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('brute-force protection', () => {
    it('blocks after too many failures from one client, even with the right password', async () => {
      await createUser(t, { email: 'ada@filter-go.test' })

      for (let i = 0; i < 3; i++) {
        expect((await login('ada@filter-go.test', 'wrong-password-1')).statusCode).toBe(401)
      }

      const blocked = await login('ada@filter-go.test', STRONG_PASSWORD)
      const json = body(blocked)

      expect(blocked.statusCode).toBe(429)
      expect(json.error?.code).toBe('TOO_MANY_ATTEMPTS')
      expect(json.error?.details?.retryAfterSeconds).toBeGreaterThan(0)
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0)
    })

    it('throttles unknown emails exactly like real ones (no account enumeration)', async () => {
      for (let i = 0; i < 3; i++) await login('ghost@filter-go.test', 'wrong-password-1')

      const blocked = await login('ghost@filter-go.test', 'wrong-password-1')

      expect(blocked.statusCode).toBe(429)
      expect(body(blocked).error?.code).toBe('TOO_MANY_ATTEMPTS')
    })

    it('does not let one client lock a different client out of the same account (until the account-wide limit)', async () => {
      await createUser(t, { email: 'ada@filter-go.test' })

      for (let i = 0; i < 3; i++) await login('ada@filter-go.test', 'wrong-password-1', {}, '10.0.0.1')

      expect((await login('ada@filter-go.test', STRONG_PASSWORD, {}, '10.0.0.2')).statusCode).toBe(200)
    })

    it('blocks a distributed attack on one account across IPs', async () => {
      await createUser(t, { email: 'ada@filter-go.test' })

      for (let i = 1; i <= 6; i++) await login('ada@filter-go.test', 'wrong-password-1', {}, `10.0.1.${i}`)

      expect((await login('ada@filter-go.test', STRONG_PASSWORD, {}, '10.0.1.99')).statusCode).toBe(429)
    })

    it('blocks password spraying from one IP across many accounts', async () => {
      for (let i = 0; i < 8; i++) await login(`victim${i}@filter-go.test`, 'Spring2024-guess', {}, '10.0.2.1')

      const blocked = await login('victim99@filter-go.test', 'Spring2024-guess', {}, '10.0.2.1')

      expect(blocked.statusCode).toBe(429)
    })

    it('a successful login clears that client\'s failure count', async () => {
      await createUser(t, { email: 'ada@filter-go.test' })

      await login('ada@filter-go.test', 'wrong-password-1')
      await login('ada@filter-go.test', 'wrong-password-1')
      expect((await login('ada@filter-go.test', STRONG_PASSWORD)).statusCode).toBe(200)

      await login('ada@filter-go.test', 'wrong-password-1')
      await login('ada@filter-go.test', 'wrong-password-1')
      expect((await login('ada@filter-go.test', STRONG_PASSWORD)).statusCode).toBe(200)
    })

    it('lets the client back in once the window has passed', async () => {
      await createUser(t, { email: 'ada@filter-go.test' })

      for (let i = 0; i < 3; i++) await login('ada@filter-go.test', 'wrong-password-1')

      await t.prisma.loginAttempt.updateMany({ data: { createdAt: new Date(Date.now() - 16 * 60 * 1000) } })

      expect((await login('ada@filter-go.test', STRONG_PASSWORD)).statusCode).toBe(200)
    })

    it('does not extend the lockout while blocked', async () => {
      await createUser(t, { email: 'ada@filter-go.test' })

      for (let i = 0; i < 3; i++) await login('ada@filter-go.test', 'wrong-password-1')

      const before = await t.prisma.loginAttempt.count()

      await login('ada@filter-go.test', 'wrong-password-1')
      await login('ada@filter-go.test', 'wrong-password-1')

      expect(await t.prisma.loginAttempt.count()).toBe(before)
    })
  })

  describe('audit trail', () => {
    it('records success and failure without secrets', async () => {
      await createUser(t, { email: 'ada@filter-go.test' })

      await login('ada@filter-go.test', 'wrong-password-1')
      await login('ada@filter-go.test', STRONG_PASSWORD)

      const events = await t.prisma.auditEvent.findMany({ orderBy: { createdAt: 'asc' } })

      expect(events.map(event => event.type)).toEqual(['LOGIN_FAILED', 'LOGIN_SUCCESS'])
      expect(JSON.stringify(events)).not.toContain(STRONG_PASSWORD)
      expect(events[0]?.ip).toBe('10.0.0.1')
    })
  })
})
