import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { body, client, createTestApp, createUser, ensureOrg, resetDb } from './helpers.js'
import type { TestApp } from './helpers.js'
import { validPublicLead } from './leads.helpers.js'
import { DUPLICATE_NOTE_TITLE, ORG_HOURLY_CAP } from '../src/modules/leads/leads.public.service.js'

let t: TestApp
let api: ReturnType<typeof client>
let key: string
let orgId: string
let admin: Awaited<ReturnType<typeof createUser>>

const SUCCESS = { success: true, data: { received: true }, error: null }

const submit = (payload: Record<string, unknown>, ip = '203.0.113.7') => api.post('/public/leads', { body: payload, ip })

const leadCount = () => t.prisma.lead.count()

beforeAll(async () => {
  t = await createTestApp()
  api = client(t.app)
})

afterAll(() => t.close())

beforeEach(async () => {
  await resetDb(t.prisma)
  t.mailer.clear()
  admin = await createUser(t, { role: 'ADMIN', email: 'owner@filter-go.test' })
  const org = await ensureOrg(t)

  key = org.leadIntakeKey
  orgId = org.id
})

describe('POST /public/leads: the same answer for every outcome', () => {
  it('stores a website lead and answers 202 { received: true }', async () => {
    const response = await submit(validPublicLead(key, { email: 'Ana@Northwind.TEST', utm: { utm_source: 'google', utm_campaign: 'spring' }, sourceUrl: 'https://site.test/contact?x=1' }))

    expect(response.statusCode).toBe(202)
    expect(body(response)).toEqual(SUCCESS)

    const lead = await t.prisma.lead.findFirstOrThrow()

    expect(lead).toMatchObject({
      orgId,
      source: 'WEBSITE',
      status: 'NEW',
      email: 'ana@northwind.test',
      phone: '(555) 010-2030',
      phoneNorm: '5550102030',
      ownerId: admin.id,
      sourceUrl: 'https://site.test/contact?x=1',
      utm: { utm_source: 'google', utm_campaign: 'spring' },
      message: 'We need weekly filter changes.'
    })
  })

  it('returns byte-identical bodies for success, honeypot, unknown key and duplicate', async () => {
    const created = await submit(validPublicLead(key))
    const duplicate = await submit(validPublicLead(key))
    const honeypot = await submit(validPublicLead(key, { email: 'bot@x.test', website: 'http://spam.test' }))
    const unknown = await submit(validPublicLead('not-a-real-key', { email: 'ghost@x.test' }))

    for (const response of [created, duplicate, honeypot, unknown]) {
      expect(response.statusCode).toBe(202)
      expect(response.body).toBe(created.body)
    }

    expect(await leadCount()).toBe(1)
  })

  it('a honeypot hit stores nothing, notifies nobody and skips validation', async () => {
    const response = await submit({ orgKey: key, website: 'http://spam.test' })

    expect(response.statusCode).toBe(202)
    expect(body(response)).toEqual(SUCCESS)
    expect(await leadCount()).toBe(0)
    expect(await t.prisma.notification.count()).toBe(0)
  })

  it.each([['a number', 5], ['an array', ['x']], ['an object', { a: 1 }], ['whitespace only is empty, not a bot', '   ']])('honeypot given as %s', async (label, value) => {
    const response = await submit(validPublicLead(key, { website: value }))

    expect(response.statusCode).toBe(202)
    expect(await leadCount()).toBe(label.startsWith('whitespace') ? 1 : 0)
  })

  it('accepts an empty honeypot and a null one', async () => {
    expect((await submit(validPublicLead(key, { website: '' }))).statusCode).toBe(202)
    expect((await submit(validPublicLead(key, { website: null, email: 'b@x.test', phone: undefined }))).statusCode).toBe(202)
    expect(await leadCount()).toBe(2)
  })

  it('an unknown org key stores nothing', async () => {
    const response = await submit(validPublicLead('nope'))

    expect(body(response)).toEqual(SUCCESS)
    expect(await leadCount()).toBe(0)
  })

  it('needs no session and no service key even when a service key is configured', async () => {
    const guarded = await createTestApp({ SERVICE_API_KEY: 'k'.repeat(40) })

    try {
      const org = await ensureOrg(guarded)
      const response = await client(guarded.app).post('/public/leads', { body: validPublicLead(org.leadIntakeKey, { email: 'guarded@x.test' }) })

      expect(response.statusCode).toBe(202)
      expect((await client(guarded.app).get('/v1/leads')).statusCode).toBe(403)
    } finally {
      await guarded.close()
    }
  })
})

describe('POST /public/leads: validation', () => {
  const bad = (overrides: Record<string, unknown>) => submit(validPublicLead(key, overrides))

  it.each([
    ['missing company', { companyName: undefined }],
    ['blank company', { companyName: '   ' }],
    ['company too long', { companyName: 'x'.repeat(201) }],
    ['contact too long', { contactName: 'x'.repeat(201) }],
    ['bad email', { email: 'not-an-email' }],
    ['email too long', { email: `${'a'.repeat(250)}@x.test` }],
    ['phone too long', { phone: '1'.repeat(41) }],
    ['address too long', { address: 'x'.repeat(501) }],
    ['message too long', { message: 'x'.repeat(4001) }],
    ['control character in company', { companyName: 'Acme\u0000Inc' }],
    ['newline in contact name', { contactName: 'Ana\nBcc: x@y.test' }],
    ['sourceUrl not http', { sourceUrl: 'ftp://site.test' }],
    ['sourceUrl javascript', { sourceUrl: 'javascript:alert(1)' }],
    ['sourceUrl not a url', { sourceUrl: 'nonsense' }],
    ['sourceUrl too long', { sourceUrl: `https://site.test/${'a'.repeat(2048)}` }],
    ['utm value too long', { utm: { utm_source: 'x'.repeat(201) } }],
    ['utm with 21 keys', { utm: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, 'v'])) }],
    ['utm not an object', { utm: 'google' }],
    ['utm non-string value', { utm: { utm_source: 5 } }],
    ['utm bad key', { utm: { 'bad key!': 'x' } }],
    ['unknown field', { role: 'ADMIN' }],
    ['missing orgKey', { orgKey: undefined }]
  ])('%s is a normal 400', async (_label, overrides) => {
    const response = await bad(overrides)

    expect(response.statusCode).toBe(400)
    expect(body(response).error?.code).toBe('VALIDATION_ERROR')
    expect(await leadCount()).toBe(0)
  })

  it('accepts values exactly at the limits', async () => {
    const response = await bad({
      companyName: 'x'.repeat(200),
      contactName: 'y'.repeat(200),
      phone: '5'.repeat(40),
      address: 'z'.repeat(500),
      message: 'm'.repeat(4000),
      sourceUrl: `https://site.test/${'a'.repeat(2048 - 'https://site.test/'.length)}`,
      utm: { ...Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, 'v'.repeat(200)])) }
    })

    expect(response.statusCode).toBe(202)
    expect(await leadCount()).toBe(1)
  })

  it('treats empty optional strings as absent', async () => {
    const response = await bad({ phone: '', address: '', serviceInterest: '', message: '', sourceUrl: '', utm: null })

    expect(response.statusCode).toBe(202)

    const lead = await t.prisma.lead.findFirstOrThrow()

    expect(lead).toMatchObject({ phone: null, phoneNorm: null, address: null, message: null, sourceUrl: null, utm: null })
  })

  it('stores phoneNorm only with at least 7 digits', async () => {
    await bad({ phone: '12-34-56', email: 'short@x.test' })
    await bad({ phone: 'ext 1234567', email: 'seven@x.test' })

    const leads = await t.prisma.lead.findMany({ orderBy: { email: 'asc' } })

    expect(leads.map(lead => [lead.email, lead.phoneNorm])).toEqual([
      ['seven@x.test', '1234567'],
      ['short@x.test', null]
    ])
  })

  it('rejects a body that is not an object', async () => {
    const response = await api.post('/public/leads', { body: ['x'] as unknown as object })

    expect(response.statusCode).toBe(400)
  })
})

describe('POST /public/leads: owner and notifications', () => {
  it('notifies the owner in-app and by email with plain-text escaping', async () => {
    await submit(validPublicLead(key, { companyName: 'A&B <script>alert(1)</script> Ltd', message: 'Hello <b>there</b>' }))
    await t.ctx.background.flush()

    const notifications = await t.prisma.notification.findMany()

    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({ userId: admin.id, orgId, type: 'lead.new' })
    expect(notifications[0]?.title).toBe('New website lead: A&B <script>alert(1)</script> Ltd')
    expect(t.mailer.sent).toHaveLength(1)
    expect(t.mailer.sent[0]?.to).toBe(admin.email)
    expect(t.mailer.sent[0]?.html).not.toContain('<script>')
    expect(t.mailer.sent[0]?.html).not.toContain('<b>there</b>')
    expect(t.mailer.sent[0]?.html).toContain('&lt;b&gt;there&lt;/b&gt;')
  })

  it('uses the configured default owner when they are an active admin/supervisor', async () => {
    const supervisor = await createUser(t, { role: 'SUPERVISOR' })

    await t.prisma.organization.update({ where: { id: orgId }, data: { defaultLeadOwnerId: supervisor.id } })
    await submit(validPublicLead(key))

    expect((await t.prisma.lead.findFirstOrThrow()).ownerId).toBe(supervisor.id)
    expect((await t.prisma.notification.findFirstOrThrow()).userId).toBe(supervisor.id)
  })

  it.each([
    ['disabled supervisor', { role: 'SUPERVISOR', status: 'DISABLED' }],
    ['field user', { role: 'FIELD_USER' }],
    ['invited admin', { role: 'ADMIN', password: null }]
  ] as const)('falls back to the oldest active admin when the default owner is a %s', async (_label, input) => {
    const wrong = await createUser(t, input)

    await t.prisma.organization.update({ where: { id: orgId }, data: { defaultLeadOwnerId: wrong.id } })
    await submit(validPublicLead(key))

    expect((await t.prisma.lead.findFirstOrThrow()).ownerId).toBe(admin.id)
  })

  it('picks the oldest active admin when there is no default owner', async () => {
    const newer = await createUser(t, { role: 'ADMIN' })

    await t.prisma.user.update({ where: { id: newer.id }, data: { createdAt: new Date('2099-01-01') } })
    await t.prisma.user.update({ where: { id: admin.id }, data: { createdAt: new Date('2020-01-01') } })
    await submit(validPublicLead(key))

    expect((await t.prisma.lead.findFirstOrThrow()).ownerId).toBe(admin.id)
  })

  it('still stores the lead when the organization has no active admin', async () => {
    await t.prisma.user.update({ where: { id: admin.id }, data: { status: 'DISABLED' } })

    const response = await submit(validPublicLead(key))

    expect(response.statusCode).toBe(202)
    expect((await t.prisma.lead.findFirstOrThrow()).ownerId).toBeNull()
    expect(await t.prisma.notification.count()).toBe(0)
  })

  it('writes an audit row without an actor', async () => {
    await submit(validPublicLead(key, { email: 'audit@x.test' }))

    const lead = await t.prisma.lead.findFirstOrThrow()
    const audit = await t.prisma.auditEvent.findFirstOrThrow({ where: { entity: 'lead', entityId: lead.id, action: 'created' } })

    expect(audit).toMatchObject({ orgId, actorId: null })
  })
})

describe('POST /public/leads: dedupe', () => {
  const seedOpen = (overrides: Record<string, unknown> = {}) =>
    t.prisma.lead.create({
      data: {
        orgId,
        companyName: 'Existing Co',
        contactName: 'Eve',
        email: 'eve@existing.test',
        phone: '555-000-1111',
        phoneNorm: '5550001111',
        source: 'PHONE',
        status: 'CONTACTED',
        ownerId: admin.id,
        ...overrides
      }
    })

  it('merges a submission with the same email (any case) into the open lead as a NOTE', async () => {
    const existing = await seedOpen()

    await submit(validPublicLead(key, { email: 'EVE@Existing.test', phone: undefined, message: 'Second time', utm: { utm_source: 'ads' }, sourceUrl: 'https://site.test/p' }))

    expect(await leadCount()).toBe(1)

    const activity = await t.prisma.leadActivity.findFirstOrThrow({ where: { leadId: existing.id } })

    expect(activity.type).toBe('NOTE')
    expect(activity.userId).toBeNull()
    expect(activity.body).toContain(DUPLICATE_NOTE_TITLE)
    expect(activity.body).toContain('Second time')
    expect(activity.body).toContain('utm_source=ads')
    expect(activity.body).toContain('https://site.test/p')
  })

  it('merges on the same phone written differently, and notifies the existing owner with lead.duplicate', async () => {
    const existing = await seedOpen()

    await submit(validPublicLead(key, { email: 'someone-else@x.test', phone: '(555) 000-1111' }))
    await t.ctx.background.flush()

    expect(await leadCount()).toBe(1)
    expect(await t.prisma.leadActivity.count({ where: { leadId: existing.id } })).toBe(1)

    const notification = await t.prisma.notification.findFirstOrThrow()

    expect(notification).toMatchObject({ userId: admin.id, type: 'lead.duplicate', data: { leadId: existing.id } })
    expect(t.mailer.sent).toHaveLength(0)

    const audit = await t.prisma.auditEvent.findFirstOrThrow({ where: { entityId: existing.id, action: 'duplicate_merged' } })

    expect(audit.orgId).toBe(orgId)
  })

  it.each(['WON', 'LOST'] as const)('a %s lead is not open: a new lead is created', async status => {
    await seedOpen({ status })
    await submit(validPublicLead(key, { email: 'eve@existing.test' }))

    expect(await leadCount()).toBe(2)
  })

  it('does not dedupe across organizations', async () => {
    const other = await ensureOrg(t, 'Other Org')

    await seedOpen({ orgId: other.id })
    await submit(validPublicLead(key, { email: 'eve@existing.test', phone: '5550001111' }))

    expect(await t.prisma.lead.count({ where: { orgId } })).toBe(1)
    expect(await t.prisma.lead.count({ where: { orgId: other.id } })).toBe(1)
  })

  it('does not merge on phone numbers with fewer than 7 digits', async () => {
    await seedOpen({ phone: '123456', phoneNorm: null })
    await submit(validPublicLead(key, { email: 'new@x.test', phone: '123456' }))

    expect(await leadCount()).toBe(2)
  })

  it('five simultaneous identical submissions create exactly one lead', async () => {
    const responses = await Promise.all(Array.from({ length: 5 }, () => submit(validPublicLead(key, { email: 'race@x.test' }))))

    expect(responses.map(response => response.statusCode)).toEqual([202, 202, 202, 202, 202])
    expect(await leadCount()).toBe(1)
    expect(await t.prisma.leadActivity.count()).toBe(4)
  })
})

describe('POST /public/leads: per-organization cap', () => {
  const seedWebsiteLeads = (count: number, createdAt: Date) =>
    t.prisma.lead.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        orgId,
        companyName: `Seed ${i}`,
        contactName: 'Seed',
        email: `seed${i}@x.test`,
        source: 'WEBSITE' as const,
        status: 'LOST' as const,
        createdAt
      }))
    })

  it('stores nothing (but still answers the same 202) once the hourly cap is reached', async () => {
    await seedWebsiteLeads(ORG_HOURLY_CAP, new Date())

    const response = await submit(validPublicLead(key, { email: 'over@x.test' }))

    expect(response.statusCode).toBe(202)
    expect(body(response)).toEqual(SUCCESS)
    expect(await leadCount()).toBe(ORG_HOURLY_CAP)
  })

  it('still stores the last lead under the cap', async () => {
    await seedWebsiteLeads(ORG_HOURLY_CAP - 1, new Date())
    await submit(validPublicLead(key, { email: 'last@x.test' }))

    expect(await leadCount()).toBe(ORG_HOURLY_CAP)
  })

  it('does not count leads older than an hour', async () => {
    await seedWebsiteLeads(ORG_HOURLY_CAP, new Date(Date.now() - 61 * 60 * 1000))
    await submit(validPublicLead(key, { email: 'fresh@x.test' }))

    expect(await leadCount()).toBe(ORG_HOURLY_CAP + 1)
  })

  it('counts merged duplicates too', async () => {
    const existing = await t.prisma.lead.create({ data: { orgId, companyName: 'E', contactName: 'E', email: 'e@x.test', source: 'PHONE', ownerId: admin.id } })

    await t.prisma.leadActivity.createMany({
      data: Array.from({ length: ORG_HOURLY_CAP }, () => ({ leadId: existing.id, type: 'NOTE' as const, body: `${DUPLICATE_NOTE_TITLE}\nx` }))
    })
    await submit(validPublicLead(key, { email: 'e@x.test' }))

    expect(await t.prisma.leadActivity.count()).toBe(ORG_HOURLY_CAP)
  })

  it('is per organization: another org is unaffected', async () => {
    const other = await ensureOrg(t, 'Other Org')

    await seedWebsiteLeads(ORG_HOURLY_CAP, new Date())
    await createUser(t, { role: 'ADMIN', orgId: other.id })
    await submit(validPublicLead(other.leadIntakeKey, { email: 'other@x.test' }))

    expect(await t.prisma.lead.count({ where: { orgId: other.id } })).toBe(1)
  })
})
