import { describe, expect, expectTypeOf, it } from 'vitest'

import { loadConfig } from '../src/config/env.js'
import { createPasswordHasher } from '../src/lib/password.js'
import { checkPasswordPolicy } from '../src/lib/password-policy.js'
import { emailKey, generateToken, sha256 } from '../src/lib/crypto.js'
import { inviteEmail } from '../src/modules/mail/templates.js'
import type * as Doc from '../docs/api-types.js'
import type { ErrorCode } from '../src/lib/errors.js'
import type { Role, UserStatus } from '../src/generated/prisma/client.js'

const codes = (password: string, context = {}) => checkPasswordPolicy(password, context).map(issue => issue.code)

describe('password policy', () => {
  it('accepts a long, unique passphrase', () => {
    expect(codes('Correct-Horse-Battery-9')).toEqual([])
    expect(codes('purple giraffes dance quietly on tuesdays')).toEqual([])
  })

  it('rejects short passwords', () => {
    expect(codes('Sh0rt!')).toEqual(['too_short'])
  })

  it('rejects overly long passwords', () => {
    expect(codes('a1'.repeat(65))).toContain('too_long')
  })

  it.each(['password123', 'Password!2024', 'P@ssw0rd!!!!', '1234567890', 'qwertyuiop', 'Welcome-2024-x', 'FilterGo#12345'])(
    'rejects common password %s',
    password => {
      expect(codes(password)).toContain('too_common')
    }
  )

  it('rejects repetitive passwords', () => {
    expect(codes('aaaaaaaaaaaa')).toContain('too_simple')
    expect(codes('abababababab')).toContain('too_simple')
    expect(codes('xyzxyzxyzxyz')).toContain('too_simple')
  })

  it('rejects a password containing the email name', () => {
    expect(codes('sameed-is-great-99', { email: 'sameed@filter-go.com' })).toContain('contains_email')
  })

  it('rejects a password containing the user\'s name', () => {
    expect(codes('sameed-ahmad-rocks-99', { name: 'Sameed Ahmad' })).toContain('contains_name')
  })

  it('does not flag short name parts', () => {
    expect(codes('Correct-Horse-Battery-9', { name: 'Al Bo' })).toEqual([])
  })

  it('ignores very short email names to avoid false positives', () => {
    expect(codes('Correct-Horse-Battery-9', { email: 'al@filter-go.com' })).toEqual([])
  })

  it('reports every problem at once', () => {
    const issues = checkPasswordPolicy('short')

    expect(issues.every(issue => issue.field === 'password')).toBe(true)
  })
})

describe('password hasher', () => {
  const hasher = createPasswordHasher({ memoryKib: 8, timeCost: 1 })

  it('hashes with argon2id and verifies', async () => {
    const hash = await hasher.hash('Correct-Horse-Battery-9')

    expect(hash.startsWith('$argon2id$')).toBe(true)
    expect(await hasher.verify(hash, 'Correct-Horse-Battery-9')).toBe(true)
    expect(await hasher.verify(hash, 'wrong password here')).toBe(false)
  })

  it('salts: same password hashes differently', async () => {
    expect(await hasher.hash('Correct-Horse-Battery-9')).not.toBe(await hasher.hash('Correct-Horse-Battery-9'))
  })

  it('treats a malformed hash as a failed verification instead of throwing', async () => {
    expect(await hasher.verify('not-a-hash', 'anything')).toBe(false)
  })

  it('dummy verification always fails', async () => {
    expect(await hasher.verifyAgainstDummy('anything')).toBe(false)
  })
})

describe('crypto helpers', () => {
  it('generates unique, prefixed, url-safe tokens', () => {
    const a = generateToken('fps')
    const b = generateToken('fps')

    expect(a).not.toBe(b)
    expect(a).toMatch(/^fps_[A-Za-z0-9_-]{43}$/)
  })

  it('hashes deterministically and never returns the input', () => {
    expect(sha256('abc')).toBe(sha256('abc'))
    expect(sha256('abc')).not.toContain('abc')
    expect(emailKey('a@b.com')).not.toBe(sha256('a@b.com'))
  })
})

describe('config', () => {
  const base = { NODE_ENV: 'development', DATABASE_URL: 'postgresql://x:y@localhost:5432/db', FRONTEND_URL: 'http://localhost:3000' }

  it('applies safe defaults', () => {
    const config = loadConfig(base)

    expect(config.trustProxy).toBe(false)
    expect(config.corsOrigins).toEqual([])
    expect(config.session.idleSeconds).toBe(28800)
    expect(config.rateLimit.enabled).toBe(true)
  })

  it('treats blank values as unset', () => {
    expect(loadConfig({ ...base, PORT: '', CORS_ORIGINS: '' }).port).toBe(4000)
  })

  it('parses trust proxy forms and refuses "true"', () => {
    expect(loadConfig({ ...base, TRUST_PROXY: '1' }).trustProxy).toBe(1)
    expect(loadConfig({ ...base, TRUST_PROXY: '10.0.0.0/8, 172.16.0.0/12' }).trustProxy).toEqual(['10.0.0.0/8', '172.16.0.0/12'])
    expect(() => loadConfig({ ...base, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/)
  })

  it('rejects wildcard CORS', () => {
    expect(() => loadConfig({ ...base, CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS/)
  })

  it('reports every problem together', () => {
    expect(() => loadConfig({ FRONTEND_URL: 'nope', PORT: '99999' })).toThrow(/DATABASE_URL[\s\S]*FRONTEND_URL|FRONTEND_URL[\s\S]*DATABASE_URL/)
  })

  it('assumes production when NODE_ENV is missing, so the strict checks can never be skipped by accident', () => {
    const { NODE_ENV: _omitted, ...withoutEnv } = base

    expect(() => loadConfig(withoutEnv)).toThrow(/MAIL_DRIVER|SERVICE_API_KEY|https/)
  })

  it('enforces production hardening', () => {
    const production = {
      ...base,
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://portal.example.com',
      SERVICE_API_KEY: 'k'.repeat(40),
      TRUST_PROXY: '1'
    }

    expect(() => loadConfig({ ...production, MAIL_DRIVER: 'console' })).toThrow(/MAIL_DRIVER/)
    expect(() => loadConfig({ ...production, MAIL_DRIVER: 'smtp', SMTP_HOST: 'smtp.x', RATE_LIMIT_ENABLED: 'false' })).toThrow(/RATE_LIMIT/)
    expect(() => loadConfig({ ...production, MAIL_DRIVER: 'smtp', SMTP_HOST: 'smtp.x', FRONTEND_URL: 'http://x.com' })).toThrow(/https/)
    expect(() => loadConfig({ ...production, MAIL_DRIVER: 'smtp', SMTP_HOST: 'smtp.x', PASSWORD_HASH_MEMORY_KIB: '8' })).toThrow(/MEMORY/)
    expect(loadConfig({ ...production, MAIL_DRIVER: 'smtp', SMTP_HOST: 'smtp.x' }).isProduction).toBe(true)
  })

  it('requires the service key and a trusted proxy in production', () => {
    const production = { ...base, NODE_ENV: 'production', FRONTEND_URL: 'https://p.example.com', MAIL_DRIVER: 'smtp', SMTP_HOST: 'smtp.x' }

    expect(() => loadConfig({ ...production, TRUST_PROXY: '1' })).toThrow(/SERVICE_API_KEY/)
    expect(() => loadConfig({ ...production, SERVICE_API_KEY: 'k'.repeat(40) })).toThrow(/TRUST_PROXY/)
    expect(() => loadConfig({ ...production, SERVICE_API_KEY: 'short', TRUST_PROXY: '1' })).toThrow(/at least 32/)
  })

  it('requires absolute session limits to be at least the idle limits', () => {
    expect(() => loadConfig({ ...base, SESSION_IDLE_SECONDS: '100', SESSION_ABSOLUTE_SECONDS: '50' })).toThrow(/ABSOLUTE/)
  })
})

describe('email templates', () => {
  it('escapes HTML in names', () => {
    const mail = inviteEmail({ to: 'a@b.com', name: '<script>alert(1)</script>', url: 'http://x/?token=abc', ttlSeconds: 3600 })

    expect(mail.html).not.toContain('<script>')
    expect(mail.html).toContain('&lt;script&gt;')
  })
})

describe('docs/api-types.ts stays in sync with the backend', () => {
  it('error codes, roles and statuses match exactly (checked at compile time by tsc)', () => {
    expectTypeOf<Doc.ErrorCode>().toEqualTypeOf<ErrorCode>()
    expectTypeOf<Doc.Role>().toEqualTypeOf<Role>()
    expectTypeOf<Doc.UserStatus>().toEqualTypeOf<UserStatus>()
  })
})
