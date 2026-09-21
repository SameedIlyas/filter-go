import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { STRONG_PASSWORD, TEST_DATABASE_URL, body, client, createTestApp, ensureOrg, resetDb } from './helpers.js'
import type { TestApp } from './helpers.js'

const run = promisify(execFile)

let t: TestApp

beforeAll(async () => {
  t = await createTestApp()
})

afterAll(() => t.close())
beforeEach(async () => {
  await resetDb(t.prisma)
  // one organization exists, so the script picks it without needing --org
  await ensureOrg(t)
})

const createAdmin = async (...args: string[]) => {
  try {
    const { stdout } = await run(process.execPath, ['--import', 'tsx', 'src/scripts/create-admin.ts', ...args], {
      env: {
        ...process.env,
        NODE_ENV: 'development',
        DATABASE_URL: TEST_DATABASE_URL,
        FRONTEND_URL: 'http://localhost:3000',
        PASSWORD_HASH_MEMORY_KIB: '8',
        PASSWORD_HASH_TIME_COST: '1'
      }
    })

    return { code: 0, out: stdout }
  } catch (error) {
    const failure = error as { code: number; stdout: string; stderr: string }

    return { code: failure.code, out: `${failure.stdout}${failure.stderr}` }
  }
}

describe('pnpm admin:create', () => {
  it('bootstraps an admin who can set a password from the printed link and sign in', async () => {
    const created = await createAdmin('--email', 'first@filter-go.test', '--name', 'First Admin')
    const token = /token=([A-Za-z0-9_%-]+)/.exec(created.out)?.[1]

    expect(created.code).toBe(0)
    expect(token).toBeTruthy()

    const api = client(t.app)
    const accepted = await api.post('/v1/auth/accept-invite', { body: { token: decodeURIComponent(token ?? ''), password: STRONG_PASSWORD } })

    expect(body(accepted).data?.user).toMatchObject({ role: 'ADMIN', status: 'ACTIVE', email: 'first@filter-go.test' })
  }, 40_000)

  it('refuses to touch an existing account unless --force, and --force keeps the password', async () => {
    const first = await createAdmin('--email', 'first@filter-go.test', '--name', 'First Admin')
    const token = decodeURIComponent(/token=([A-Za-z0-9_%-]+)/.exec(first.out)?.[1] ?? '')

    await client(t.app).post('/v1/auth/accept-invite', { body: { token, password: STRONG_PASSWORD } })
    await t.prisma.user.update({ where: { email: 'first@filter-go.test' }, data: { role: 'FIELD_USER', status: 'DISABLED' } })

    const refused = await createAdmin('--email', 'first@filter-go.test', '--name', 'First Admin')

    expect(refused.code).toBe(1)
    expect(refused.out).toContain('--force')
    expect((await t.prisma.user.findUniqueOrThrow({ where: { email: 'first@filter-go.test' } })).status).toBe('DISABLED')

    const forced = await createAdmin('--email', 'first@filter-go.test', '--name', 'First Admin', '--force')

    expect(forced.code).toBe(0)
    expect(await t.prisma.user.findUniqueOrThrow({ where: { email: 'first@filter-go.test' } })).toMatchObject({ role: 'ADMIN', status: 'ACTIVE' })
    expect((await client(t.app).post('/v1/auth/login', { body: { email: 'first@filter-go.test', password: STRONG_PASSWORD } })).statusCode).toBe(200)
  }, 60_000)

  it('rejects bad input with a readable message', async () => {
    const result = await createAdmin('--email', 'not-an-email', '--name', 'X')

    expect(result.code).toBe(1)
    expect(result.out).toContain('email')
  }, 40_000)
})
