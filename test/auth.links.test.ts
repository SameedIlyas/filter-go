import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  OTHER_STRONG_PASSWORD,
  STRONG_PASSWORD,
  body,
  client,
  createTestApp,
  createUser,
  loginAs,
  resetDb,
  tokenFromMail
} from './helpers.js'
import type { TestApp } from './helpers.js'

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

const forgot = async (email: string) => {
  const response = await api.post('/v1/auth/forgot-password', { body: { email } })

  await t.ctx.background.flush()

  return response
}

const invite = async (adminToken: string, email: string, name = 'New Person') =>
  api.post('/v1/admin/users/invite', { token: adminToken, body: { email, name, role: 'FIELD_USER' } })

describe('forgot password', () => {
  it('emails a reset link to a real active user', async () => {
    await createUser(t, { email: 'ada@filter-go.test', name: 'Ada' })

    const response = await forgot('ada@filter-go.test')

    expect(response.statusCode).toBe(200)
    expect(t.mailer.sent).toHaveLength(1)
    expect(t.mailer.sent[0]?.to).toBe('ada@filter-go.test')
    expect(t.mailer.sent[0]?.text).toContain('http://localhost:3000/reset-password?token=fpl_')
  })

  it('answers identically whether or not the email exists', async () => {
    await createUser(t, { email: 'ada@filter-go.test' })

    const real = await forgot('ada@filter-go.test')
    const fake = await forgot('ghost@filter-go.test')

    expect(fake.statusCode).toBe(real.statusCode)
    expect(fake.body.replace(/"requestId":"[^"]+"/, '')).toBe(real.body.replace(/"requestId":"[^"]+"/, ''))
    expect(t.mailer.sent).toHaveLength(1)
  })

  it.each([
    ['disabled', { status: 'DISABLED' as const }],
    ['invited (no password)', { password: null }]
  ])('sends nothing to a %s account', async (_label, extra) => {
    await createUser(t, { email: 'x@filter-go.test', ...extra })

    expect((await forgot('x@filter-go.test')).statusCode).toBe(200)
    expect(t.mailer.sent).toHaveLength(0)
  })

  it('silently caps reset emails per hour so it cannot flood an inbox', async () => {
    await createUser(t, { email: 'ada@filter-go.test' })

    for (let i = 0; i < 6; i++) await forgot('ada@filter-go.test')

    expect(t.mailer.sent).toHaveLength(3)
  })

  it('does not fail the request if the mail server is down', async () => {
    await createUser(t, { email: 'ada@filter-go.test' })
    vi.spyOn(t.ctx.mailer, 'send').mockRejectedValueOnce(new Error('smtp down'))

    expect((await forgot('ada@filter-go.test')).statusCode).toBe(200)
  })

  it('validates the email shape', async () => {
    expect((await api.post('/v1/auth/forgot-password', { body: { email: 'nope' } })).statusCode).toBe(400)
  })
})

describe('reset password', () => {
  it('sets the new password, signs out every device, and works once', async () => {
    const user = await createUser(t, { email: 'ada@filter-go.test' })
    const session = await loginAs(t, user.email)

    await forgot(user.email)
    const token = tokenFromMail(t.mailer, user.email)

    const verify = await api.post('/v1/auth/verify-token', { body: { token, purpose: 'password_reset' } })

    expect(body(verify).data).toMatchObject({ email: 'ada@filter-go.test', purpose: 'PASSWORD_RESET' })

    const reset = await api.post('/v1/auth/reset-password', { body: { token, password: OTHER_STRONG_PASSWORD } })

    expect(reset.statusCode).toBe(200)
    expect((await api.get('/v1/auth/me', { token: session })).statusCode).toBe(401)
    expect((await api.post('/v1/auth/login', { body: { email: user.email, password: STRONG_PASSWORD } })).statusCode).toBe(401)
    expect((await api.post('/v1/auth/login', { body: { email: user.email, password: OTHER_STRONG_PASSWORD } })).statusCode).toBe(200)

    const again = await api.post('/v1/auth/reset-password', { body: { token, password: STRONG_PASSWORD } })

    expect(again.statusCode).toBe(400)
    expect(body(again).error?.code).toBe('INVALID_TOKEN')
  })

  it('lets a weak password be retried with the same link', async () => {
    const user = await createUser(t, { email: 'ada@filter-go.test' })

    await forgot(user.email)
    const token = tokenFromMail(t.mailer, user.email)

    const weak = await api.post('/v1/auth/reset-password', { body: { token, password: 'password123' } })

    expect(weak.statusCode).toBe(400)
    expect(body(weak).error?.code).toBe('VALIDATION_ERROR')
    expect((await api.post('/v1/auth/reset-password', { body: { token, password: OTHER_STRONG_PASSWORD } })).statusCode).toBe(200)
  })

  it('rejects an expired link', async () => {
    const user = await createUser(t, { email: 'ada@filter-go.test' })

    await forgot(user.email)
    const token = tokenFromMail(t.mailer, user.email)

    await t.prisma.oneTimeToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })

    const response = await api.post('/v1/auth/reset-password', { body: { token, password: OTHER_STRONG_PASSWORD } })

    expect(body(response).error?.code).toBe('INVALID_TOKEN')
  })

  it('a newer link voids the older one', async () => {
    const user = await createUser(t, { email: 'ada@filter-go.test' })

    await forgot(user.email)
    const first = tokenFromMail(t.mailer, user.email)

    await forgot(user.email)
    const second = tokenFromMail(t.mailer, user.email)

    expect(first).not.toBe(second)
    expect((await api.post('/v1/auth/reset-password', { body: { token: first, password: OTHER_STRONG_PASSWORD } })).statusCode).toBe(400)
    expect((await api.post('/v1/auth/reset-password', { body: { token: second, password: OTHER_STRONG_PASSWORD } })).statusCode).toBe(200)
  })

  it('rejects guessed and tampered tokens with the same generic error', async () => {
    const user = await createUser(t, { email: 'ada@filter-go.test' })

    await forgot(user.email)
    const token = tokenFromMail(t.mailer, user.email)
    const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`

    for (const bad of [tampered, `fpl_${'x'.repeat(43)}`, 'short']) {
      const response = await api.post('/v1/auth/reset-password', { body: { token: bad, password: OTHER_STRONG_PASSWORD } })

      expect([400]).toContain(response.statusCode)
      expect(['INVALID_TOKEN', 'VALIDATION_ERROR']).toContain(body(response).error?.code)
    }
  })

  it('an account disabled after the link was sent cannot use it', async () => {
    const user = await createUser(t, { email: 'ada@filter-go.test' })

    await forgot(user.email)
    const token = tokenFromMail(t.mailer, user.email)

    await t.prisma.user.update({ where: { id: user.id }, data: { status: 'DISABLED' } })

    expect((await api.post('/v1/auth/reset-password', { body: { token, password: OTHER_STRONG_PASSWORD } })).statusCode).toBe(400)
  })

  it('an invite link cannot be used to reset a password, or the reverse', async () => {
    const admin = await createUser(t, { role: 'ADMIN' })
    const adminToken = await loginAs(t, admin.email)

    await invite(adminToken, 'new@filter-go.test')
    const inviteToken = tokenFromMail(t.mailer, 'new@filter-go.test')

    const response = await api.post('/v1/auth/reset-password', { body: { token: inviteToken, password: OTHER_STRONG_PASSWORD } })

    expect(body(response).error?.code).toBe('INVALID_TOKEN')

    await forgot(admin.email)
    const resetToken = tokenFromMail(t.mailer, admin.email)

    expect((await api.post('/v1/auth/accept-invite', { body: { token: resetToken, password: OTHER_STRONG_PASSWORD } })).statusCode).toBe(400)
  })

  it('clears failed-login lockout once the owner proves control', async () => {
    const user = await createUser(t, { email: 'ada@filter-go.test' })

    for (let i = 0; i < 5; i++) await api.post('/v1/auth/login', { body: { email: user.email, password: 'wrong-password-1' } })

    await forgot(user.email)
    await api.post('/v1/auth/reset-password', { body: { token: tokenFromMail(t.mailer, user.email), password: OTHER_STRONG_PASSWORD } })

    expect((await api.post('/v1/auth/login', { body: { email: user.email, password: OTHER_STRONG_PASSWORD } })).statusCode).toBe(200)
  })
})

describe('invite flow', () => {
  it('invite -> email -> verify -> accept -> signed in', async () => {
    const admin = await createUser(t, { role: 'ADMIN' })
    const adminToken = await loginAs(t, admin.email)

    const invited = await invite(adminToken, 'new@filter-go.test', 'Nina')

    expect(invited.statusCode).toBe(201)
    expect(body(invited).data).toMatchObject({ emailSent: true, user: { email: 'new@filter-go.test', status: 'INVITED', role: 'FIELD_USER' } })
    expect(t.mailer.sent[0]?.text).toContain('http://localhost:3000/accept-invite?token=fpl_')

    const token = tokenFromMail(t.mailer, 'new@filter-go.test')
    const verify = await api.post('/v1/auth/verify-token', { body: { token, purpose: 'invite' } })

    expect(body(verify).data).toMatchObject({ email: 'new@filter-go.test', name: 'Nina', purpose: 'INVITE' })

    const accept = await api.post('/v1/auth/accept-invite', { body: { token, password: STRONG_PASSWORD } })
    const json = body(accept)

    expect(accept.statusCode).toBe(200)
    expect(json.data?.user).toMatchObject({ email: 'new@filter-go.test', status: 'ACTIVE' })
    expect((await api.get('/v1/auth/me', { token: json.data?.session.token })).statusCode).toBe(200)
    expect((await api.post('/v1/auth/login', { body: { email: 'new@filter-go.test', password: STRONG_PASSWORD } })).statusCode).toBe(200)
  })

  it('the invitee may correct their name', async () => {
    const admin = await createUser(t, { role: 'ADMIN' })

    await invite(await loginAs(t, admin.email), 'new@filter-go.test', 'Nna')

    const accept = await api.post('/v1/auth/accept-invite', {
      body: { token: tokenFromMail(t.mailer, 'new@filter-go.test'), password: STRONG_PASSWORD, name: 'Nina Real' }
    })

    expect(body(accept).data?.user.name).toBe('Nina Real')
  })

  it('a link works once', async () => {
    const admin = await createUser(t, { role: 'ADMIN' })

    await invite(await loginAs(t, admin.email), 'new@filter-go.test')
    const token = tokenFromMail(t.mailer, 'new@filter-go.test')

    expect((await api.post('/v1/auth/accept-invite', { body: { token, password: STRONG_PASSWORD } })).statusCode).toBe(200)

    const again = await api.post('/v1/auth/accept-invite', { body: { token, password: OTHER_STRONG_PASSWORD } })

    expect(again.statusCode).toBe(400)
    expect(body(again).error?.code).toBe('INVALID_TOKEN')
    // and the second attempt did not overwrite the password
    expect((await api.post('/v1/auth/login', { body: { email: 'new@filter-go.test', password: STRONG_PASSWORD } })).statusCode).toBe(200)
  })

  it('two simultaneous clicks: exactly one wins', async () => {
    const admin = await createUser(t, { role: 'ADMIN' })

    await invite(await loginAs(t, admin.email), 'new@filter-go.test')
    const token = tokenFromMail(t.mailer, 'new@filter-go.test')

    const results = await Promise.all([
      api.post('/v1/auth/accept-invite', { body: { token, password: STRONG_PASSWORD } }),
      api.post('/v1/auth/accept-invite', { body: { token, password: OTHER_STRONG_PASSWORD } })
    ])

    expect(results.map(result => result.statusCode).sort()).toEqual([200, 400])
    expect(await t.prisma.session.count({ where: { user: { email: 'new@filter-go.test' } } })).toBe(1)
  })

  it('applies the password policy and lets the user retry', async () => {
    const admin = await createUser(t, { role: 'ADMIN' })

    await invite(await loginAs(t, admin.email), 'nina.example@filter-go.test')
    const token = tokenFromMail(t.mailer, 'nina.example@filter-go.test')

    for (const [password, code] of [
      ['short', 'too_short'],
      ['password123', 'too_common'],
      ['nina.example-is-cool-1', 'contains_email']
    ] as const) {
      const response = await api.post('/v1/auth/accept-invite', { body: { token, password } })

      expect(response.statusCode).toBe(400)
      expect(body(response).error?.details?.issues.map((issue: { code: string }) => issue.code)).toContain(code)
    }

    expect((await api.post('/v1/auth/accept-invite', { body: { token, password: STRONG_PASSWORD } })).statusCode).toBe(200)
  })

  it('an expired invite is refused, and a fresh invite fixes it', async () => {
    const admin = await createUser(t, { role: 'ADMIN' })
    const adminToken = await loginAs(t, admin.email)

    await invite(adminToken, 'new@filter-go.test')
    const old = tokenFromMail(t.mailer, 'new@filter-go.test')

    await t.prisma.oneTimeToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await api.post('/v1/auth/accept-invite', { body: { token: old, password: STRONG_PASSWORD } })).statusCode).toBe(400)

    await invite(adminToken, 'new@filter-go.test')

    expect((await api.post('/v1/auth/accept-invite', { body: { token: old, password: STRONG_PASSWORD } })).statusCode).toBe(400)
    expect(
      (await api.post('/v1/auth/accept-invite', { body: { token: tokenFromMail(t.mailer, 'new@filter-go.test'), password: STRONG_PASSWORD } }))
        .statusCode
    ).toBe(200)
  })

  it('a token is stored only as a hash', async () => {
    const admin = await createUser(t, { role: 'ADMIN' })

    await invite(await loginAs(t, admin.email), 'new@filter-go.test')
    const token = tokenFromMail(t.mailer, 'new@filter-go.test')
    const rows = await t.prisma.oneTimeToken.findMany()

    expect(JSON.stringify(rows)).not.toContain(token)
  })

  it('verify-token gives the same error for every kind of bad token', async () => {
    const responses = await Promise.all(
      [`fpl_${'z'.repeat(43)}`, `fps_${'z'.repeat(43)}`].map(token => api.post('/v1/auth/verify-token', { body: { token, purpose: 'invite' } }))
    )

    expect(responses.map(response => body(response).error?.code)).toEqual(['INVALID_TOKEN', 'INVALID_TOKEN'])
  })
})
