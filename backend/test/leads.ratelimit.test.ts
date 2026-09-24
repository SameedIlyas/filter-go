import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { body, client, createTestApp, createUser, ensureOrg, resetDb } from './helpers.js'
import type { TestApp } from './helpers.js'
import { validPublicLead } from './leads.helpers.js'

let t: TestApp
let key: string

beforeAll(async () => {
  t = await createTestApp({ RATE_LIMIT_ENABLED: 'true', RATE_LIMIT_MAX_PER_MINUTE: '1000', PUBLIC_LEAD_ORIGINS: 'https://www.example-site.test' })
})

afterAll(() => t.close())

beforeEach(async () => {
  await resetDb(t.prisma)
  await createUser(t, { role: 'ADMIN' })
  key = (await ensureOrg(t)).leadIntakeKey
})

describe('POST /public/leads per-IP rate limit (5 per hour)', () => {
  const submit = (ip: string, n: number) => client(t.app).post('/public/leads', { body: validPublicLead(key, { email: `lead${n}@x.test`, phone: undefined }), ip })

  it('answers 429 RATE_LIMITED on the 6th request from one IP, honeypot and unknown keys included', async () => {
    for (let n = 0; n < 5; n += 1) {
      expect((await submit('198.51.100.1', n)).statusCode).toBe(202)
    }

    const limited = await submit('198.51.100.1', 5)

    expect(limited.statusCode).toBe(429)
    expect(body(limited).error?.code).toBe('RATE_LIMITED')
    expect(await t.prisma.lead.count()).toBe(5)

    const bot = await client(t.app).post('/public/leads', { body: { orgKey: key, website: 'spam' }, ip: '198.51.100.1' })

    expect(bot.statusCode).toBe(429)
  })

  it('counts per IP: another address is still served', async () => {
    for (let n = 0; n < 6; n += 1) await submit('198.51.100.2', n)

    expect((await submit('198.51.100.3', 99)).statusCode).toBe(202)
  })

  it('does not count CORS preflights against the limit', async () => {
    for (let n = 0; n < 8; n += 1) {
      const preflight = await t.app.inject({
        method: 'OPTIONS',
        url: '/public/leads',
        remoteAddress: '198.51.100.4',
        headers: { origin: 'https://www.example-site.test', 'access-control-request-method': 'POST' }
      })

      expect(preflight.statusCode).toBe(204)
    }

    expect((await submit('198.51.100.4', 1)).statusCode).toBe(202)
  })
})
