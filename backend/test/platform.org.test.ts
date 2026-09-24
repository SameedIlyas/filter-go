import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { body, client, createTestApp, createUser, ensureOrg, resetDb } from './helpers.js'
import type { TestApp } from './helpers.js'
import { OTHER_ORG, ZERO_ID, person } from './platform.helpers.js'
import type { Person } from './platform.helpers.js'

let t: TestApp
let api: ReturnType<typeof client>
let admin: Person
let supervisor: Person
let field: Person
let clientUser: Person
let otherAdmin: Person

beforeAll(async () => {
  t = await createTestApp()
  api = client(t.app)
})

afterAll(() => t.close())

beforeEach(async () => {
  await resetDb(t.prisma)

  const org = await ensureOrg(t)
  const customer = await t.prisma.client.create({ data: { orgId: org.id, legalName: 'Client', billingEmail: 'b@client.test' } })

  admin = await person(t, 'ADMIN')
  supervisor = await person(t, 'SUPERVISOR')
  field = await person(t, 'FIELD_USER')
  clientUser = await person(t, 'CLIENT_USER', undefined, { clientId: customer.id })
  otherAdmin = await person(t, 'ADMIN', OTHER_ORG)
})

const orgRow = () => t.prisma.organization.findUniqueOrThrow({ where: { id: admin.user.orgId } })

describe('GET /org', () => {
  it('rejects anonymous callers', async () => {
    expect((await api.get('/v1/org')).statusCode).toBe(401)
  })

  it('every signed-in role sees id, name and timezone; only an admin sees the lead settings', async () => {
    const row = await orgRow()

    for (const who of [supervisor, field, clientUser]) {
      const response = await api.get('/v1/org', { token: who.token })

      expect(response.statusCode).toBe(200)
      expect(body(response).data?.org).toEqual({ id: row.id, name: 'Acme Services', timezone: 'America/Chicago' })
      expect(response.body).not.toContain(row.leadIntakeKey)
    }

    const asAdmin = body(await api.get('/v1/org', { token: admin.token })).data?.org

    expect(asAdmin).toEqual({ id: row.id, name: 'Acme Services', timezone: 'America/Chicago', leadIntakeKey: row.leadIntakeKey, defaultLeadOwnerId: null })
  })

  it('returns the caller\'s own organization, never another', async () => {
    const theirs = body(await api.get('/v1/org', { token: otherAdmin.token })).data?.org

    expect(theirs.name).toBe(OTHER_ORG)
    expect(theirs.id).toBe(otherAdmin.user.orgId)
  })
})

describe('PATCH /org', () => {
  it('rejects anonymous callers (401) and non-admins (403)', async () => {
    expect((await api.patch('/v1/org', { body: { name: 'X' } })).statusCode).toBe(401)

    for (const who of [supervisor, field, clientUser]) {
      expect((await api.patch('/v1/org', { token: who.token, body: { name: 'X' } })).statusCode).toBe(403)
    }

    expect((await orgRow()).name).toBe('Acme Services')
  })

  it('updates name, timezone and the default lead owner, and audits before/after', async () => {
    const response = await api.patch('/v1/org', {
      token: admin.token,
      body: { name: '  Acme Field Services  ', timezone: 'America/New_York', defaultLeadOwnerId: supervisor.user.id }
    })

    expect(response.statusCode).toBe(200)
    expect(body(response).data?.org).toMatchObject({ name: 'Acme Field Services', timezone: 'America/New_York', defaultLeadOwnerId: supervisor.user.id })

    const [event] = await t.prisma.auditEvent.findMany({ where: { type: 'org.updated' } })

    expect(event).toMatchObject({ entity: 'org', entityId: admin.user.orgId, action: 'updated', actorId: admin.user.id, orgId: admin.user.orgId })
    expect(event?.diff).toEqual({
      before: { name: 'Acme Services', timezone: 'America/Chicago', defaultLeadOwnerId: null },
      after: { name: 'Acme Field Services', timezone: 'America/New_York', defaultLeadOwnerId: supervisor.user.id }
    })
  })

  it('an admin may be the default lead owner, and null clears it', async () => {
    await api.patch('/v1/org', { token: admin.token, body: { defaultLeadOwnerId: admin.user.id } })

    expect((await orgRow()).defaultLeadOwnerId).toBe(admin.user.id)

    const cleared = await api.patch('/v1/org', { token: admin.token, body: { defaultLeadOwnerId: null } })

    expect(body(cleared).data?.org.defaultLeadOwnerId).toBeNull()
  })

  it('does not audit a request that changes nothing', async () => {
    const response = await api.patch('/v1/org', { token: admin.token, body: { name: 'Acme Services', timezone: 'America/Chicago' } })

    expect(response.statusCode).toBe(200)
    expect(await t.prisma.auditEvent.count({ where: { type: 'org.updated' } })).toBe(0)
  })

  it('refuses a default lead owner who is not an active admin or supervisor of this organization', async () => {
    const disabled = await createUser(t, { role: 'SUPERVISOR', status: 'DISABLED' })
    const invited = await createUser(t, { role: 'ADMIN', password: null })

    for (const id of [field.user.id, clientUser.user.id, disabled.id, invited.id, otherAdmin.user.id, ZERO_ID]) {
      const response = await api.patch('/v1/org', { token: admin.token, body: { defaultLeadOwnerId: id } })

      expect(response.statusCode, id).toBe(400)
      expect(body(response).error?.details?.issues[0]).toMatchObject({ field: 'defaultLeadOwnerId', code: 'invalid_owner' })
    }

    expect((await orgRow()).defaultLeadOwnerId).toBeNull()
  })

  it.each([
    ['empty body', {}],
    ['unknown field', { name: 'X', leadIntakeKey: 'chosen-by-me' }],
    ['immutable id', { id: ZERO_ID }],
    ['bad timezone', { timezone: 'Mars/Olympus' }],
    ['blank name', { name: '   ' }],
    ['long name', { name: 'x'.repeat(121) }],
    ['control chars in name', { name: 'bad\u0007name' }],
    ['owner not a uuid', { defaultLeadOwnerId: 'me' }]
  ])('rejects %s with 400', async (_name, payload) => {
    const response = await api.patch('/v1/org', { token: admin.token, body: payload })

    expect(response.statusCode).toBe(400)
    expect(body(response).error?.code).toBe('VALIDATION_ERROR')
    expect((await orgRow()).name).toBe('Acme Services')
  })

  it('an admin of one organization never touches another', async () => {
    await api.patch('/v1/org', { token: otherAdmin.token, body: { name: 'Renamed' } })

    expect((await orgRow()).name).toBe('Acme Services')
    expect((await t.prisma.organization.findUniqueOrThrow({ where: { id: otherAdmin.user.orgId } })).name).toBe('Renamed')
  })
})

describe('POST /org/rotate-lead-key', () => {
  it('rejects anonymous callers (401) and non-admins (403)', async () => {
    const before = (await orgRow()).leadIntakeKey

    expect((await api.post('/v1/org/rotate-lead-key')).statusCode).toBe(401)

    for (const who of [supervisor, field, clientUser]) {
      expect((await api.post('/v1/org/rotate-lead-key', { token: who.token })).statusCode).toBe(403)
    }

    expect((await orgRow()).leadIntakeKey).toBe(before)
  })

  it('issues a new key at once: the old key no longer identifies the organization', async () => {
    const oldKey = (await orgRow()).leadIntakeKey
    const response = await api.post('/v1/org/rotate-lead-key', { token: admin.token })
    const newKey = body(response).data?.org.leadIntakeKey as string

    expect(response.statusCode).toBe(200)
    expect(newKey).toMatch(/^[A-Za-z0-9_-]{24}$/)
    expect(newKey).not.toBe(oldKey)
    expect((await orgRow()).leadIntakeKey).toBe(newKey)
    expect(await t.prisma.organization.findUnique({ where: { leadIntakeKey: oldKey } })).toBeNull()
  })

  it('audits the rotation without writing either key to the trail', async () => {
    const oldKey = (await orgRow()).leadIntakeKey
    const newKey = body(await api.post('/v1/org/rotate-lead-key', { token: admin.token })).data?.org.leadIntakeKey as string
    const events = await t.prisma.auditEvent.findMany({ where: { type: 'org.lead_key_rotated' } })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ entity: 'org', actorId: admin.user.id, orgId: admin.user.orgId })
    expect(JSON.stringify(events)).not.toContain(oldKey)
    expect(JSON.stringify(events)).not.toContain(newKey)
  })

  it('only rotates the caller\'s organization and rejects a body', async () => {
    const mine = (await orgRow()).leadIntakeKey

    await api.post('/v1/org/rotate-lead-key', { token: otherAdmin.token })

    expect((await orgRow()).leadIntakeKey).toBe(mine)
    expect((await api.post('/v1/org/rotate-lead-key', { token: admin.token, body: { key: 'mine' } })).statusCode).toBe(400)
  })

  it('two simultaneous rotations both succeed and the last committed key wins', async () => {
    const responses = await Promise.all([api.post('/v1/org/rotate-lead-key', { token: admin.token }), api.post('/v1/org/rotate-lead-key', { token: admin.token })])
    const keys = responses.map(response => body(response).data?.org.leadIntakeKey)

    expect(responses.map(response => response.statusCode)).toEqual([200, 200])
    expect(keys).toContain((await orgRow()).leadIntakeKey)
    expect(await t.prisma.auditEvent.count({ where: { type: 'org.lead_key_rotated' } })).toBe(2)
  })
})

describe('GET /audit-events', () => {
  const seed = async () => {
    const orgId = admin.user.orgId
    const base = Date.parse('2026-03-10T12:00:00.000Z')
    const at = (minutes: number) => new Date(base + minutes * 60_000)

    await t.prisma.auditEvent.createMany({
      data: [
        { orgId, actorId: admin.user.id, type: 'contract.created', entity: 'contract', entityId: 'c1', action: 'created', diff: { number: 'C-1' }, ip: '10.0.0.1', userAgent: 'UA', metadata: { secret: 'nope' }, createdAt: at(0) },
        { orgId, actorId: supervisor.user.id, type: 'contract.signed', entity: 'contract', entityId: 'c1', action: 'signed', diff: { by: 'X' }, createdAt: at(10) },
        { orgId, actorId: admin.user.id, type: 'shift.assigned', entity: 'shift', entityId: 's1', action: 'assigned', createdAt: at(20) },
        { orgId, userId: field.user.id, type: 'LOGIN_SUCCESS', metadata: { token: 'must-not-leak' }, createdAt: at(30) },
        { orgId: otherAdmin.user.orgId, actorId: otherAdmin.user.id, type: 'contract.created', entity: 'contract', entityId: 'theirs', action: 'created', createdAt: at(40) },
        { orgId: null, userId: admin.user.id, type: 'LOGIN_SUCCESS', metadata: { token: 'auth-secret' }, createdAt: at(50) }
      ]
    })

    return at
  }

  it('rejects anonymous callers (401) and non-admins (403)', async () => {
    expect((await api.get('/v1/audit-events')).statusCode).toBe(401)

    for (const who of [supervisor, field, clientUser]) {
      expect((await api.get('/v1/audit-events', { token: who.token })).statusCode).toBe(403)
    }
  })

  it('returns only whitelisted fields, newest first, scoped to the organization', async () => {
    await seed()

    const response = await api.get('/v1/audit-events', { token: admin.token })
    const events = body(response).data?.events as Array<Record<string, unknown>>

    expect(events.map(event => event['type'])).toEqual(['LOGIN_SUCCESS', 'shift.assigned', 'contract.signed', 'contract.created'])
    expect(Object.keys(events[3]!).sort()).toEqual(['action', 'actorId', 'at', 'diff', 'entity', 'entityId', 'id', 'ip', 'type', 'userId'])
    expect(events[3]).toMatchObject({ actorId: admin.user.id, entity: 'contract', entityId: 'c1', action: 'created', diff: { number: 'C-1' }, ip: '10.0.0.1' })
    expect(response.body).not.toContain('metadata')
    expect(response.body).not.toContain('userAgent')
    expect(response.body).not.toContain('must-not-leak')
    expect(response.body).not.toContain('auth-secret')
    expect(response.body).not.toContain('theirs')
    expect(body(response).meta).toMatchObject({ total: 4 })
  })

  it('filters by entity, entityId, actorId and action', async () => {
    await seed()

    const types = async (query: Record<string, string>) =>
      ((body(await api.get('/v1/audit-events', { token: admin.token, query })).data?.events ?? []) as Array<{ type: string }>).map(event => event.type)

    expect(await types({ entity: 'contract' })).toEqual(['contract.signed', 'contract.created'])
    expect(await types({ entity: 'contract', entityId: 'c1', action: 'signed' })).toEqual(['contract.signed'])
    expect(await types({ actorId: admin.user.id })).toEqual(['shift.assigned', 'contract.created'])
    expect(await types({ entity: 'nothing' })).toEqual([])
  })

  it('filters by an inclusive time range', async () => {
    const at = await seed()

    const types = async (query: Record<string, string>) =>
      ((body(await api.get('/v1/audit-events', { token: admin.token, query })).data?.events ?? []) as Array<{ type: string }>).map(event => event.type)

    expect(await types({ from: at(10).toISOString(), to: at(20).toISOString() })).toEqual(['shift.assigned', 'contract.signed'])
    expect(await types({ from: at(20).toISOString() })).toEqual(['LOGIN_SUCCESS', 'shift.assigned'])
    expect(await types({ to: at(0).toISOString() })).toEqual(['contract.created'])
  })

  it('pages the results', async () => {
    await seed()

    const second = await api.get('/v1/audit-events', { token: admin.token, query: { limit: '2', page: '2' } })

    expect((body(second).data?.events as unknown[]).length).toBe(2)
    expect(body(second).meta).toMatchObject({ page: 2, limit: 2, total: 4, totalPages: 2 })
  })

  it('another organization only sees its own trail', async () => {
    await seed()

    const events = body(await api.get('/v1/audit-events', { token: otherAdmin.token })).data?.events as Array<{ entityId: string }>

    expect(events.map(event => event.entityId)).toEqual(['theirs'])
  })

  it('an admin action shows up in the trail', async () => {
    await api.patch('/v1/org', { token: admin.token, body: { name: 'Audited Inc' } })

    const events = body(await api.get('/v1/audit-events', { token: admin.token, query: { action: 'updated', entity: 'org' } })).data?.events

    expect(events).toHaveLength(1)
    expect(events[0].diff.after).toEqual({ name: 'Audited Inc' })
  })

  it.each([
    ['unknown filter', { nope: '1' }],
    ['bad actor id', { actorId: 'me' }],
    ['bad from', { from: 'yesterday' }],
    ['date without zone', { to: '2026-03-10T12:00:00' }],
    ['limit too large', { limit: '101' }],
    ['empty entity', { entity: '' }]
  ])('rejects %s with 400', async (_name, query) => {
    expect((await api.get('/v1/audit-events', { token: admin.token, query })).statusCode).toBe(400)
  })
})
