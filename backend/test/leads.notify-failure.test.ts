import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { client, createTestApp, createUser, ensureOrg, resetDb } from './helpers.js'
import type { TestApp } from './helpers.js'
import { validPublicLead } from './leads.helpers.js'

vi.mock('../src/modules/notifications/notify.js', () => ({
  notify: vi.fn(async () => {
    throw new Error('notification backend down')
  })
}))

let t: TestApp

beforeAll(async () => {
  t = await createTestApp()
})

afterAll(() => t.close())

beforeEach(async () => {
  await resetDb(t.prisma)
})

describe('notification failures', () => {
  it('never fail the public request: the lead is still stored and the answer is the usual 202', async () => {
    const admin = await createUser(t, { role: 'ADMIN' })
    const org = await ensureOrg(t)
    const api = client(t.app)

    const created = await api.post('/public/leads', { body: validPublicLead(org.leadIntakeKey) })
    const merged = await api.post('/public/leads', { body: validPublicLead(org.leadIntakeKey, { message: 'again' }) })

    expect(created.statusCode).toBe(202)
    expect(merged.statusCode).toBe(202)
    expect(merged.body).toBe(created.body)
    expect(await t.prisma.lead.count()).toBe(1)
    expect((await t.prisma.lead.findFirstOrThrow()).ownerId).toBe(admin.id)
    expect(await t.prisma.leadActivity.count()).toBe(1)
  })
})
