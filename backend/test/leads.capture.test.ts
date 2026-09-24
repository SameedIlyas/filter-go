// THROWAWAY: captures real responses for docs/modules/leads.md. Deleted after use.
import { writeFileSync } from 'node:fs'

import { afterAll, beforeAll, expect, it } from 'vitest'

import { body, client, createTestApp, createUser, ensureOrg, loginAs, makeFile, makeService, resetDb } from './helpers.js'
import type { TestApp } from './helpers.js'

const OUT = process.env.CAPTURE_OUT as string
const samples: Record<string, unknown> = {}

let t: TestApp

beforeAll(async () => {
  t = await createTestApp({ PUBLIC_LEAD_ORIGINS: 'https://www.example-site.com' })
})

afterAll(async () => {
  writeFileSync(OUT, JSON.stringify(samples, null, 2))
  await t.close()
})

it('captures', async () => {
  await resetDb(t.prisma)
  const org = await ensureOrg(t)
  const admin = await createUser(t, { role: 'ADMIN', email: 'admin@acme.test', name: 'Alice Admin' })
  const sup = await createUser(t, { role: 'SUPERVISOR', email: 'sam@acme.test', name: 'Sam Supervisor' })
  const field = await createUser(t, { role: 'FIELD_USER', email: 'field@acme.test' })
  const adminToken = await loginAs(t, admin.email)
  const supToken = await loginAs(t, sup.email)
  const fieldToken = await loginAs(t, field.email)
  const api = client(t.app)
  const cap = async (name: string, response: Awaited<ReturnType<ReturnType<typeof client>['get']>>, extra: Record<string, unknown> = {}) => {
    samples[name] = { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null, ...extra }
  }

  const form = {
    orgKey: org.leadIntakeKey,
    companyName: 'Northwind Foods',
    contactName: 'Ana Reyes',
    email: 'ana@northwind.example',
    phone: '(555) 010-2030',
    address: '12 Main St, Springfield',
    serviceInterest: 'Weekly hood filter changes',
    message: 'We run two kitchens and need weekly filter changes.',
    sourceUrl: 'https://www.example-site.com/contact',
    utm: { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'spring-filters' },
    website: ''
  }

  samples.publicRequest = form
  await cap('publicOk', await api.post('/public/leads', { body: form, ip: '203.0.113.5' }))
  await cap('publicHoneypot', await api.post('/public/leads', { body: { ...form, website: 'http://spam.example' }, ip: '203.0.113.5' }))
  await cap('publicUnknownKey', await api.post('/public/leads', { body: { ...form, orgKey: 'wrong' }, ip: '203.0.113.5' }))
  await cap('publicValidation', await api.post('/public/leads', { body: { orgKey: org.leadIntakeKey, companyName: '', contactName: 'A', email: 'nope', utm: { a: 'x'.repeat(201) } }, ip: '203.0.113.5' }))
  await cap('publicUnknownField', await api.post('/public/leads', { body: { ...form, role: 'ADMIN' }, ip: '203.0.113.5' }))

  const preflight = await t.app.inject({
    method: 'OPTIONS',
    url: '/public/leads',
    headers: { origin: 'https://www.example-site.com', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' }
  })

  samples.publicPreflight = { status: preflight.statusCode, headers: preflight.headers }

  const post = await api.post('/public/leads', { body: { ...form, email: 'other@northwind.example', phone: '' }, headers: { origin: 'https://www.example-site.com' }, ip: '203.0.113.6' })

  samples.publicCorsHeaders = { status: post.statusCode, allowOrigin: post.headers['access-control-allow-origin'], vary: post.headers.vary }

  const limited = await createTestApp({ RATE_LIMIT_ENABLED: 'true', RATE_LIMIT_MAX_PER_MINUTE: '1000' })
  let last: Awaited<ReturnType<ReturnType<typeof client>['get']>> | undefined

  for (let n = 0; n < 6; n += 1) {
    last = await client(limited.app).post('/public/leads', { body: { ...form, orgKey: 'x' }, ip: '203.0.113.9' })
  }

  await cap('publicRateLimited', last as NonNullable<typeof last>, { headers: { 'retry-after': (last as NonNullable<typeof last>).headers['retry-after'] } })
  await limited.close()

  // duplicate submission
  await api.post('/public/leads', { body: { ...form, message: 'Following up: can someone call me?' }, ip: '203.0.113.7' })
  await t.ctx.background.flush()

  const lead = await t.prisma.lead.findFirstOrThrow({ where: { email: 'ana@northwind.example' } })

  await cap('list', await api.get('/v1/leads', { token: adminToken, query: { status: 'NEW', q: 'north' } }))
  await cap('detail', await api.get(`/v1/leads/${lead.id}`, { token: adminToken }))
  await cap('create', await api.post('/v1/leads', { token: supToken, body: { companyName: 'Blue Bay Diner', contactName: 'Bo Lin', email: 'bo@bluebay.example', phone: '555-777-8888', source: 'REFERRAL', serviceInterest: 'Monthly grease trap service' } }))
  await cap('createDuplicate', await api.post('/v1/leads', { token: adminToken, body: { companyName: 'Northwind again', contactName: 'Ana', email: 'ANA@northwind.example' } }))
  await cap('patch', await api.patch(`/v1/leads/${lead.id}`, { token: adminToken, body: { ownerId: sup.id, contactName: 'Ana Reyes-Lopez' } }))
  await cap('listSupervisor', await api.get('/v1/leads', { token: supToken }))
  await cap('patchForbiddenReassign', await api.patch(`/v1/leads/${lead.id}`, { token: supToken, body: { ownerId: admin.id } }))
  await cap('activityCall', await api.post(`/v1/leads/${lead.id}/activities`, { token: supToken, body: { type: 'CALL', body: 'Spoke to Ana, wants a site visit next Tuesday.' } }))
  await cap('activities', await api.get(`/v1/leads/${lead.id}/activities`, { token: supToken, query: { limit: '5' } }))

  const service = await makeService(t, { name: 'Hood filter change' })
  const photo = await makeFile(t, { name: 'kitchen.jpg' })

  await cap(
    'surveyCreate',
    await api.post(`/v1/leads/${lead.id}/surveys`, {
      token: supToken,
      body: {
        address: '12 Main St, Springfield',
        units: [
          { name: 'Kitchen hood (line 1)', serviceId: service.id, qty: 3, estMinutes: 45 },
          { name: 'Rooftop exhaust fan', qty: '1.5', estMinutes: 30, notes: 'Needs a ladder' }
        ],
        accessNotes: 'Check in with the manager. Service door at the back.',
        photoFileIds: [photo.id]
      }
    })
  )

  const survey = await t.prisma.leadSiteSurvey.findFirstOrThrow({ where: { leadId: lead.id } })

  await cap('surveyPut', await api.put(`/v1/leads/${lead.id}/surveys/${survey.id}`, { token: supToken, body: { address: '12 Main St, Springfield', units: [{ name: 'Kitchen hood (line 1)', serviceId: service.id, qty: 4, estMinutes: 45 }] } }))
  await cap('surveyCreate2', await api.post(`/v1/leads/${lead.id}/surveys`, { token: supToken, body: { address: '99 Elm Avenue, Springfield', units: [{ name: 'Dining room unit', qty: 2 }] } }))
  const second = await t.prisma.leadSiteSurvey.findFirstOrThrow({ where: { leadId: lead.id, address: { startsWith: '99' } } })

  await cap('surveyDelete', await api.delete(`/v1/leads/${lead.id}/surveys/${second.id}`, { token: supToken }))
  await cap('surveyInvalid', await api.post(`/v1/leads/${lead.id}/surveys`, { token: supToken, body: { address: 'x', units: [{ name: 'Unit', qty: 0 }] } }))

  await cap('statusQualified', await api.post(`/v1/leads/${lead.id}/status`, { token: supToken, body: { status: 'QUALIFIED' } }))
  await cap('statusWonRefused', await api.post(`/v1/leads/${lead.id}/status`, { token: adminToken, body: { status: 'WON' } }))
  await cap('statusLostNeedsReason', await api.post(`/v1/leads/${lead.id}/status`, { token: adminToken, body: { status: 'LOST' } }))
  await cap('convert', await api.post(`/v1/leads/${lead.id}/convert`, { token: adminToken, body: { billingType: 'PER_VISIT', billingCycle: 'MONTHLY', startDate: '2026-11-02', paymentTerms: 'NET30' } }))
  await cap('convertAgain', await api.post(`/v1/leads/${lead.id}/convert`, { token: adminToken, body: { billingType: 'PER_VISIT', billingCycle: 'MONTHLY', startDate: '2026-11-02' } }))
  await cap('convertForbidden', await api.post(`/v1/leads/${lead.id}/convert`, { token: supToken, body: {} }))
  await cap('detailConverted', await api.get(`/v1/leads/${lead.id}`, { token: adminToken }))
  await cap('unauthenticated', await api.get('/v1/leads'))
  await cap('forbiddenField', await api.get('/v1/leads', { token: fieldToken }))
  await cap('notFound', await api.get('/v1/leads/00000000-0000-4000-8000-000000000000', { token: adminToken }))

  const contract = await t.prisma.contract.findFirstOrThrow({ include: { lines: true } })

  samples.contractDraft = { contractNumber: contract.contractNumber, status: contract.status, leadId: contract.leadId, lines: contract.lines.map(line => ({ description: line.description, qty: line.qty.toFixed(2), billRate: line.billRate.toFixed(2), payRate: line.payRate, estMinutes: line.estMinutes })) }
  samples.notifications = (await t.prisma.notification.findMany({ orderBy: { createdAt: 'asc' } })).map(n => ({ type: n.type, title: n.title, body: n.body, userId: n.userId === admin.id ? 'admin' : 'supervisor' }))
  samples.mail = t.mailer.sent.map(m => ({ to: m.to, subject: m.subject, text: m.text }))
  samples.audit = (await t.prisma.auditEvent.findMany({ where: { entity: 'lead' }, orderBy: { createdAt: 'asc' } })).map(a => a.type)
  expect(samples.publicOk).toBeTruthy()
  expect(body).toBeTruthy()
})
