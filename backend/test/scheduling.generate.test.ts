import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { toDateOnly } from '../src/lib/time.js'
import { body, client, createTestApp, ensureOrg, makeContract, makeSchedule, makeShift, makeSite, resetDb, signIn } from './helpers.js'
import type { TestApp } from './helpers.js'
import { buildOutsider, buildWorld } from './scheduling.helpers.js'
import type { World } from './scheduling.helpers.js'

let t: TestApp
let w: World

beforeAll(async () => {
  t = await createTestApp()
})

afterAll(() => t.close())

beforeEach(async () => {
  await resetDb(t.prisma)
  w = await buildWorld(t)
})

const request = (over: Record<string, unknown> = {}) => ({
  contractId: w.fixture.contract.id,
  siteId: w.fixture.site.id,
  periodStart: '2026-03-02',
  periodEnd: '2026-03-08',
  ...over
})

const generate = (over: Record<string, unknown> = {}, token = w.admin.token) => w.api.post('/v1/schedules/generate', { token, body: request(over) })

const shiftsOf = (scheduleId: string) => t.prisma.shift.findMany({ where: { scheduleId }, orderBy: { scheduledStart: 'asc' } })

describe('POST /v1/schedules/generate: access', () => {
  it('rejects anonymous callers with 401', async () => {
    const response = await w.api.post('/v1/schedules/generate', { body: request() })

    expect(response.statusCode).toBe(401)
  })

  it.each(['field', 'clientUser'] as const)('rejects %s with 403', async role => {
    const response = await generate({}, w[role].token)

    expect(response.statusCode).toBe(403)
    expect(body(response).error?.code).toBe('FORBIDDEN')
  })

  it('works for an admin and for a supervisor of the site', async () => {
    expect((await generate()).statusCode).toBe(201)

    await t.prisma.schedule.deleteMany()

    const response = await generate({}, w.supervisor.token)

    expect(response.statusCode).toBe(201)
    expect(body(response).data?.schedule.supervisorId).toBe(w.supervisor.user.id)
  })

  it('a supervisor without access to the site gets 404', async () => {
    const other = await signIn(t, 'SUPERVISOR')
    const response = await generate({}, other.token)

    expect(response.statusCode).toBe(404)
    expect(body(response).error?.code).toBe('NOT_FOUND')
  })

  it('another organization cannot see the contract or the site (404)', async () => {
    const outsider = await buildOutsider(t)

    expect((await generate({}, outsider.admin.token)).statusCode).toBe(404)
    expect((await generate({ siteId: outsider.fixture.site.id }, w.admin.token)).statusCode).toBe(404)
    expect((await generate({ contractId: outsider.fixture.contract.id, siteId: outsider.fixture.site.id }, w.admin.token)).statusCode).toBe(404)
  })
})

describe('POST /v1/schedules/generate: weekly coverage', () => {
  it('creates a DRAFT schedule with OPEN shifts from the coverage', async () => {
    const response = await generate()
    const data = body(response).data

    expect(response.statusCode).toBe(201)
    expect(data?.shiftCount).toBe(3)
    expect(data?.schedule).toMatchObject({
      status: 'DRAFT',
      periodStart: '2026-03-02',
      periodEnd: '2026-03-08',
      contractVersion: 1,
      siteId: w.fixture.site.id,
      coverage: { total: 3, open: 3, assigned: 0 },
      expectedVisits: null
    })

    const shifts = await shiftsOf(data?.schedule.id)

    expect(shifts.map(shift => [shift.scheduledStart.toISOString(), shift.scheduledEnd.toISOString()])).toEqual([
      ['2026-03-03T00:00:00.000Z', '2026-03-03T08:00:00.000Z'],
      ['2026-03-05T00:00:00.000Z', '2026-03-05T08:00:00.000Z'],
      ['2026-03-07T00:00:00.000Z', '2026-03-07T08:00:00.000Z']
    ])
    expect(shifts.every(shift => shift.status === 'OPEN' && shift.assignedUserId === null && shift.orgId === w.fixture.contract.orgId)).toBe(true)
    expect(shifts[0]).toMatchObject({ serviceRef: w.fixture.lines[0]?.id, createdById: w.admin.user.id })
    expect(shifts[0]?.billableQty?.toFixed(2)).toBe('1.00')
  })

  it('freezes the terms: a later contract change does not touch the snapshot', async () => {
    const schedule = body(await generate()).data?.schedule

    await t.prisma.contractLine.updateMany({ where: { contractId: w.fixture.contract.id }, data: { billRate: '999.00' } })

    const row = await t.prisma.schedule.findUniqueOrThrow({ where: { id: schedule.id } })

    expect(row.termsSnapshot).toMatchObject({
      contractId: w.fixture.contract.id,
      contractVersion: 1,
      siteTimezone: 'America/Chicago',
      serviceItems: [{ billRate: '145.00', payRate: '22.00' }]
    })
  })

  it('serialises the snapshot through the redaction rules for each viewer', async () => {
    const adminView = body(await generate()).data?.schedule.termsSnapshot

    await t.prisma.schedule.deleteMany()

    const supervisorView = body(await generate({}, w.supervisor.token)).data?.schedule.termsSnapshot

    expect(adminView.serviceItems[0]).toMatchObject({ billRate: '145.00', payRate: '22.00' })
    expect(supervisorView.serviceItems[0]).toMatchObject({ payRate: '22.00' })
    expect(supervisorView.serviceItems[0]).not.toHaveProperty('billRate')
  })

  it('writes a schedule.generated audit row with the counts', async () => {
    const schedule = body(await generate()).data?.schedule
    const audit = await t.prisma.auditEvent.findFirst({ where: { entity: 'schedule', entityId: schedule.id, action: 'generated' } })

    expect(audit).toMatchObject({ actorId: w.admin.user.id, orgId: w.fixture.contract.orgId })
    expect(audit?.diff).toMatchObject({ shiftCount: 3, periodStart: '2026-03-02', contractVersion: 1 })
  })

  it('leaves serviceRef and billableQty empty when the site has several lines', async () => {
    const fixture = await makeContract(t, { lines: [{ description: 'A' }, { description: 'B' }] })
    const response = await w.api.post('/v1/schedules/generate', { token: w.admin.token, body: request({ contractId: fixture.contract.id, siteId: fixture.site.id }) })
    const shifts = await shiftsOf(body(response).data?.schedule.id)

    expect(shifts[0]).toMatchObject({ serviceRef: null, billableQty: null })
  })

  it('does not set billableQty for hourly contracts', async () => {
    const fixture = await makeContract(t, { billingType: 'HOURLY' })
    const response = await w.api.post('/v1/schedules/generate', { token: w.admin.token, body: request({ contractId: fixture.contract.id, siteId: fixture.site.id }) })
    const shifts = await shiftsOf(body(response).data?.schedule.id)

    expect(shifts[0]?.serviceRef).toBe(fixture.lines[0]?.id)
    expect(shifts[0]?.billableQty).toBeNull()
  })
})

describe('POST /v1/schedules/generate: time zones and DST', () => {
  it('generates across the spring-forward day with a constant wall clock in the site zone', async () => {
    const fixture = await makeContract(t, { coverage: [{ weekdays: [1, 2, 3, 4, 5, 6, 7], timeStart: '18:00', timeEnd: '23:00' }] })
    const response = await w.api.post('/v1/schedules/generate', { token: w.admin.token, body: request({ contractId: fixture.contract.id, siteId: fixture.site.id, periodStart: '2026-03-07', periodEnd: '2026-03-09' }) })
    const shifts = await shiftsOf(body(response).data?.schedule.id)

    expect(shifts.map(shift => shift.scheduledStart.toISOString())).toEqual(['2026-03-08T00:00:00.000Z', '2026-03-08T23:00:00.000Z', '2026-03-09T23:00:00.000Z'])
  })

  it('generates across the fall-back day (2026-11-01) with a shift ending after midnight', async () => {
    const response = await generate({ periodStart: '2026-10-31', periodEnd: '2026-11-01' })

    expect(body(response).error).toBeNull()

    // Mon/Wed/Fri coverage: nothing on Sat/Sun, so use every day
    const fixture = await makeContract(t, { coverage: [{ weekdays: [1, 2, 3, 4, 5, 6, 7], timeStart: '18:00', timeEnd: '02:00' }] })
    const every = await w.api.post('/v1/schedules/generate', { token: w.admin.token, body: request({ contractId: fixture.contract.id, siteId: fixture.site.id, periodStart: '2026-10-31', periodEnd: '2026-11-01' }) })
    const shifts = await shiftsOf(body(every).data?.schedule.id)

    expect(shifts.map(shift => [shift.scheduledStart.toISOString(), shift.scheduledEnd.toISOString()])).toEqual([
      ['2026-10-31T23:00:00.000Z', '2026-11-01T08:00:00.000Z'],
      ['2026-11-02T00:00:00.000Z', '2026-11-02T08:00:00.000Z']
    ])
  })

  it("uses the site's own timezone, not the organization's", async () => {
    const site = await makeSite(t, { clientId: w.fixture.client.id, timezone: 'America/Los_Angeles' })
    const fixture = await makeContract(t, { client: w.fixture.client, site })
    const response = await w.api.post('/v1/schedules/generate', { token: w.admin.token, body: request({ contractId: fixture.contract.id, siteId: site.id }) })
    const shifts = await shiftsOf(body(response).data?.schedule.id)

    // Mon 18:00 PST = Tue 02:00Z
    expect(shifts[0]?.scheduledStart.toISOString()).toBe('2026-03-03T02:00:00.000Z')
    expect(body(response).data?.schedule.termsSnapshot.siteTimezone).toBe('America/Los_Angeles')
  })

  it('falls back to the organization timezone when the site has none', async () => {
    await t.prisma.organization.update({ where: { id: w.fixture.contract.orgId }, data: { timezone: 'America/New_York' } })

    const site = await makeSite(t, { clientId: w.fixture.client.id, timezone: null })
    const fixture = await makeContract(t, { client: w.fixture.client, site })
    const response = await w.api.post('/v1/schedules/generate', { token: w.admin.token, body: request({ contractId: fixture.contract.id, siteId: site.id }) })
    const shifts = await shiftsOf(body(response).data?.schedule.id)

    // Mon 18:00 EST = 23:00Z
    expect(shifts[0]?.scheduledStart.toISOString()).toBe('2026-03-02T23:00:00.000Z')
  })
})

describe('POST /v1/schedules/generate: period rules', () => {
  it('clamps the period to the contract end date', async () => {
    const fixture = await makeContract(t, { endDate: '2026-03-04' })
    const response = await w.api.post('/v1/schedules/generate', { token: w.admin.token, body: request({ contractId: fixture.contract.id, siteId: fixture.site.id }) })
    const schedule = body(response).data?.schedule

    expect(response.statusCode).toBe(201)
    expect(schedule).toMatchObject({ periodStart: '2026-03-02', periodEnd: '2026-03-04' })
    expect(body(response).data?.shiftCount).toBe(2)
  })

  it('clamps the period to the contract start date', async () => {
    const fixture = await makeContract(t, { startDate: '2026-03-04' })
    const response = await w.api.post('/v1/schedules/generate', { token: w.admin.token, body: request({ contractId: fixture.contract.id, siteId: fixture.site.id }) })

    expect(body(response).data?.schedule).toMatchObject({ periodStart: '2026-03-04', periodEnd: '2026-03-08' })
    expect(body(response).data?.shiftCount).toBe(2)
  })

  it('refuses a period the contract does not cover at all', async () => {
    const fixture = await makeContract(t, { endDate: '2026-02-28' })
    const response = await w.api.post('/v1/schedules/generate', { token: w.admin.token, body: request({ contractId: fixture.contract.id, siteId: fixture.site.id }) })

    expect(response.statusCode).toBe(422)
    expect(body(response).error?.code).toBe('UNPROCESSABLE')
  })

  it('accepts exactly 93 days and refuses 94', async () => {
    expect((await generate({ periodStart: '2026-03-01', periodEnd: '2026-06-01' })).statusCode).toBe(201)

    await t.prisma.schedule.deleteMany()

    const response = await generate({ periodStart: '2026-03-01', periodEnd: '2026-06-02' })

    expect(response.statusCode).toBe(400)
    expect(body(response).error?.details?.issues[0]).toMatchObject({ field: 'periodEnd', code: 'too_long' })
  })

  it('refuses a period that ends before it starts', async () => {
    const response = await generate({ periodStart: '2026-03-08', periodEnd: '2026-03-02' })

    expect(response.statusCode).toBe(400)
    expect(body(response).error?.details?.issues[0]?.field).toBe('periodEnd')
  })

  it.each([
    ['a suspended contract', 'SUSPENDED'],
    ['a draft contract', 'DRAFT'],
    ['an expired contract', 'EXPIRED']
  ] as const)('refuses %s with CONTRACT_NOT_ACTIVE', async (_label, status) => {
    const fixture = await makeContract(t, { status })
    const response = await w.api.post('/v1/schedules/generate', { token: w.admin.token, body: request({ contractId: fixture.contract.id, siteId: fixture.site.id }) })

    expect(response.statusCode).toBe(409)
    expect(body(response).error?.code).toBe('CONTRACT_NOT_ACTIVE')
  })

  it('refuses a site the contract has no lines or coverage for', async () => {
    const otherSite = await makeSite(t, { clientId: w.fixture.client.id })
    const response = await generate({ siteId: otherSite.id })

    expect(response.statusCode).toBe(422)
  })
})

describe('POST /v1/schedules/generate: overlap', () => {
  it('refuses an overlapping schedule for the same contract number and site, naming the existing one', async () => {
    const first = body(await generate()).data?.schedule
    const response = await generate({ periodStart: '2026-03-08', periodEnd: '2026-03-14' })

    expect(response.statusCode).toBe(409)
    expect(body(response).error?.code).toBe('SCHEDULE_OVERLAP')
    expect(body(response).error?.details?.context).toEqual({ scheduleId: first.id })
  })

  it('allows the day after the existing period', async () => {
    await generate()

    expect((await generate({ periodStart: '2026-03-09', periodEnd: '2026-03-15' })).statusCode).toBe(201)
  })

  it('a CLOSED schedule no longer blocks generation', async () => {
    const first = body(await generate()).data?.schedule

    await t.prisma.schedule.update({ where: { id: first.id }, data: { status: 'CLOSED' } })

    expect((await generate()).statusCode).toBe(201)
  })

  it('applies across contract versions of the same number', async () => {
    await generate()

    const v2 = await makeContract(t, { client: w.fixture.client, site: w.fixture.site, contractNumber: w.fixture.contract.contractNumber, version: 2, supersedesContractId: w.fixture.contract.id })
    const response = await generate({ contractId: v2.contract.id })

    expect(response.statusCode).toBe(409)
    expect(body(response).error?.code).toBe('SCHEDULE_OVERLAP')
  })

  it('does not apply to a different contract number at the same site', async () => {
    await generate()

    const other = await makeContract(t, { client: w.fixture.client, site: w.fixture.site })

    expect((await generate({ contractId: other.contract.id })).statusCode).toBe(201)
  })

  it('two simultaneous requests for the same period: exactly one wins', async () => {
    const responses = await Promise.all([generate(), generate(), generate()])
    const codes = responses.map(response => response.statusCode).sort()

    expect(codes).toEqual([201, 409, 409])
    expect(await t.prisma.schedule.count()).toBe(1)
    expect(await t.prisma.shift.count()).toBe(3)
  })
})

describe('POST /v1/schedules/generate: INTERVAL and AD_HOC', () => {
  it('counts INTERVAL visits from the latest earlier non-cancelled shift of that contract number and site', async () => {
    const fixture = await makeContract(t, { coverage: [{ patternType: 'INTERVAL', intervalDays: 5 }] })
    const earlier = await makeSchedule(t, fixture, { status: 'CLOSED', periodStart: '2026-02-20', periodEnd: '2026-03-04' })

    // 09:00 CST on Mon Mar 2 is the anchor; a later cancelled shift must be ignored
    await makeShift(t, earlier, { start: '2026-03-02T15:00:00.000Z', end: '2026-03-02T23:00:00.000Z', status: 'COMPLETED' })
    await makeShift(t, earlier, { start: '2026-03-04T15:00:00.000Z', end: '2026-03-04T23:00:00.000Z', status: 'CANCELLED' })

    const response = await w.api.post('/v1/schedules/generate', { token: w.admin.token, body: request({ contractId: fixture.contract.id, siteId: fixture.site.id, periodStart: '2026-03-05', periodEnd: '2026-03-20' }) })
    const shifts = await shiftsOf(body(response).data?.schedule.id)

    expect(shifts.map(shift => shift.scheduledStart.toISOString())).toEqual(['2026-03-07T15:00:00.000Z', '2026-03-12T14:00:00.000Z', '2026-03-17T14:00:00.000Z'])
    expect(shifts[0]?.scheduledEnd.toISOString()).toBe('2026-03-07T23:00:00.000Z')
  })

  it('counts INTERVAL visits from the contract start date when there are no earlier shifts', async () => {
    const fixture = await makeContract(t, { coverage: [{ patternType: 'INTERVAL', intervalDays: 5 }] })
    const response = await w.api.post('/v1/schedules/generate', { token: w.admin.token, body: request({ contractId: fixture.contract.id, siteId: fixture.site.id, periodStart: '2026-03-01', periodEnd: '2026-03-15' }) })
    const shifts = await shiftsOf(body(response).data?.schedule.id)

    expect(shifts.map(shift => shift.scheduledStart.toISOString().slice(0, 10))).toEqual(['2026-03-02', '2026-03-07', '2026-03-12'])
  })

  it('AD_HOC generates no shifts and reports the expected visit count', async () => {
    const fixture = await makeContract(t, { coverage: [{ patternType: 'AD_HOC', visitsPerPeriod: 4 }] })
    const response = await w.api.post('/v1/schedules/generate', { token: w.admin.token, body: request({ contractId: fixture.contract.id, siteId: fixture.site.id }) })

    expect(response.statusCode).toBe(201)
    expect(body(response).data?.shiftCount).toBe(0)
    expect(body(response).data?.schedule.expectedVisits).toBe(4)
    expect(await t.prisma.shift.count()).toBe(0)
  })
})

describe('POST /v1/schedules/generate: validation', () => {
  it.each([
    ['an unknown field', { extra: 1 }],
    ['a bad contract id', { contractId: 'nope' }],
    ['a bad site id', { siteId: 'nope' }],
    ['a bad date', { periodStart: '2026-02-30' }],
    ['a date with the wrong format', { periodEnd: '03/08/2026' }],
    ['a bad supervisor id', { supervisorId: 'nope' }]
  ])('rejects %s with 400', async (_label, over) => {
    const response = await generate(over)

    expect(response.statusCode).toBe(400)
    expect(body(response).error?.code).toBe('VALIDATION_ERROR')
  })

  it('rejects a missing field', async () => {
    const response = await w.api.post('/v1/schedules/generate', { token: w.admin.token, body: { contractId: w.fixture.contract.id } })

    expect(response.statusCode).toBe(400)
  })

  it('accepts an active supervisor as the schedule supervisor and refuses a field user or a stranger', async () => {
    const ok = await generate({ supervisorId: w.supervisor.user.id })

    expect(body(ok).data?.schedule.supervisorId).toBe(w.supervisor.user.id)

    await t.prisma.schedule.deleteMany()

    expect((await generate({ supervisorId: w.field.user.id })).statusCode).toBe(400)

    const outsider = await buildOutsider(t)

    expect((await generate({ supervisorId: outsider.admin.user.id })).statusCode).toBe(400)
  })
})

describe('POST /v1/schedules/:id/regenerate', () => {
  const contractVersion2 = async () => {
    const v2 = await makeContract(t, {
      client: w.fixture.client,
      site: w.fixture.site,
      contractNumber: w.fixture.contract.contractNumber,
      version: 2,
      supersedesContractId: w.fixture.contract.id,
      lines: [{ billRate: '200.00', payRate: '30.00' }],
      coverage: [{ weekdays: [2, 4], timeStart: '08:00', timeEnd: '12:00' }]
    })

    await t.prisma.contract.update({ where: { id: w.fixture.contract.id }, data: { status: 'EXPIRED' } })

    return v2
  }

  it('re-snapshots from the latest ACTIVE version and rebuilds every shift', async () => {
    const schedule = body(await generate()).data?.schedule
    const [first] = await shiftsOf(schedule.id)

    await t.prisma.shift.update({ where: { id: first?.id }, data: { assignedUserId: w.field.user.id, status: 'ASSIGNED' } })

    const v2 = await contractVersion2()
    const response = await w.api.post(`/v1/schedules/${schedule.id}/regenerate`, { token: w.admin.token })

    expect(response.statusCode).toBe(200)
    expect(body(response).data).toMatchObject({ shiftCount: 2, schedule: { id: schedule.id, contractId: v2.contract.id, contractVersion: 2, status: 'DRAFT' } })
    expect(body(response).data?.schedule.termsSnapshot.serviceItems[0]).toMatchObject({ billRate: '200.00', payRate: '30.00' })

    const shifts = await shiftsOf(schedule.id)

    expect(shifts).toHaveLength(2)
    expect(shifts.every(shift => shift.status === 'OPEN' && shift.assignedUserId === null)).toBe(true)
    expect(shifts[0]?.scheduledStart.toISOString()).toBe('2026-03-03T14:00:00.000Z')

    const audit = await t.prisma.auditEvent.findFirst({ where: { entityId: schedule.id, action: 'regenerated' } })

    expect(audit?.diff).toMatchObject({ fromVersion: 1, toVersion: 2, shiftsRemoved: 3, assignmentsDiscarded: 1, shiftCount: 2 })
  })

  it('works on a schedule with no newer version (same terms, fresh shifts)', async () => {
    const schedule = body(await generate()).data?.schedule
    const response = await w.api.post(`/v1/schedules/${schedule.id}/regenerate`, { token: w.admin.token })

    expect(response.statusCode).toBe(200)
    expect(body(response).data?.shiftCount).toBe(3)
  })

  it('is refused unless the schedule is DRAFT', async () => {
    const schedule = await makeSchedule(t, w.fixture, { status: 'PUBLISHED' })
    const response = await w.api.post(`/v1/schedules/${schedule.id}/regenerate`, { token: w.admin.token })

    expect(response.statusCode).toBe(409)
    expect(body(response).error?.code).toBe('INVALID_STATE')
  })

  it('needs an ACTIVE version of the contract', async () => {
    const schedule = body(await generate()).data?.schedule

    await t.prisma.contract.update({ where: { id: w.fixture.contract.id }, data: { status: 'SUSPENDED' } })

    const response = await w.api.post(`/v1/schedules/${schedule.id}/regenerate`, { token: w.admin.token })

    expect(response.statusCode).toBe(409)
    expect(body(response).error?.code).toBe('CONTRACT_NOT_ACTIVE')
  })

  it('clamps to the new version dates and can leave nothing to generate', async () => {
    const schedule = body(await generate()).data?.schedule

    await t.prisma.contract.update({ where: { id: w.fixture.contract.id }, data: { endDate: toDateOnly('2026-03-03') } })

    const response = await w.api.post(`/v1/schedules/${schedule.id}/regenerate`, { token: w.admin.token })

    expect(body(response).data?.schedule).toMatchObject({ periodEnd: '2026-03-03' })
    expect(body(response).data?.shiftCount).toBe(1)
  })

  it('enforces roles, scope and tenancy', async () => {
    const schedule = body(await generate()).data?.schedule
    const strangerSupervisor = await signIn(t, 'SUPERVISOR')
    const outsider = await buildOutsider(t)

    expect((await w.api.post(`/v1/schedules/${schedule.id}/regenerate`)).statusCode).toBe(401)
    expect((await w.api.post(`/v1/schedules/${schedule.id}/regenerate`, { token: w.field.token })).statusCode).toBe(403)
    expect((await w.api.post(`/v1/schedules/${schedule.id}/regenerate`, { token: strangerSupervisor.token })).statusCode).toBe(404)
    expect((await w.api.post(`/v1/schedules/${schedule.id}/regenerate`, { token: outsider.admin.token })).statusCode).toBe(404)
    expect((await w.api.post('/v1/schedules/not-a-uuid/regenerate', { token: w.admin.token })).statusCode).toBe(400)
    expect((await w.api.post(`/v1/schedules/${schedule.id}/regenerate`, { token: w.supervisor.token })).statusCode).toBe(200)
  })

  it('rejects a body with unknown fields', async () => {
    const schedule = body(await generate()).data?.schedule

    expect((await w.api.post(`/v1/schedules/${schedule.id}/regenerate`, { token: w.admin.token, body: { force: true } })).statusCode).toBe(400)
  })
})

it('ensureOrg gives the same org to every factory (sanity for the fixtures above)', async () => {
  expect((await ensureOrg(t)).id).toBe(w.fixture.contract.orgId)
  expect(client(t.app)).toBeDefined()
})
