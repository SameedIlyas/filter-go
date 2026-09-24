import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { body, client, createTestApp, createUser, resetDb } from './helpers.js'
import type { TestApp } from './helpers.js'
import { intakeKeyOf, validPublicLead } from './leads.helpers.js'

const ALLOWED = 'https://www.example-site.test'

let t: TestApp
let key: string

beforeAll(async () => {
  t = await createTestApp({ PUBLIC_LEAD_ORIGINS: ALLOWED })
})

afterAll(() => t.close())

beforeEach(async () => {
  await resetDb(t.prisma)
  await createUser(t, { role: 'ADMIN' })
  key = await intakeKeyOf(t)
})

describe('CORS on /public/leads', () => {
  const preflight = (origin: string) =>
    t.app.inject({
      method: 'OPTIONS',
      url: '/public/leads',
      headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' }
    })

  it('answers the preflight for an allowed origin', async () => {
    const response = await preflight(ALLOWED)

    expect(response.statusCode).toBe(204)
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED)
    expect(response.headers['access-control-allow-methods']).toBe('POST, OPTIONS')
    expect(String(response.headers['access-control-allow-headers']).toLowerCase()).toBe('content-type')
    expect(response.headers['access-control-allow-credentials']).toBeUndefined()
  })

  it('does not grant any CORS headers to another origin on the preflight', async () => {
    const response = await preflight('https://evil.test')

    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('adds the allow-origin header to the real request for an allowed origin only', async () => {
    const api = client(t.app)
    const allowed = await api.post('/public/leads', { body: validPublicLead(key), headers: { origin: ALLOWED } })
    const other = await api.post('/public/leads', { body: validPublicLead(key, { email: 'b@x.test', phone: undefined }), headers: { origin: 'https://evil.test' } })

    expect(allowed.statusCode).toBe(202)
    expect(allowed.headers['access-control-allow-origin']).toBe(ALLOWED)
    expect(other.headers['access-control-allow-origin']).toBeUndefined()
    expect(body(other).data).toEqual({ received: true })
  })

  it('keeps the rest of the API closed to that origin', async () => {
    const response = await t.app.inject({
      method: 'OPTIONS',
      url: '/v1/leads',
      headers: { origin: ALLOWED, 'access-control-request-method': 'GET' }
    })

    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })
})

describe('CORS with no configured origins', () => {
  it('sends no CORS headers at all', async () => {
    const closed = await createTestApp({ PUBLIC_LEAD_ORIGINS: '' })

    try {
      const response = await closed.app.inject({
        method: 'OPTIONS',
        url: '/public/leads',
        headers: { origin: ALLOWED, 'access-control-request-method': 'POST' }
      })

      expect(response.headers['access-control-allow-origin']).toBeUndefined()
    } finally {
      await closed.close()
    }
  })
})
