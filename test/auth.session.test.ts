import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  OTHER_STRONG_PASSWORD,
  STRONG_PASSWORD,
  body,
  client,
  createTestApp,
  createUser,
  loginAs,
  resetDb
} from './helpers.js'
import type { TestApp } from './helpers.js'

let t: TestApp
let api: ReturnType<typeof client>

beforeAll(async () => {
  t = await createTestApp({ SESSION_MAX_PER_USER: '3' })
  api = client(t.app)
})

afterAll(() => t.close())
beforeEach(() => resetDb(t.prisma))

describe('authentication guard', () => {
  it('rejects a missing token', async () => {
    const response = await api.get('/v1/auth/me')

    expect(response.statusCode).toBe(401)
    expect(body(response).error?.code).toBe('UNAUTHENTICATED')
  })

  it.each(['Bearer', 'Bearer ', 'Basic abc', 'Bearer not-a-real-token', 'Bearer a b', 'bearer'])(
    'rejects malformed header %j',
    async header => {
      const response = await api.get('/v1/auth/me', { headers: { authorization: header } })

      expect(response.statusCode).toBe(401)
    }
  )

  it('rejects a well-formed but unknown token', async () => {
    const response = await api.get('/v1/auth/me', { token: `fps_${'A'.repeat(43)}` })

    expect(response.statusCode).toBe(401)
    expect(body(response).error?.code).toBe('UNAUTHENTICATED')
  })

  it('does not accept the token from a cookie or query string', async () => {
    const user = await createUser(t)
    const token = await loginAs(t, user.email)

    expect((await api.get('/v1/auth/me', { headers: { cookie: `session=${token}` } })).statusCode).toBe(401)
    expect((await api.get('/v1/auth/me', { query: { token } })).statusCode).toBe(401)
  })

  it('returns the current user and session from /me', async () => {
    const user = await createUser(t, { name: 'Ada' })
    const token = await loginAs(t, user.email)
    const response = await api.get('/v1/auth/me', { token })
    const json = body(response)

    expect(response.statusCode).toBe(200)
    expect(json.data?.user).toMatchObject({ id: user.id, name: 'Ada' })
    expect(json.data?.session).toMatchObject({ current: true })
    expect(json.data?.session.token).toBeUndefined()
    expect(response.body).not.toMatch(/passwordHash|tokenHash/)
  })
})

describe('session lifetime', () => {
  it('expires after the idle timeout with SESSION_EXPIRED', async () => {
    const user = await createUser(t)
    const token = await loginAs(t, user.email)

    await t.prisma.session.updateMany({ data: { idleExpiresAt: new Date(Date.now() - 1000) } })

    const response = await api.get('/v1/auth/me', { token })

    expect(response.statusCode).toBe(401)
    expect(body(response).error?.code).toBe('SESSION_EXPIRED')
  })

  it('expires at the absolute limit even if recently used', async () => {
    const user = await createUser(t)
    const token = await loginAs(t, user.email)

    await t.prisma.session.updateMany({ data: { absoluteExpiresAt: new Date(Date.now() - 1000) } })

    expect(body(await api.get('/v1/auth/me', { token })).error?.code).toBe('SESSION_EXPIRED')
  })

  it('slides the idle window while active, but never past the absolute limit', async () => {
    const user = await createUser(t)
    const token = await loginAs(t, user.email)
    const absolute = new Date(Date.now() + 60 * 60 * 1000)

    await t.prisma.session.updateMany({
      data: { lastUsedAt: new Date(Date.now() - 5 * 60 * 1000), idleExpiresAt: new Date(Date.now() + 60 * 1000), absoluteExpiresAt: absolute }
    })

    expect((await api.get('/v1/auth/me', { token })).statusCode).toBe(200)

    const session = await t.prisma.session.findFirstOrThrow()

    // 8h idle would overshoot the 1h absolute limit, so it is capped
    expect(session.idleExpiresAt.getTime()).toBe(absolute.getTime())
  })

  it('caps concurrent sessions, revoking the oldest', async () => {
    const user = await createUser(t)
    const tokens: string[] = []

    for (let i = 0; i < 4; i++) tokens.push(await loginAs(t, user.email))

    expect((await api.get('/v1/auth/me', { token: tokens[0] })).statusCode).toBe(401)
    expect((await api.get('/v1/auth/me', { token: tokens[3] })).statusCode).toBe(200)
  })
})

describe('logout', () => {
  it('kills the session immediately', async () => {
    const user = await createUser(t)
    const token = await loginAs(t, user.email)

    expect((await api.post('/v1/auth/logout', { token })).statusCode).toBe(200)
    expect((await api.get('/v1/auth/me', { token })).statusCode).toBe(401)
  })

  it('works when the client sends an empty JSON body', async () => {
    const user = await createUser(t)
    const token = await loginAs(t, user.email)
    const response = await api.post('/v1/auth/logout', { token, headers: { 'content-type': 'application/json' } })

    expect(response.statusCode).toBe(200)
  })

  it('requires authentication', async () => {
    expect((await api.post('/v1/auth/logout')).statusCode).toBe(401)
  })

  it('logout-all signs out every device', async () => {
    const user = await createUser(t)
    const a = await loginAs(t, user.email)
    const b = await loginAs(t, user.email)
    const response = await api.post('/v1/auth/logout-all', { token: a })

    expect(body(response).data?.revoked).toBe(2)
    expect((await api.get('/v1/auth/me', { token: a })).statusCode).toBe(401)
    expect((await api.get('/v1/auth/me', { token: b })).statusCode).toBe(401)
  })

  it('does not affect other users', async () => {
    const one = await createUser(t)
    const two = await createUser(t)
    const tokenOne = await loginAs(t, one.email)
    const tokenTwo = await loginAs(t, two.email)

    await api.post('/v1/auth/logout-all', { token: tokenOne })

    expect((await api.get('/v1/auth/me', { token: tokenTwo })).statusCode).toBe(200)
  })
})

describe('sessions list', () => {
  it('lists active sessions and flags the current one', async () => {
    const user = await createUser(t)
    await loginAs(t, user.email)
    const token = await loginAs(t, user.email)
    const response = await api.get('/v1/auth/sessions', { token })
    const sessions = body(response).data?.sessions as Array<{ current: boolean }>

    expect(sessions).toHaveLength(2)
    expect(sessions.filter(session => session.current)).toHaveLength(1)
    expect(response.body).not.toMatch(/tokenHash|fps_/)
  })

  it('revokes another session by id', async () => {
    const user = await createUser(t)
    const other = await loginAs(t, user.email)
    const token = await loginAs(t, user.email)
    const list = body(await api.get('/v1/auth/sessions', { token })).data?.sessions as Array<{ id: string; current: boolean }>
    const target = list.find(session => !session.current)

    const response = await api.delete(`/v1/auth/sessions/${target?.id}`, { token })

    expect(response.statusCode).toBe(200)
    expect(body(response).data?.wasCurrent).toBe(false)
    expect((await api.get('/v1/auth/me', { token: other })).statusCode).toBe(401)
    expect((await api.get('/v1/auth/me', { token })).statusCode).toBe(200)
  })

  it('cannot revoke someone else\'s session (looks like it does not exist)', async () => {
    const victim = await createUser(t)
    const attacker = await createUser(t)
    const victimToken = await loginAs(t, victim.email)
    const attackerToken = await loginAs(t, attacker.email)
    const victimSession = await t.prisma.session.findFirstOrThrow({ where: { userId: victim.id } })

    const response = await api.delete(`/v1/auth/sessions/${victimSession.id}`, { token: attackerToken })

    expect(response.statusCode).toBe(404)
    expect(body(response).error?.code).toBe('SESSION_NOT_FOUND')
    expect((await api.get('/v1/auth/me', { token: victimToken })).statusCode).toBe(200)
  })

  it('rejects a non-uuid id', async () => {
    const user = await createUser(t)
    const token = await loginAs(t, user.email)

    expect((await api.delete('/v1/auth/sessions/not-a-uuid', { token })).statusCode).toBe(400)
  })
})

describe('change password', () => {
  it('changes it, keeps this session, signs out the others', async () => {
    const user = await createUser(t)
    const other = await loginAs(t, user.email)
    const token = await loginAs(t, user.email)

    const response = await api.post('/v1/auth/change-password', {
      token,
      body: { currentPassword: STRONG_PASSWORD, newPassword: OTHER_STRONG_PASSWORD }
    })

    expect(response.statusCode).toBe(200)
    expect(body(response).data?.otherSessionsRevoked).toBe(1)
    expect((await api.get('/v1/auth/me', { token })).statusCode).toBe(200)
    expect((await api.get('/v1/auth/me', { token: other })).statusCode).toBe(401)
    expect((await api.post('/v1/auth/login', { body: { email: user.email, password: STRONG_PASSWORD } })).statusCode).toBe(401)
    expect((await api.post('/v1/auth/login', { body: { email: user.email, password: OTHER_STRONG_PASSWORD } })).statusCode).toBe(200)
  })

  it('a wrong current password is 400, never 401 (401 would sign the user out)', async () => {
    const user = await createUser(t)
    const token = await loginAs(t, user.email)
    const response = await api.post('/v1/auth/change-password', {
      token,
      body: { currentPassword: 'definitely-wrong', newPassword: OTHER_STRONG_PASSWORD }
    })

    expect(response.statusCode).toBe(400)
    expect(body(response).error?.code).toBe('INVALID_CURRENT_PASSWORD')
    expect((await api.get('/v1/auth/me', { token })).statusCode).toBe(200)
  })

  it('applies the password policy to the new password', async () => {
    const user = await createUser(t)
    const token = await loginAs(t, user.email)
    const response = await api.post('/v1/auth/change-password', {
      token,
      body: { currentPassword: STRONG_PASSWORD, newPassword: 'password123' }
    })

    expect(response.statusCode).toBe(400)
    expect(body(response).error?.details?.issues[0]).toMatchObject({ field: 'newPassword', code: 'too_common' })
  })

  it('refuses to reuse the current password', async () => {
    const user = await createUser(t)
    const token = await loginAs(t, user.email)
    const response = await api.post('/v1/auth/change-password', {
      token,
      body: { currentPassword: STRONG_PASSWORD, newPassword: STRONG_PASSWORD }
    })

    expect(body(response).error?.details?.issues[0]?.code).toBe('same_as_current')
  })

  it('throttles guessing of the current password from a stolen session', async () => {
    const user = await createUser(t)
    const token = await loginAs(t, user.email)
    let last = 0

    for (let i = 0; i < 6; i++) {
      last = (
        await api.post('/v1/auth/change-password', {
          token,
          body: { currentPassword: `wrong-guess-${i}`, newPassword: OTHER_STRONG_PASSWORD }
        })
      ).statusCode
    }

    expect(last).toBe(429)
  })

  it('requires authentication', async () => {
    const response = await api.post('/v1/auth/change-password', {
      body: { currentPassword: STRONG_PASSWORD, newPassword: OTHER_STRONG_PASSWORD }
    })

    expect(response.statusCode).toBe(401)
  })
})

describe('profile', () => {
  it('updates name and image', async () => {
    const user = await createUser(t)
    const token = await loginAs(t, user.email)
    const response = await api.patch('/v1/auth/me', { token, body: { name: 'New Name', image: 'https://cdn.example.com/a.png' } })

    expect(response.statusCode).toBe(200)
    expect(body(response).data?.user).toMatchObject({ name: 'New Name', image: 'https://cdn.example.com/a.png' })
  })

  it('cannot change role, email or status through the profile endpoint', async () => {
    const user = await createUser(t)
    const token = await loginAs(t, user.email)

    for (const field of [{ role: 'ADMIN' }, { email: 'x@y.com' }, { status: 'ACTIVE' }, { passwordHash: 'x' }]) {
      expect((await api.patch('/v1/auth/me', { token, body: { name: 'A', ...field } })).statusCode).toBe(400)
    }

    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe('FIELD_USER')
  })

  it('rejects non-https and javascript: image URLs', async () => {
    const user = await createUser(t)
    const token = await loginAs(t, user.email)

    for (const image of ['http://x.com/a.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '/relative.png']) {
      expect((await api.patch('/v1/auth/me', { token, body: { image } })).statusCode).toBe(400)
    }
  })

  it('allows clearing the image with null', async () => {
    const user = await createUser(t)
    const token = await loginAs(t, user.email)

    await api.patch('/v1/auth/me', { token, body: { image: 'https://cdn.example.com/a.png' } })
    const response = await api.patch('/v1/auth/me', { token, body: { image: null } })

    expect(body(response).data?.user.image).toBeNull()
  })

  it('requires at least one field', async () => {
    const user = await createUser(t)
    const token = await loginAs(t, user.email)

    expect((await api.patch('/v1/auth/me', { token, body: {} })).statusCode).toBe(400)
  })
})
