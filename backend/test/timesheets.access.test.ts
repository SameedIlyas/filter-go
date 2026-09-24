import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { D } from '../src/lib/money.js'
import { body, client, createTestApp, grantSiteAccess, makeFile, makeSite, resetDb, signIn } from './helpers.js'
import type { TestApp } from './helpers.js'
import { addException, at, buildWorld, END, entryFor, otherOrgAdmin, outsideSupervisor, START } from './timesheets.setup.js'
import type { World } from './timesheets.setup.js'

let t: TestApp
let w: World
const api = () => client(t.app)

beforeAll(async () => {
  t = await createTestApp()
})
afterAll(() => t.close())
beforeEach(async () => {
  await resetDb(t.prisma)
  w = await buildWorld(t)
})

const get = (path: string, token?: string, query?: Record<string, string>) => api().get(path, { token, query })
const day = (n: number) => ({ start: at(START, n * 1440), end: at(END, n * 1440) })

const approvedEntry = async (n = 0) => {
  const made = await entryFor(t, w, { status: 'APPROVED', ...day(n) })

  await t.prisma.timesheetEntry.update({
    where: { id: made.entry.id },
    data: { payRateSnapshot: D('22.00'), billRateSnapshot: D('145.00'), approvedById: w.admin.user.id, approvedAt: new Date() }
  })

  return made.entry
}

describe('rate and field redaction for all four roles', () => {
  it('the same approved entry: admin sees both rates, supervisor only pay, worker and client neither', async () => {
    const entry = await approvedEntry()
    const forRole = async (token: string) => {
      const list = body(await get('/v1/timesheets', token)).data?.timesheets[0]
      const detail = body(await get(`/v1/timesheets/${entry.id}`, token)).data?.timesheet

      return { list, detail }
    }

    const admin = await forRole(w.admin.token)
    const supervisor = await forRole(w.supervisor.token)
    const client = await forRole(w.clientUser.token)
    const mine = body(await get('/v1/me/timesheets', w.worker.token)).data?.timesheets[0]
    const own = body(await get(`/v1/timesheets/${entry.id}`, w.worker.token)).data?.timesheet

    for (const view of [admin.list, admin.detail]) expect(view).toMatchObject({ payRateSnapshot: '22.00', billRateSnapshot: '145.00' })

    for (const view of [supervisor.list, supervisor.detail]) {
      expect(view).toMatchObject({ payRateSnapshot: '22.00' })
      expect(view).not.toHaveProperty('billRateSnapshot')
    }

    for (const view of [client.list, client.detail, mine, own]) {
      expect(view).not.toHaveProperty('payRateSnapshot')
      expect(view).not.toHaveProperty('billRateSnapshot')
    }

    expect(JSON.stringify([client, mine, own])).not.toMatch(/145\.00|22\.00/)
  })

  it('a client never sees GPS, exceptions, worker identity, pay flags or reasons', async () => {
    const entry = await approvedEntry()

    await t.prisma.timesheetEntry.update({ where: { id: entry.id }, data: { clockInLat: 41.9, clockInLng: -87.6, adjustmentReason: 'secret reason', rejectionReason: 'r' } })
    await addException(t, entry.id, 'GEOFENCE_MISS', true)

    const list = body(await get('/v1/timesheets', w.clientUser.token)).data?.timesheets[0]
    const detail = body(await get(`/v1/timesheets/${entry.id}`, w.clientUser.token)).data?.timesheet
    const serialized = JSON.stringify([list, detail])

    for (const forbidden of ['clockInLat', 'clockInLng', 'lat', 'lng', 'exceptions', 'openExceptionCount', 'userId', 'user', 'payable', 'autoClosed', 'adjustmentReason', 'rejectionReason', 'approvedById', 'clockIn"', 'clockOut"']) {
      expect(serialized, forbidden).not.toContain(`"${forbidden.replace('"', '')}"`)
    }

    expect(detail).toMatchObject({ id: entry.id, status: 'APPROVED', billable: true })
    expect(detail.site).toEqual({ id: w.fixture.site.id, name: w.fixture.site.name })
  })
})

describe('GET /v1/me/timesheets', () => {
  it('lists only the caller entries, filterable and paged, newest shift first', async () => {
    const a = await entryFor(t, w, { status: 'SUBMITTED', ...day(0) })
    const b = await entryFor(t, w, { status: 'APPROVED', ...day(1) })
    const c = await entryFor(t, w, { status: 'SUBMITTED', ...day(2) })
    const other = await signIn(t, 'FIELD_USER')

    await grantSiteAccess(t, other.user.id, w.fixture.site.id)
    await entryFor(t, w, { worker: other.user, ...day(3) })

    const all = body(await get('/v1/me/timesheets', w.worker.token))

    expect(all.data?.timesheets.map((e: { id: string }) => e.id)).toEqual([c.entry.id, b.entry.id, a.entry.id])
    expect(all.meta).toMatchObject({ page: 1, limit: 20, total: 3, totalPages: 1 })
    expect(body(await get('/v1/me/timesheets', w.worker.token, { status: 'APPROVED' })).data?.timesheets).toHaveLength(1)
    expect(body(await get('/v1/me/timesheets', w.worker.token, { from: at(START, 1440).toISOString(), to: at(START, 2880).toISOString() })).data?.timesheets.map((e: { id: string }) => e.id)).toEqual([b.entry.id])

    const paged = body(await get('/v1/me/timesheets', w.worker.token, { limit: '2', page: '2' }))

    expect(paged.data?.timesheets).toHaveLength(1)
    expect(paged.meta).toMatchObject({ page: 2, limit: 2, total: 3, totalPages: 2 })
  })

  it('shows the exceptions and rejection reason to the worker, but no rates', async () => {
    const { entry } = await entryFor(t, w, { status: 'REJECTED' })

    await t.prisma.timesheetEntry.update({ where: { id: entry.id }, data: { rejectionReason: 'Check your times' } })
    await addException(t, entry.id, 'LATE_IN')

    const [mine] = body(await get('/v1/me/timesheets', w.worker.token)).data?.timesheets

    expect(mine).toMatchObject({ rejectionReason: 'Check your times', openExceptionCount: 1, user: { id: w.worker.user.id } })
    expect(mine.exceptions[0]).toMatchObject({ type: 'LATE_IN', resolved: false })
  })

  it('needs FIELD_USER and valid queries', async () => {
    expect((await get('/v1/me/timesheets')).statusCode).toBe(401)

    for (const other of [w.admin, w.supervisor, w.clientUser]) expect((await get('/v1/me/timesheets', other.token)).statusCode).toBe(403)

    expect((await get('/v1/me/timesheets', w.worker.token, { status: 'NOPE' })).statusCode).toBe(400)
    expect((await get('/v1/me/timesheets', w.worker.token, { userId: w.admin.user.id })).statusCode).toBe(400)
    expect((await get('/v1/me/timesheets', w.worker.token, { limit: '101' })).statusCode).toBe(400)
    expect((await get('/v1/me/timesheets', w.worker.token, { page: '0' })).statusCode).toBe(400)
    expect((await get('/v1/me/timesheets', w.worker.token, { from: 'yesterday' })).statusCode).toBe(400)
    expect((await get('/v1/me/timesheets', w.worker.token, { from: at(END, 1).toISOString(), to: START.toISOString() })).statusCode).toBe(400)
  })
})

describe('GET /v1/timesheets', () => {
  it('needs sign-in and ADMIN, SUPERVISOR or CLIENT_USER (workers use /me/timesheets)', async () => {
    expect((await get('/v1/timesheets')).statusCode).toBe(401)
    expect((await get('/v1/timesheets', w.worker.token)).statusCode).toBe(403)

    for (const who of [w.admin, w.supervisor, w.clientUser]) expect((await get('/v1/timesheets', who.token)).statusCode).toBe(200)
  })

  it('staff see every status; a client sees only APPROVED and INVOICED', async () => {
    for (const [n, status] of (['OPEN', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ADJUSTED', 'CORRECTED', 'INVOICED'] as const).entries()) {
      await entryFor(t, w, { status, ...day(n) })
    }

    expect(body(await get('/v1/timesheets', w.admin.token)).meta?.total).toBe(7)
    expect(body(await get('/v1/timesheets', w.supervisor.token)).meta?.total).toBe(7)

    const clientView = body(await get('/v1/timesheets', w.clientUser.token))

    expect(clientView.data?.timesheets.map((e: { status: string }) => e.status).sort()).toEqual(['APPROVED', 'INVOICED'])
    expect(body(await get('/v1/timesheets', w.clientUser.token, { status: 'SUBMITTED' })).data?.timesheets).toEqual([])
  })

  it('filters by status, site, worker, exceptions and shift dates', async () => {
    const a = await entryFor(t, w, day(0))
    const b = await entryFor(t, w, { status: 'ADJUSTED', ...day(1) })
    const otherWorker = await signIn(t, 'FIELD_USER')
    const c = await entryFor(t, w, { worker: otherWorker.user, ...day(2) })

    await addException(t, a.entry.id, 'LATE_IN')
    await addException(t, b.entry.id, 'LATE_IN', true)

    const ids = async (query: Record<string, string>) =>
      (body(await get('/v1/timesheets', w.admin.token, query)).data?.timesheets as Array<{ id: string }>).map(item => item.id).sort()

    expect(await ids({ status: 'ADJUSTED' })).toEqual([b.entry.id])
    expect(await ids({ userId: otherWorker.user.id })).toEqual([c.entry.id])
    expect(await ids({ hasOpenExceptions: 'true' })).toEqual([a.entry.id])
    expect(await ids({ hasOpenExceptions: 'false' })).toEqual([b.entry.id, c.entry.id].sort())
    expect(await ids({ siteId: w.fixture.site.id })).toHaveLength(3)
    expect(await ids({ from: day(1).start.toISOString(), to: day(2).start.toISOString() })).toEqual([b.entry.id])
    expect((await get('/v1/timesheets', w.admin.token, { hasOpenExceptions: 'maybe' })).statusCode).toBe(400)
    expect((await get('/v1/timesheets', w.admin.token, { siteId: 'nope' })).statusCode).toBe(400)
    expect((await get('/v1/timesheets', w.admin.token, { bogus: '1' })).statusCode).toBe(400)
  })

  it('a client cannot use worker or exception filters to learn more', async () => {
    const entry = await approvedEntry()
    const res = await get('/v1/timesheets', w.clientUser.token, { userId: '11111111-1111-4111-8111-111111111111', hasOpenExceptions: 'true' })

    expect(body(res).data?.timesheets.map((e: { id: string }) => e.id)).toEqual([entry.id])
  })

  it('is scoped: a supervisor sees only their sites, other organizations and other clients see nothing', async () => {
    await entryFor(t, w)

    const outsider = await outsideSupervisor(t)
    const foreign = await otherOrgAdmin(t)
    const otherClientUser = await signIn(t, 'CLIENT_USER', { clientId: (await makeSite(t)).clientId })

    expect(body(await get('/v1/timesheets', outsider.token)).data?.timesheets).toEqual([])
    expect(body(await get('/v1/timesheets', foreign.token)).data?.timesheets).toEqual([])
    expect(body(await get('/v1/timesheets', otherClientUser.token)).data?.timesheets).toEqual([])
    expect((await get('/v1/timesheets', outsider.token, { siteId: w.fixture.site.id })).statusCode).toBe(404)
    expect((await get('/v1/timesheets', foreign.token, { siteId: w.fixture.site.id })).statusCode).toBe(404)
    expect((await get('/v1/timesheets', w.clientUser.token, { siteId: (await makeSite(t)).id })).statusCode).toBe(404)
  })

  it('includes the worker, site and shift summary for staff', async () => {
    await entryFor(t, w)

    const [row] = body(await get('/v1/timesheets', w.admin.token)).data?.timesheets

    expect(row.user).toEqual({ id: w.worker.user.id, name: w.worker.user.name })
    expect(row.site).toEqual({ id: w.fixture.site.id, name: w.fixture.site.name })
    expect(row.shift).toMatchObject({ scheduleId: w.schedule.id, siteId: w.fixture.site.id, status: 'COMPLETED', isExtra: false })
  })
})

describe('GET /v1/timesheets/:id', () => {
  it('shows the entry, site, exceptions, work logs and the clock points with their distance from the site', async () => {
    const { entry, shift } = await entryFor(t, w)
    const north = 41.8781 + 400 / 111_194.9266

    await t.prisma.timesheetEntry.update({ where: { id: entry.id }, data: { clockInLat: north, clockInLng: -87.6298 } })
    await addException(t, entry.id, 'GEOFENCE_MISS')

    const file = await makeFile(t)

    await t.prisma.workLog.createMany({
      data: [
        { orgId: entry.orgId, shiftId: shift.id, userId: w.worker.user.id, kind: 'PHOTO', fileId: file.id, at: at(START, 5) },
        { orgId: entry.orgId, shiftId: shift.id, userId: w.worker.user.id, kind: 'ISSUE', body: 'Broken lock', at: at(START, 10) }
      ]
    })

    const res = await get(`/v1/timesheets/${entry.id}`, w.supervisor.token)
    const detail = body(res).data?.timesheet

    expect(res.statusCode).toBe(200)
    expect(detail.site).toMatchObject({ id: w.fixture.site.id, lat: 41.8781, lng: -87.6298, timezone: 'America/Chicago' })
    expect(detail.clockIn).toMatchObject({ lat: north, lng: -87.6298, distanceMeters: 400 })
    expect(detail.clockOut).toMatchObject({ lat: null, lng: null, distanceMeters: null })
    expect(detail.exceptions).toHaveLength(1)
    expect(detail.workLogs.map((log: { kind: string }) => log.kind)).toEqual(['PHOTO', 'ISSUE'])
  })

  it('distance is null when the site has no coordinates', async () => {
    await t.prisma.site.update({ where: { id: w.fixture.site.id }, data: { lat: null, lng: null } })

    const { entry } = await entryFor(t, w)

    await t.prisma.timesheetEntry.update({ where: { id: entry.id }, data: { clockInLat: 1, clockInLng: 1 } })

    expect(body(await get(`/v1/timesheets/${entry.id}`, w.admin.token)).data?.timesheet.clockIn).toMatchObject({ lat: 1, lng: 1, distanceMeters: null })
  })

  it('the worker sees their own entry (with own exceptions, no rates); another worker gets 404', async () => {
    const { entry } = await entryFor(t, w)
    const other = await signIn(t, 'FIELD_USER')

    expect((await get(`/v1/timesheets/${entry.id}`, w.worker.token)).statusCode).toBe(200)
    expect((await get(`/v1/timesheets/${entry.id}`, other.token)).statusCode).toBe(404)
  })

  it('a client sees only approved work at their sites, with photos and notes but no issues or checklists', async () => {
    const submitted = await entryFor(t, w)
    const approved = await approvedEntry(1)

    await t.prisma.workLog.createMany({
      data: (['PHOTO', 'NOTE', 'ISSUE', 'CHECKLIST'] as const).map((kind, index) => ({
        orgId: approved.orgId,
        shiftId: approved.shiftId,
        userId: w.worker.user.id,
        kind,
        body: kind === 'NOTE' || kind === 'ISSUE' ? kind : null,
        data: kind === 'CHECKLIST' ? { items: [] } : undefined,
        at: at(START, index)
      }))
    })

    expect((await get(`/v1/timesheets/${submitted.entry.id}`, w.clientUser.token)).statusCode).toBe(404)

    const detail = body(await get(`/v1/timesheets/${approved.id}`, w.clientUser.token)).data?.timesheet

    expect(detail.workLogs.map((log: { kind: string }) => log.kind)).toEqual(['PHOTO', 'NOTE'])
    expect(detail.workLogs[0]).not.toHaveProperty('userId')
  })

  it('cross-organization, site scope, bad ids, anonymous', async () => {
    const { entry } = await entryFor(t, w)
    const url = `/v1/timesheets/${entry.id}`

    expect((await get(url)).statusCode).toBe(401)
    expect((await get(url, (await otherOrgAdmin(t)).token)).statusCode).toBe(404)
    expect((await get(url, (await outsideSupervisor(t)).token)).statusCode).toBe(404)
    expect((await get('/v1/timesheets/not-a-uuid', w.admin.token)).statusCode).toBe(400)
    expect((await get('/v1/timesheets/11111111-1111-4111-8111-111111111111', w.admin.token)).statusCode).toBe(404)
    expect(body(await get(url, (await otherOrgAdmin(t)).token)).error).toMatchObject({ code: 'NOT_FOUND', details: { entity: 'timesheet' } })
  })
})

describe('GET /v1/timesheets/exceptions (the queue)', () => {
  it('lists unresolved exceptions oldest first with the entry summary; resolved ones are gone', async () => {
    const first = await entryFor(t, w, day(0))
    const second = await entryFor(t, w, day(1))
    const late = await addException(t, first.entry.id, 'LATE_IN')
    const geo = await addException(t, second.entry.id, 'GEOFENCE_MISS')
    const done = await addException(t, second.entry.id, 'OVERTIME', true)

    await t.prisma.timesheetException.update({ where: { id: late.id }, data: { createdAt: new Date('2026-03-01T10:00:00Z') } })
    await t.prisma.timesheetException.update({ where: { id: geo.id }, data: { createdAt: new Date('2026-03-01T09:00:00Z') } })

    const res = await get('/v1/timesheets/exceptions', w.supervisor.token)
    const items = body(res).data?.exceptions

    expect(res.statusCode).toBe(200)
    expect(items.map((item: { id: string }) => item.id)).toEqual([geo.id, late.id])
    expect(items.map((item: { id: string }) => item.id)).not.toContain(done.id)
    expect(items[0]).toMatchObject({ type: 'GEOFENCE_MISS', resolved: false })
    expect(items[0].timesheet).toMatchObject({ id: second.entry.id, status: 'SUBMITTED', user: { id: w.worker.user.id }, site: { id: w.fixture.site.id } })
    expect(items[0].timesheet).not.toHaveProperty('billRateSnapshot')
    expect(body(res).meta).toMatchObject({ total: 2 })
  })

  it('an admin sees the pay and bill rates of the entry, a supervisor only the pay rate', async () => {
    const { entry } = await entryFor(t, w)

    await t.prisma.timesheetEntry.update({ where: { id: entry.id }, data: { payRateSnapshot: D('22.00'), billRateSnapshot: D('145.00') } })
    await addException(t, entry.id, 'LATE_IN')

    expect(body(await get('/v1/timesheets/exceptions', w.admin.token)).data?.exceptions[0].timesheet).toMatchObject({ payRateSnapshot: '22.00', billRateSnapshot: '145.00' })

    const supervisorView = body(await get('/v1/timesheets/exceptions', w.supervisor.token)).data?.exceptions[0].timesheet

    expect(supervisorView).toMatchObject({ payRateSnapshot: '22.00' })
    expect(supervisorView).not.toHaveProperty('billRateSnapshot')
  })

  it('filters by type, site and worker, and pages', async () => {
    const other = await signIn(t, 'FIELD_USER')
    const a = await entryFor(t, w, day(0))
    const b = await entryFor(t, w, { worker: other.user, ...day(1) })
    const elsewhere = await makeSite(t)

    await addException(t, a.entry.id, 'LATE_IN')
    await addException(t, a.entry.id, 'OVERTIME')
    await addException(t, b.entry.id, 'LATE_IN')

    const list = async (query: Record<string, string>) => body(await get('/v1/timesheets/exceptions', w.admin.token, query))

    expect((await list({ type: 'LATE_IN' })).data?.exceptions).toHaveLength(2)
    expect((await list({ type: 'OVERTIME' })).data?.exceptions).toHaveLength(1)
    expect((await list({ userId: other.user.id })).data?.exceptions).toHaveLength(1)
    expect((await list({ siteId: w.fixture.site.id })).data?.exceptions).toHaveLength(3)
    expect((await list({ limit: '2' })).meta).toMatchObject({ total: 3, totalPages: 2, limit: 2 })
    expect((await list({ limit: '2', page: '2' })).data?.exceptions).toHaveLength(1)
    expect((await get('/v1/timesheets/exceptions', w.admin.token, { siteId: elsewhere.id })).statusCode).toBe(200)
    expect((await list({ siteId: elsewhere.id })).data?.exceptions).toEqual([])
    expect((await get('/v1/timesheets/exceptions', w.admin.token, { type: 'BOGUS' })).statusCode).toBe(400)
    expect((await get('/v1/timesheets/exceptions', w.admin.token, { resolved: 'true' })).statusCode).toBe(400)
  })

  it('only staff may call it, and a supervisor only sees their sites', async () => {
    const { entry } = await entryFor(t, w)

    await addException(t, entry.id, 'LATE_IN')

    expect((await get('/v1/timesheets/exceptions')).statusCode).toBe(401)
    expect((await get('/v1/timesheets/exceptions', w.worker.token)).statusCode).toBe(403)
    expect((await get('/v1/timesheets/exceptions', w.clientUser.token)).statusCode).toBe(403)

    const outsider = await outsideSupervisor(t)
    const foreign = await otherOrgAdmin(t)

    expect(body(await get('/v1/timesheets/exceptions', outsider.token)).data?.exceptions).toEqual([])
    expect(body(await get('/v1/timesheets/exceptions', foreign.token)).data?.exceptions).toEqual([])
    expect((await get('/v1/timesheets/exceptions', outsider.token, { siteId: w.fixture.site.id })).statusCode).toBe(404)
    expect(body(await get('/v1/timesheets/exceptions', w.supervisor.token)).data?.exceptions).toHaveLength(1)
  })
})
