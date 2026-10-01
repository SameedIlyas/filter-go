import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { body, client, createTestApp, makeContract, makeSchedule, makeShift, makeTimesheet, resetDb, signIn } from './helpers.js'
import type { TestApp } from './helpers.js'
import { addException, at, entryFor, otherOrgAdmin, outsideSupervisor, shiftFor, START, buildWorld } from './timesheets.setup.js'
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

const DAY_MS = 86_400_000

/** START is 18:00 Chicago on Monday 2026-03-02, so that is the shift's site-local day. */
const MONDAY = '2026-03-02'

const hours = (query: Record<string, string>, token = w.admin.token) => api().get(`/v1/timesheets/hours?${new URLSearchParams(query).toString()}`, { token })

const week = { from: MONDAY, to: '2026-03-08' }

/** The `data` of a successful response (fails the test when there is none). */
const dataOf = (res: Parameters<typeof body>[0]) => {
  const { data } = body(res)

  expect(data).not.toBeNull()

  return data as NonNullable<typeof data>
}

describe('GET /v1/timesheets/hours', () => {
  it('tallies scheduled, worked and approved minutes per worker and site-local day', async () => {
    await entryFor(t, w, { status: 'APPROVED' })
    const tuesday = await entryFor(t, w, { start: new Date(START.getTime() + DAY_MS), end: new Date(START.getTime() + DAY_MS + 4 * 3_600_000), status: 'SUBMITTED' })

    await addException(t, tuesday.entry.id, 'LATE_IN')
    await shiftFor(t, w, { start: new Date(START.getTime() + 2 * DAY_MS), end: new Date(START.getTime() + 2 * DAY_MS + 2 * 3_600_000) })

    const res = await hours(week)
    const data = dataOf(res)

    expect(res.statusCode).toBe(200)
    expect(data.days).toEqual(['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08'])
    expect(data.workers).toHaveLength(1)
    expect(data.workers[0]).toEqual({
      user: { id: w.worker.user.id, name: w.worker.user.name },
      days: {
        '2026-03-02': { scheduledMinutes: 480, workedMinutes: 480, approvedMinutes: 480 },
        '2026-03-03': { scheduledMinutes: 240, workedMinutes: 240, approvedMinutes: 0 },
        '2026-03-04': { scheduledMinutes: 120, workedMinutes: 0, approvedMinutes: 0 }
      },
      scheduledMinutes: 840,
      workedMinutes: 720,
      approvedMinutes: 480,
      overtimeMinutes: 0,
      entryCount: 2,
      openExceptionCount: 1
    })
    expect(data.totals).toMatchObject({ scheduledMinutes: 840, workedMinutes: 720, approvedMinutes: 480, overtimeMinutes: 0 })
    expect(data.totals.days['2026-03-05']).toEqual({ scheduledMinutes: 0, workedMinutes: 0, approvedMinutes: 0 })
    expect(JSON.stringify(data)).not.toMatch(/rate/i)
  })

  it('leaves out rejected entries, and drops days outside the window', async () => {
    await entryFor(t, w, { status: 'REJECTED' })
    await entryFor(t, w, { start: at(START, -7 * 24 * 60), end: at(START, -7 * 24 * 60 + 60), status: 'APPROVED' })

    const data = dataOf(await hours(week))

    expect(data.workers).toHaveLength(1)
    expect(data.workers[0]).toMatchObject({ workedMinutes: 0, approvedMinutes: 0, scheduledMinutes: 480, entryCount: 0 })
  })

  it('counts weekly overtime over the whole Monday-start week, even past the window edge', async () => {
    // Five 10-hour entries Monday..Friday = 3000 minutes, 600 over the default 2400 limit
    for (let day = 0; day < 5; day += 1) {
      await entryFor(t, w, { start: new Date(START.getTime() + day * DAY_MS), end: new Date(START.getTime() + day * DAY_MS + 10 * 3_600_000) })
    }

    const data = dataOf(await hours({ from: MONDAY, to: '2026-03-03' }))

    expect(data.weeklyOvertimeMinutes).toBe(2400)
    expect(data.workers[0]).toMatchObject({ workedMinutes: 1200, overtimeMinutes: 600 })
    expect(data.totals.overtimeMinutes).toBe(600)
  })

  it('counts overtime over every site the worker worked, like the OVERTIME exception, without showing the other site', async () => {
    // 30h at a site the supervisor cannot see, 15h at theirs, in the same week: 2700 minutes, 300 over the limit
    const elsewhere = await makeContract(t)
    const otherSchedule = await makeSchedule(t, elsewhere)

    for (let day = 0; day < 3; day += 1) {
      const start = new Date(START.getTime() + day * DAY_MS)
      const shift = await makeShift(t, otherSchedule, { start: start.toISOString(), end: new Date(start.getTime() + 10 * 3_600_000).toISOString(), assignedUserId: w.worker.user.id, status: 'COMPLETED' })

      await makeTimesheet(t, shift, w.worker.user)
    }

    await entryFor(t, w, { start: new Date(START.getTime() + 3 * DAY_MS), end: new Date(START.getTime() + 3 * DAY_MS + 15 * 3_600_000) })

    const seen = dataOf(await hours(week, w.supervisor.token))

    expect(seen.workers[0]).toMatchObject({ workedMinutes: 900, overtimeMinutes: 300 })
    expect(Object.keys(seen.workers[0].days)).toEqual(['2026-03-05'])
    expect(dataOf(await hours({ ...week, siteId: w.fixture.site.id })).workers[0].overtimeMinutes).toBe(300)
  })

  it('leaves out a worker with nothing inside the window', async () => {
    await entryFor(t, w, { start: new Date(START.getTime() + 4 * DAY_MS), end: new Date(START.getTime() + 4 * DAY_MS + 3_600_000) })

    expect(dataOf(await hours({ from: MONDAY, to: '2026-03-03' })).workers).toEqual([])
  })

  it('filters by worker and by site', async () => {
    const other = await signIn(t, 'FIELD_USER')

    await entryFor(t, w)
    await entryFor(t, w, { worker: other.user, start: at(START, 600), end: at(START, 660) })

    const mine = dataOf(await hours({ ...week, userId: w.worker.user.id }))

    expect(mine.workers.map((row: { user: { id: string } }) => row.user.id)).toEqual([w.worker.user.id])

    const atSite = dataOf(await hours({ ...week, siteId: w.fixture.site.id }))

    expect(atSite.workers).toHaveLength(2)
  })

  it('scopes a supervisor to their sites and refuses other roles', async () => {
    await entryFor(t, w)

    const outsider = await outsideSupervisor(t)

    expect(dataOf(await hours(week, outsider.token)).workers).toEqual([])
    expect((await hours({ ...week, siteId: w.fixture.site.id }, outsider.token)).statusCode).toBe(404)
    expect(dataOf(await hours(week, w.supervisor.token)).workers).toHaveLength(1)
    expect((await hours(week, w.worker.token)).statusCode).toBe(403)
    expect((await hours(week, w.clientUser.token)).statusCode).toBe(403)
  })

  it('never shows another organization', async () => {
    await entryFor(t, w)

    const stranger = await otherOrgAdmin(t)

    expect(dataOf(await hours(week, stranger.token)).workers).toEqual([])
  })

  it('validates the window', async () => {
    expect((await hours({ from: '2026-03-08', to: MONDAY })).statusCode).toBe(400)
    expect((await hours({ from: '2026-03-01', to: '2026-04-15' })).statusCode).toBe(400)
    expect((await hours({ from: '2026-03-01', to: '2026-04-14' })).statusCode).toBe(200)
    expect((await hours({ from: '2026-02-30', to: '2026-03-02' })).statusCode).toBe(400)
    expect((await hours({ from: MONDAY })).statusCode).toBe(400)
  })
})

describe('GET /v1/timesheets/:id activity', () => {
  it('gives staff the shift and timesheet trail, oldest first, with reasons but no rate diffs', async () => {
    const { entry } = await entryFor(t, w)

    await api().post(`/v1/timesheets/${entry.id}/reject`, { token: w.supervisor.token, body: { reason: 'Wrong break' } })

    const res = await api().get(`/v1/timesheets/${entry.id}`, { token: w.admin.token })
    const activity = dataOf(res).timesheet.activity

    expect(res.statusCode).toBe(200)
    expect(activity).toEqual([
      expect.objectContaining({ entity: 'timesheet', action: 'rejected', actor: { id: w.supervisor.user.id, name: w.supervisor.user.name }, reason: 'Wrong break' })
    ])
  })

  it('omits the activity for the worker and the client', async () => {
    const { entry } = await entryFor(t, w, { status: 'APPROVED' })

    const mine = dataOf(await api().get(`/v1/timesheets/${entry.id}`, { token: w.worker.token })).timesheet
    const theirs = dataOf(await api().get(`/v1/timesheets/${entry.id}`, { token: w.clientUser.token })).timesheet

    expect(mine).not.toHaveProperty('activity')
    expect(theirs).not.toHaveProperty('activity')
  })

  it('does not leak approval rate stamps through the trail', async () => {
    const { entry } = await entryFor(t, w)

    await api().post(`/v1/timesheets/${entry.id}/approve`, { token: w.admin.token, body: {} })

    const activity = dataOf(await api().get(`/v1/timesheets/${entry.id}`, { token: w.supervisor.token })).timesheet.activity

    expect(activity.map((item: { action: string }) => item.action)).toContain('approved')
    expect(JSON.stringify(activity)).not.toMatch(/rate|145|22\.00/i)
  })
})

describe('timesheet site timezone', () => {
  it("resolves the site's timezone, falling back to the organization's", async () => {
    const { entry } = await entryFor(t, w)

    const listed = dataOf(await api().get('/v1/timesheets', { token: w.admin.token })).timesheets[0]

    expect(listed.site).toEqual({ id: w.fixture.site.id, name: w.fixture.site.name, timezone: 'America/Chicago' })

    await t.prisma.site.update({ where: { id: w.fixture.site.id }, data: { timezone: null } })

    const org = await t.prisma.organization.findUniqueOrThrow({ where: { id: w.admin.user.orgId }, select: { timezone: true } })
    const detail = dataOf(await api().get(`/v1/timesheets/${entry.id}`, { token: w.worker.token })).timesheet

    expect(detail.site.timezone).toBe(org.timezone)
  })
})
