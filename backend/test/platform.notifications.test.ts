import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { notify } from '../src/modules/notifications/notify.js'
import { body, client, createTestApp, resetDb } from './helpers.js'
import type { TestApp } from './helpers.js'
import { OTHER_ORG, ZERO_ID, person } from './platform.helpers.js'
import type { Person } from './platform.helpers.js'

let t: TestApp
let api: ReturnType<typeof client>
let ann: Person
let ben: Person
let otherOrgUser: Person

beforeAll(async () => {
  t = await createTestApp()
  api = client(t.app)
})

afterAll(() => t.close())

beforeEach(async () => {
  await resetDb(t.prisma)

  ann = await person(t, 'FIELD_USER')
  ben = await person(t, 'SUPERVISOR')
  otherOrgUser = await person(t, 'FIELD_USER', OTHER_ORG)
})

/** `count` notifications for `who`, oldest first: titles "n1".."nN", the first `read` of them already read. */
const seed = async (who: Person, count: number, read = 0) => {
  const base = Date.parse('2026-03-10T12:00:00.000Z')

  await t.prisma.notification.createMany({
    data: Array.from({ length: count }, (_value, index) => ({
      orgId: who.user.orgId,
      userId: who.user.id,
      type: 'shift.assigned',
      title: `n${index + 1}`,
      body: 'body',
      data: { shiftId: `s${index + 1}` },
      readAt: index < read ? new Date(base + 1000) : null,
      createdAt: new Date(base + index * 60_000)
    }))
  })

  return t.prisma.notification.findMany({ where: { userId: who.user.id }, orderBy: { createdAt: 'asc' } })
}

describe('GET /notifications', () => {
  it('rejects anonymous callers', async () => {
    expect((await api.get('/v1/notifications')).statusCode).toBe(401)
  })

  it('every role can read their own; the list is newest first, own only, with the unread count', async () => {
    await seed(ann, 3, 1)
    await seed(ben, 2)
    await seed(otherOrgUser, 4)

    const response = await api.get('/v1/notifications', { token: ann.token })
    const data = body(response).data as { notifications: Array<{ title: string }>; unreadCount: number }

    expect(response.statusCode).toBe(200)
    expect(data.notifications.map(item => item.title)).toEqual(['n3', 'n2', 'n1'])
    expect(data.unreadCount).toBe(2)
    expect(body(response).meta).toMatchObject({ page: 1, total: 3 })
  })

  it('serialises only the public fields', async () => {
    await seed(ann, 1)

    const item = body(await api.get('/v1/notifications', { token: ann.token })).data?.notifications[0]

    expect(Object.keys(item).sort()).toEqual(['body', 'createdAt', 'data', 'id', 'readAt', 'title', 'type'])
    expect(item.data).toEqual({ shiftId: 's1' })
  })

  it('unread=true filters the list but unreadCount always counts every unread one', async () => {
    await seed(ann, 5, 2)

    const unread = body(await api.get('/v1/notifications', { token: ann.token, query: { unread: 'true' } }))
    const all = body(await api.get('/v1/notifications', { token: ann.token, query: { unread: 'false' } }))

    expect(unread.data?.notifications.map((item: { title: string }) => item.title)).toEqual(['n5', 'n4', 'n3'])
    expect(unread.meta?.total).toBe(3)
    expect(unread.data?.unreadCount).toBe(3)
    expect(all.meta?.total).toBe(5)
  })

  it('pages the results', async () => {
    await seed(ann, 5)

    const page = body(await api.get('/v1/notifications', { token: ann.token, query: { limit: '2', page: '3' } }))

    expect(page.data?.notifications.map((item: { title: string }) => item.title)).toEqual(['n1'])
    expect(page.meta).toMatchObject({ page: 3, limit: 2, total: 5, totalPages: 3 })
  })

  it('an empty inbox is a normal answer', async () => {
    const data = body(await api.get('/v1/notifications', { token: ann.token })).data

    expect(data).toEqual({ notifications: [], unreadCount: 0 })
  })

  it('shows what notify() wrote', async () => {
    await notify(t.ctx, { orgId: ann.user.orgId, userIds: [ann.user.id], type: 'lead.new', title: 'New lead', body: 'Acme called' })

    const item = body(await api.get('/v1/notifications', { token: ann.token })).data?.notifications[0]

    expect(item).toMatchObject({ type: 'lead.new', title: 'New lead', readAt: null })
  })

  it.each([
    ['unknown filter', { nope: '1' }],
    ['unread not a boolean', { unread: 'maybe' }],
    ['limit too large', { limit: '500' }],
    ['page zero', { page: '0' }]
  ])('rejects %s with 400', async (_name, query) => {
    expect((await api.get('/v1/notifications', { token: ann.token, query })).statusCode).toBe(400)
  })
})

describe('POST /notifications/:id/read', () => {
  it('rejects anonymous callers and bad ids', async () => {
    const [first] = await seed(ann, 1)

    expect((await api.post(`/v1/notifications/${first!.id}/read`)).statusCode).toBe(401)
    expect((await api.post('/v1/notifications/nope/read', { token: ann.token })).statusCode).toBe(400)
  })

  it('marks one notification read and returns the new unread count', async () => {
    const [first] = await seed(ann, 3)
    const response = await api.post(`/v1/notifications/${first!.id}/read`, { token: ann.token })

    expect(response.statusCode).toBe(200)
    expect(body(response).data?.notification.readAt).not.toBeNull()
    expect(body(response).data?.notification.id).toBe(first!.id)
    expect(body(response).data?.unreadCount).toBe(2)
  })

  it('is idempotent and keeps the original read time', async () => {
    const [first] = await seed(ann, 1)
    const one = body(await api.post(`/v1/notifications/${first!.id}/read`, { token: ann.token })).data?.notification.readAt
    const two = body(await api.post(`/v1/notifications/${first!.id}/read`, { token: ann.token }))

    expect(two.data?.notification.readAt).toBe(one)
    expect(two.data?.unreadCount).toBe(0)
  })

  it("someone else's notification is a 404 (same as a missing one) and stays unread", async () => {
    const [mine] = await seed(ann, 1)
    const [theirs] = await seed(otherOrgUser, 1)

    const sameOrgOther = await api.post(`/v1/notifications/${mine!.id}/read`, { token: ben.token })
    const otherOrg = await api.post(`/v1/notifications/${theirs!.id}/read`, { token: ann.token })
    const missing = await api.post(`/v1/notifications/${ZERO_ID}/read`, { token: ann.token })

    expect(sameOrgOther.statusCode).toBe(404)
    expect(otherOrg.statusCode).toBe(404)
    expect(body(sameOrgOther).error?.message).toBe(body(missing).error?.message)
    expect((await t.prisma.notification.findMany({ where: { readAt: null } })).length).toBe(2)
  })

  it('rejects a request body', async () => {
    const [first] = await seed(ann, 1)

    expect((await api.post(`/v1/notifications/${first!.id}/read`, { token: ann.token, body: { read: false } })).statusCode).toBe(400)
  })
})

describe('POST /notifications/read-all', () => {
  it('rejects anonymous callers', async () => {
    expect((await api.post('/v1/notifications/read-all')).statusCode).toBe(401)
  })

  it('marks only the caller\'s unread notifications', async () => {
    await seed(ann, 4, 1)
    await seed(ben, 2)
    await seed(otherOrgUser, 2)

    const response = await api.post('/v1/notifications/read-all', { token: ann.token })

    expect(response.statusCode).toBe(200)
    expect(body(response).data).toEqual({ updated: 3, unreadCount: 0 })
    expect(await t.prisma.notification.count({ where: { userId: ann.user.id, readAt: null } })).toBe(0)
    expect(await t.prisma.notification.count({ where: { userId: ben.user.id, readAt: null } })).toBe(2)
    expect(await t.prisma.notification.count({ where: { userId: otherOrgUser.user.id, readAt: null } })).toBe(2)
  })

  it('keeps the read time of already-read notifications and is safe to repeat', async () => {
    const rows = await seed(ann, 2, 1)

    await api.post('/v1/notifications/read-all', { token: ann.token })

    const after = await t.prisma.notification.findMany({ where: { userId: ann.user.id }, orderBy: { createdAt: 'asc' } })

    expect(after[0]?.readAt?.getTime()).toBe(rows[0]?.readAt?.getTime())
    expect(body(await api.post('/v1/notifications/read-all', { token: ann.token })).data).toEqual({ updated: 0, unreadCount: 0 })
  })

  it('rejects a request body', async () => {
    expect((await api.post('/v1/notifications/read-all', { token: ann.token, body: { all: true } })).statusCode).toBe(400)
  })

  it('does not collide with the /:id/read route', async () => {
    await seed(ann, 1)

    expect((await api.post('/v1/notifications/read-all', { token: ann.token })).statusCode).toBe(200)
  })
})
