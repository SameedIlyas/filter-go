import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { body, createTestApp, makeSchedule, makeShift, makeTimesheet, resetDb, signIn } from './helpers.js'
import type { TestApp } from './helpers.js'
import { addFieldUser, buildOutsider, buildWorld, draftSchedule, publishedSchedule } from './scheduling.helpers.js'
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

const auditActions = async (entityId: string) => (await t.prisma.auditEvent.findMany({ where: { entityId }, orderBy: { createdAt: 'asc' } })).map(row => row.action)

describe('GET /v1/schedules and /v1/schedules/:id: visibility', () => {
  it('requires a session', async () => {
    const schedule = await publishedSchedule(w)

    expect((await w.api.get('/v1/schedules')).statusCode).toBe(401)
    expect((await w.api.get(`/v1/schedules/${schedule.id}`)).statusCode).toBe(401)
  })

  it('a DRAFT schedule is visible to staff only: field users and clients get 404 and lists exclude it', async () => {
    const draft = await draftSchedule(w)

    for (const person of [w.admin, w.supervisor]) {
      expect((await w.api.get(`/v1/schedules/${draft.id}`, { token: person.token })).statusCode).toBe(200)
      expect(body(await w.api.get('/v1/schedules', { token: person.token })).data?.schedules).toHaveLength(1)
    }

    for (const person of [w.field, w.clientUser]) {
      const response = await w.api.get(`/v1/schedules/${draft.id}`, { token: person.token })

      expect(response.statusCode).toBe(404)
      expect(body(response).error).toMatchObject({ code: 'NOT_FOUND', details: { entity: 'schedule' } })
      expect(body(await w.api.get('/v1/schedules', { token: person.token })).data?.schedules).toEqual([])
    }
  })

  it.each(['PUBLISHED', 'LOCKED', 'CLOSED'] as const)('a %s schedule is visible to the field user and the client user', async status => {
    const schedule = await publishedSchedule(w, { status })

    for (const person of [w.field, w.clientUser, w.supervisor, w.admin]) {
      expect((await w.api.get(`/v1/schedules/${schedule.id}`, { token: person.token })).statusCode).toBe(200)
    }
  })

  it('a supervisor only sees schedules at their own sites', async () => {
    await publishedSchedule(w)

    const otherFixture = await buildOutsiderSite()
    const other = await makeSchedule(t, otherFixture, { status: 'PUBLISHED' })

    const list = body(await w.api.get('/v1/schedules', { token: w.supervisor.token })).data?.schedules

    expect(list).toHaveLength(1)
    expect((await w.api.get(`/v1/schedules/${other.id}`, { token: w.supervisor.token })).statusCode).toBe(404)
    expect(body(await w.api.get('/v1/schedules', { token: w.admin.token })).data?.schedules).toHaveLength(2)
  })

  it("a client only sees schedules at their own client's sites", async () => {
    await publishedSchedule(w)
    await makeSchedule(t, await buildOutsiderSite(), { status: 'PUBLISHED' })

    expect(body(await w.api.get('/v1/schedules', { token: w.clientUser.token })).data?.schedules).toHaveLength(1)
  })

  it('a field user only sees schedules at sites they can work at (or where they hold a shift)', async () => {
    const mine = await publishedSchedule(w)
    const elsewhere = await makeSchedule(t, await buildOutsiderSite(), { status: 'PUBLISHED' })

    expect(body(await w.api.get('/v1/schedules', { token: w.field.token })).data?.schedules.map((s: { id: string }) => s.id)).toEqual([mine.id])
    expect((await w.api.get(`/v1/schedules/${elsewhere.id}`, { token: w.field.token })).statusCode).toBe(404)

    await makeShift(t, elsewhere, { assignedUserId: w.field.user.id })

    expect((await w.api.get(`/v1/schedules/${elsewhere.id}`, { token: w.field.token })).statusCode).toBe(200)
  })

  it('another organization gets 404', async () => {
    const schedule = await publishedSchedule(w)
    const outsider = await buildOutsider(t)

    expect((await w.api.get(`/v1/schedules/${schedule.id}`, { token: outsider.admin.token })).statusCode).toBe(404)
    expect(body(await w.api.get('/v1/schedules', { token: outsider.admin.token })).data?.schedules).toEqual([])
  })

  it('rejects a malformed id and unknown query fields with 400', async () => {
    expect((await w.api.get('/v1/schedules/nope', { token: w.admin.token })).statusCode).toBe(400)
    expect((await w.api.get('/v1/schedules', { token: w.admin.token, query: { bogus: '1' } })).statusCode).toBe(400)
    expect((await w.api.get('/v1/schedules', { token: w.admin.token, query: { status: 'NOPE' } })).statusCode).toBe(400)
  })
})

/** A second site (same org, different client) that neither the supervisor nor the field user can access. */
const buildOutsiderSite = async () => {
  const { makeContract } = await import('./helpers.js')

  return makeContract(t, { orgId: w.fixture.contract.orgId })
}

describe('schedule serialisation and redaction', () => {
  it('shows rates by role in the snapshot and no snapshot at all to a client user', async () => {
    const schedule = await publishedSchedule(w)
    const view = async (token: string) => body(await w.api.get(`/v1/schedules/${schedule.id}`, { token })).data?.schedule

    expect((await view(w.admin.token)).termsSnapshot.serviceItems[0]).toMatchObject({ billRate: '145.00', payRate: '22.00' })

    const supervisorItem = (await view(w.supervisor.token)).termsSnapshot.serviceItems[0]

    expect(supervisorItem.payRate).toBe('22.00')
    expect(supervisorItem).not.toHaveProperty('billRate')

    const fieldView = await view(w.field.token)

    expect(fieldView.termsSnapshot.serviceItems[0]).not.toHaveProperty('billRate')
    expect(fieldView.termsSnapshot.serviceItems[0]).not.toHaveProperty('payRate')
    expect(fieldView).not.toHaveProperty('supervisorId')

    const clientView = await view(w.clientUser.token)

    expect(clientView).not.toHaveProperty('termsSnapshot')
    expect(JSON.stringify(clientView)).not.toMatch(/145|22\.00|billRate|payRate/)
  })

  it('never puts rates in a list response', async () => {
    await publishedSchedule(w)

    for (const person of [w.admin, w.supervisor, w.field, w.clientUser]) {
      const response = await w.api.get('/v1/schedules', { token: person.token })

      expect(response.body).not.toMatch(/billRate|payRate/)
    }
  })

  it('carries the coverage summary with a count per status', async () => {
    const schedule = await publishedSchedule(w)

    await makeShift(t, schedule, {})
    await makeShift(t, schedule, { assignedUserId: w.field.user.id, start: '2026-03-04T00:00:00.000Z', end: '2026-03-04T08:00:00.000Z' })
    await makeShift(t, schedule, { status: 'CONFIRMED', start: '2026-03-05T00:00:00.000Z', end: '2026-03-05T08:00:00.000Z' })
    await makeShift(t, schedule, { status: 'IN_PROGRESS', start: '2026-03-06T00:00:00.000Z', end: '2026-03-06T08:00:00.000Z' })
    await makeShift(t, schedule, { status: 'COMPLETED', start: '2026-03-07T00:00:00.000Z', end: '2026-03-07T08:00:00.000Z' })
    await makeShift(t, schedule, { status: 'NO_SHOW', start: '2026-03-08T00:00:00.000Z', end: '2026-03-08T08:00:00.000Z' })
    await makeShift(t, schedule, { status: 'CANCELLED', start: '2026-03-09T00:00:00.000Z', end: '2026-03-09T08:00:00.000Z' })

    const detail = body(await w.api.get(`/v1/schedules/${schedule.id}`, { token: w.admin.token })).data?.schedule

    expect(detail.coverage).toEqual({ total: 7, open: 1, assigned: 1, confirmed: 1, inProgress: 1, completed: 1, noShow: 1, cancelled: 1 })
    expect(detail).toMatchObject({ contractNumber: w.fixture.contract.contractNumber, site: { id: w.fixture.site.id } })
  })
})

describe('GET /v1/schedules: filters and paging', () => {
  it('filters by status, contract, site and period overlap, newest period first', async () => {
    const march = await publishedSchedule(w, { periodStart: '2026-03-02', periodEnd: '2026-03-08' })
    const april = await draftSchedule(w, { periodStart: '2026-04-06', periodEnd: '2026-04-12' })
    const otherContract = await buildOutsiderSite()

    await makeSchedule(t, otherContract, { status: 'DRAFT', periodStart: '2026-03-02', periodEnd: '2026-03-08' })

    const ids = async (query: Record<string, string>) => (body(await w.api.get('/v1/schedules', { token: w.admin.token, query })).data?.schedules as Array<{ id: string }>).map(schedule => schedule.id)

    expect(await ids({ status: 'DRAFT', contractId: w.fixture.contract.id })).toEqual([april.id])
    expect(await ids({ siteId: w.fixture.site.id })).toEqual([april.id, march.id])
    expect(await ids({ contractId: w.fixture.contract.id, from: '2026-03-08', to: '2026-03-20' })).toEqual([march.id])
    expect(await ids({ contractId: w.fixture.contract.id, from: '2026-03-09', to: '2026-04-05' })).toEqual([])
    expect(await ids({ contractId: w.fixture.contract.id, to: '2026-03-01' })).toEqual([])
  })

  it('pages with meta', async () => {
    for (const start of ['2026-03-02', '2026-04-06', '2026-05-04']) {
      await draftSchedule(w, { periodStart: start, periodEnd: start })
    }

    const response = await w.api.get('/v1/schedules', { token: w.admin.token, query: { limit: '2', page: '2' } })

    expect(body(response).data?.schedules).toHaveLength(1)
    expect(body(response).meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 })
  })
})

describe('schedule state machine', () => {
  const route = (id: string, action: string, token = w.admin.token) => w.api.post(`/v1/schedules/${id}/${action}`, { token })

  it('publish: DRAFT -> PUBLISHED sets publishedAt, audits, and is visible to field users afterwards', async () => {
    const schedule = await draftSchedule(w)
    const response = await route(schedule.id, 'publish')

    expect(response.statusCode).toBe(200)
    expect(body(response).data?.schedule).toMatchObject({ status: 'PUBLISHED' })
    expect(body(response).data?.schedule.publishedAt).not.toBeNull()
    expect(await auditActions(schedule.id)).toEqual(['published'])
    expect((await w.api.get(`/v1/schedules/${schedule.id}`, { token: w.field.token })).statusCode).toBe(200)
  })

  it('publish notifies each assignee once per schedule, and nobody else', async () => {
    const schedule = await draftSchedule(w)
    const second = await addFieldUser(w)

    await makeShift(t, schedule, { assignedUserId: w.field.user.id, start: '2026-03-03T00:00:00.000Z', end: '2026-03-03T08:00:00.000Z' })
    await makeShift(t, schedule, { assignedUserId: w.field.user.id, start: '2026-03-05T00:00:00.000Z', end: '2026-03-05T08:00:00.000Z' })
    await makeShift(t, schedule, { assignedUserId: second.user.id, status: 'CONFIRMED', start: '2026-03-04T00:00:00.000Z', end: '2026-03-04T08:00:00.000Z' })
    await makeShift(t, schedule, { start: '2026-03-06T00:00:00.000Z', end: '2026-03-06T08:00:00.000Z' })

    await route(schedule.id, 'publish')

    const notices = await t.prisma.notification.findMany({ where: { type: 'schedule.published' } })

    expect(notices.map(notice => notice.userId).sort()).toEqual([w.field.user.id, second.user.id].sort())
    expect(notices[0]).toMatchObject({ orgId: w.fixture.contract.orgId, title: 'Schedule published' })
    expect(notices[0]?.data).toMatchObject({ scheduleId: schedule.id })
    expect(t.mailer.sent).toHaveLength(0)
  })

  it('publish: a double-click / racing publishes apply once, the rest get INVALID_STATE', async () => {
    const schedule = await draftSchedule(w)

    await makeShift(t, schedule, { assignedUserId: w.field.user.id })

    const responses = await Promise.all([route(schedule.id, 'publish'), route(schedule.id, 'publish'), route(schedule.id, 'publish')])

    expect(responses.map(response => response.statusCode).sort()).toEqual([200, 409, 409])
    expect(await t.prisma.notification.count({ where: { type: 'schedule.published' } })).toBe(1)
    expect(await auditActions(schedule.id)).toEqual(['published'])
  })

  it('unpublish: PUBLISHED -> DRAFT while no shift has a timesheet entry, and it hides the schedule again', async () => {
    const schedule = await publishedSchedule(w)
    const response = await route(schedule.id, 'unpublish')

    expect(body(response).data?.schedule).toMatchObject({ status: 'DRAFT', publishedAt: null })
    expect((await w.api.get(`/v1/schedules/${schedule.id}`, { token: w.field.token })).statusCode).toBe(404)
    expect(await auditActions(schedule.id)).toEqual(['unpublished'])
  })

  it('unpublish is refused once any shift has a timesheet entry', async () => {
    const schedule = await publishedSchedule(w)
    const shift = await makeShift(t, schedule, { assignedUserId: w.field.user.id, status: 'COMPLETED' })

    await makeTimesheet(t, shift, w.field.user)

    const response = await route(schedule.id, 'unpublish')

    expect(response.statusCode).toBe(409)
    expect(body(response).error).toMatchObject({ code: 'INVALID_STATE', details: { entity: 'schedule', from: 'PUBLISHED', to: 'DRAFT', allowed: ['LOCKED'], context: { shiftsWithTimesheets: 1 } } })
    expect((await t.prisma.schedule.findUniqueOrThrow({ where: { id: schedule.id } })).status).toBe('PUBLISHED')
  })

  it('lock: PUBLISHED -> LOCKED sets lockedAt', async () => {
    const schedule = await publishedSchedule(w)
    const response = await route(schedule.id, 'lock')

    expect(body(response).data?.schedule).toMatchObject({ status: 'LOCKED' })
    expect(body(response).data?.schedule.lockedAt).not.toBeNull()
  })

  it('close: LOCKED -> CLOSED when every shift is terminal (an empty schedule counts)', async () => {
    const schedule = await publishedSchedule(w, { status: 'LOCKED' })

    await makeShift(t, schedule, { status: 'COMPLETED' })
    await makeShift(t, schedule, { status: 'NO_SHOW', start: '2026-03-04T00:00:00.000Z', end: '2026-03-04T08:00:00.000Z' })
    await makeShift(t, schedule, { status: 'CANCELLED', start: '2026-03-05T00:00:00.000Z', end: '2026-03-05T08:00:00.000Z' })

    const response = await route(schedule.id, 'close')

    expect(body(response).data?.schedule).toMatchObject({ status: 'CLOSED' })
    expect(body(response).data?.schedule.closedAt).not.toBeNull()

    const empty = await publishedSchedule(w, { status: 'LOCKED', periodStart: '2026-05-04', periodEnd: '2026-05-10' })

    expect((await route(empty.id, 'close')).statusCode).toBe(200)
  })

  it.each(['OPEN', 'ASSIGNED', 'CONFIRMED', 'IN_PROGRESS'] as const)('close is refused while a shift is %s', async status => {
    const schedule = await publishedSchedule(w, { status: 'LOCKED' })

    await makeShift(t, schedule, { status: 'COMPLETED' })
    await makeShift(t, schedule, { status, start: '2026-03-04T00:00:00.000Z', end: '2026-03-04T08:00:00.000Z' })

    const response = await route(schedule.id, 'close')

    expect(response.statusCode).toBe(422)
    expect(body(response).error).toMatchObject({ code: 'UNPROCESSABLE', details: { context: { unfinishedShifts: 1 } } })
    expect((await t.prisma.schedule.findUniqueOrThrow({ where: { id: schedule.id } })).status).toBe('LOCKED')
  })

  const invalidEdges = [
    ['DRAFT', 'unpublish', ['PUBLISHED']],
    ['DRAFT', 'lock', ['PUBLISHED']],
    ['DRAFT', 'close', ['PUBLISHED']],
    ['PUBLISHED', 'publish', ['DRAFT', 'LOCKED']],
    ['PUBLISHED', 'close', ['DRAFT', 'LOCKED']],
    ['LOCKED', 'publish', ['CLOSED']],
    ['LOCKED', 'unpublish', ['CLOSED']],
    ['LOCKED', 'lock', ['CLOSED']],
    ['CLOSED', 'publish', []],
    ['CLOSED', 'unpublish', []],
    ['CLOSED', 'lock', []],
    ['CLOSED', 'close', []]
  ] as const

  it.each(invalidEdges)('%s cannot %s (INVALID_STATE, allowed lists what is possible)', async (from, action, allowed) => {
    const schedule = await publishedSchedule(w, { status: from })
    const response = await route(schedule.id, action)

    expect(response.statusCode).toBe(409)
    expect(body(response).error).toMatchObject({ code: 'INVALID_STATE', details: { entity: 'schedule', from, allowed } })
    expect((await t.prisma.schedule.findUniqueOrThrow({ where: { id: schedule.id } })).status).toBe(from)
  })

  it.each(['publish', 'unpublish', 'lock', 'close', 'regenerate'])('%s: 401 anonymous, 403 for field/client, 404 across organizations and sites, 400 for a bad id', async action => {
    const schedule = await draftSchedule(w)
    const outsider = await buildOutsider(t)
    const strangerSupervisor = await signIn(t, 'SUPERVISOR')

    expect((await w.api.post(`/v1/schedules/${schedule.id}/${action}`)).statusCode).toBe(401)
    expect((await route(schedule.id, action, w.field.token)).statusCode).toBe(403)
    expect((await route(schedule.id, action, w.clientUser.token)).statusCode).toBe(403)
    expect((await route(schedule.id, action, outsider.admin.token)).statusCode).toBe(404)
    expect((await route(schedule.id, action, strangerSupervisor.token)).statusCode).toBe(404)
    expect((await route('nope', action)).statusCode).toBe(400)
    expect((await w.api.post(`/v1/schedules/${schedule.id}/${action}`, { token: w.admin.token, body: { unexpected: true } })).statusCode).toBe(400)
  })

  it('a supervisor of the site can run the whole lifecycle', async () => {
    const schedule = await draftSchedule(w)

    for (const action of ['publish', 'lock', 'close']) {
      expect((await route(schedule.id, action, w.supervisor.token)).statusCode).toBe(200)
    }

    expect(await auditActions(schedule.id)).toEqual(['published', 'locked', 'closed'])
  })
})

describe('DELETE /v1/schedules/:id', () => {
  it('deletes a DRAFT schedule together with its shifts and audits it', async () => {
    const schedule = await draftSchedule(w)

    await makeShift(t, schedule, {})

    const response = await w.api.delete(`/v1/schedules/${schedule.id}`, { token: w.admin.token })

    expect(response.statusCode).toBe(200)
    expect(body(response).data).toEqual({ deleted: true })
    expect(await t.prisma.schedule.count()).toBe(0)
    expect(await t.prisma.shift.count()).toBe(0)
    expect((await t.prisma.auditEvent.findFirst({ where: { entityId: schedule.id, action: 'deleted' } }))?.diff).toMatchObject({ shiftCount: 1 })
  })

  it.each(['PUBLISHED', 'LOCKED', 'CLOSED'] as const)('refuses a %s schedule', async status => {
    const schedule = await publishedSchedule(w, { status })
    const response = await w.api.delete(`/v1/schedules/${schedule.id}`, { token: w.admin.token })

    expect(response.statusCode).toBe(409)
    expect(body(response).error?.code).toBe('INVALID_STATE')
    expect(await t.prisma.schedule.count()).toBe(1)
  })

  it('enforces roles, scope and tenancy', async () => {
    const schedule = await draftSchedule(w)
    const outsider = await buildOutsider(t)
    const strangerSupervisor = await signIn(t, 'SUPERVISOR')

    expect((await w.api.delete(`/v1/schedules/${schedule.id}`)).statusCode).toBe(401)
    expect((await w.api.delete(`/v1/schedules/${schedule.id}`, { token: w.field.token })).statusCode).toBe(403)
    expect((await w.api.delete(`/v1/schedules/${schedule.id}`, { token: outsider.admin.token })).statusCode).toBe(404)
    expect((await w.api.delete(`/v1/schedules/${schedule.id}`, { token: strangerSupervisor.token })).statusCode).toBe(404)
    expect((await w.api.delete('/v1/schedules/nope', { token: w.admin.token })).statusCode).toBe(400)
    expect((await w.api.delete(`/v1/schedules/${schedule.id}`, { token: w.supervisor.token })).statusCode).toBe(200)
  })
})
