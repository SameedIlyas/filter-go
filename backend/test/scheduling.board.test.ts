import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { boardShifts } from '../src/modules/scheduling/board.query.js'
import { boardQuery } from '../src/modules/scheduling/schemas.js'
import { body, createTestApp, grantSiteAccess, makeContract, makeSchedule, makeSite, resetDb, signIn } from './helpers.js'
import type { TestApp } from './helpers.js'
import { addFieldUser, at, buildOutsider, buildWorld, draftSchedule, publishedSchedule, shiftAt } from './scheduling.helpers.js'
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

/** The first week of March 2026, Monday to Monday (UTC). */
const WEEK = { from: at(2, 0), to: at(9, 0) }

const board = (query: Record<string, string>, token = w.admin.token) => w.api.get(`/v1/shifts/board?${new URLSearchParams(query).toString()}`, { token })

const ids = (response: Awaited<ReturnType<typeof board>>): string[] => body(response).data?.shifts.map((shift: { id: string }) => shift.id)

describe('GET /v1/shifts/board: access', () => {
  it('ADMIN sees every shift in the window, across schedules, with the lean card shape and no money', async () => {
    const draft = await draftSchedule(w)
    const published = await publishedSchedule(w, { periodStart: '2026-03-05', periodEnd: '2026-03-31' })
    const open = await shiftAt(w, draft, { start: at(3, 0), end: at(3, 8) })
    const assigned = await shiftAt(w, published, { start: at(5, 14), end: at(5, 22), assignedUserId: w.field.user.id })

    const response = await board(WEEK)

    expect(response.statusCode).toBe(200)
    expect(ids(response)).toEqual([open.id, assigned.id])

    const card = body(response).data?.shifts[1]

    expect(card).toEqual({
      id: assigned.id,
      scheduleId: published.id,
      scheduleStatus: 'PUBLISHED',
      siteId: w.fixture.site.id,
      site: { id: w.fixture.site.id, name: w.fixture.site.name, timezone: 'America/Chicago' },
      scheduledStart: at(5, 14),
      scheduledEnd: at(5, 22),
      status: 'ASSIGNED',
      assignedUser: { id: w.field.user.id, name: w.field.user.name },
      isExtra: false,
      hasNotes: false
    })
    expect(JSON.stringify(body(response).data)).not.toMatch(/rate|billable/i)
    expect(body(response).data).toMatchObject({ window: WEEK, truncated: false })
  })

  it('SUPERVISOR sees only shifts at their sites', async () => {
    const other = await makeContract(t)
    const mine = await shiftAt(w, await draftSchedule(w))

    await makeShiftAtOtherSite(other)

    expect(ids(await board(WEEK, w.supervisor.token))).toEqual([mine.id])

    await grantSiteAccess(t, w.supervisor.user.id, other.site.id)

    expect(ids(await board(WEEK, w.supervisor.token))).toHaveLength(2)
  })

  it('refuses FIELD_USER and CLIENT_USER (403); they have /me/shifts and the published plan', async () => {
    expect((await board(WEEK, w.field.token)).statusCode).toBe(403)
    expect((await board(WEEK, w.clientUser.token)).statusCode).toBe(403)
  })

  it('requires a session (401)', async () => {
    const response = await w.api.get(`/v1/shifts/board?${new URLSearchParams(WEEK).toString()}`)

    expect(response.statusCode).toBe(401)
  })

  it('never leaks another organization', async () => {
    const outsider = await buildOutsider(t)
    const theirs = await makeSchedule(t, outsider.fixture, { status: 'PUBLISHED' })

    await t.prisma.shift.create({ data: { orgId: outsider.org.id, scheduleId: theirs.id, siteId: outsider.fixture.site.id, scheduledStart: new Date(at(3, 0)), scheduledEnd: new Date(at(3, 8)) } })

    expect(ids(await board(WEEK))).toEqual([])
    expect(ids(await board(WEEK, outsider.admin.token))).toHaveLength(1)
  })
})

const makeShiftAtOtherSite = async (other: Awaited<ReturnType<typeof makeContract>>) => {
  const schedule = await makeSchedule(t, other, { status: 'DRAFT' })

  return t.prisma.shift.create({ data: { orgId: schedule.orgId, scheduleId: schedule.id, siteId: schedule.siteId, scheduledStart: new Date(at(4, 0)), scheduledEnd: new Date(at(4, 8)) } })
}

describe('GET /v1/shifts/board: the window', () => {
  it('uses overlap, so a shift crossing either edge of the window is on the board', async () => {
    const schedule = await draftSchedule(w)
    const crossesStart = await shiftAt(w, schedule, { start: at(1, 20), end: at(2, 4) })
    const inside = await shiftAt(w, schedule, { start: at(4, 0), end: at(4, 8) })
    const crossesEnd = await shiftAt(w, schedule, { start: at(8, 22), end: at(9, 6) })

    await shiftAt(w, schedule, { start: at(1, 10), end: at(2, 0) }) // ends exactly at `from`: outside
    await shiftAt(w, schedule, { start: at(9, 0), end: at(9, 8) }) // starts exactly at `to`: outside

    expect(ids(await board(WEEK))).toEqual([crossesStart.id, inside.id, crossesEnd.id])
  })

  it('requires from < to and at most 45 days', async () => {
    expect(body(await board({ from: at(9, 0), to: at(2, 0) })).error?.code).toBe('VALIDATION_ERROR')
    expect(body(await board({ from: at(2, 0), to: at(2, 0) })).error?.code).toBe('VALIDATION_ERROR')
    expect(body(await board({ from: '2026-03-01T00:00:00.000Z', to: '2026-04-16T00:00:00.000Z' })).error?.code).toBe('VALIDATION_ERROR')
    expect((await board({ from: '2026-03-01T00:00:00.000Z', to: '2026-04-15T00:00:00.000Z' })).statusCode).toBe(200)
    expect((await board({ from: at(2, 0) })).statusCode).toBe(400)
  })
})

describe('GET /v1/shifts/board: filters', () => {
  it('filters by sites, staff, statuses, schedule, unassigned and drafts', async () => {
    const other = await makeContract(t)
    const draft = await draftSchedule(w)
    const published = await publishedSchedule(w, { periodStart: '2026-03-05', periodEnd: '2026-03-31' })
    const second = await addFieldUser(w)

    const openDraft = await shiftAt(w, draft, { start: at(3, 0), end: at(3, 8) })
    const fieldShift = await shiftAt(w, published, { start: at(5, 0), end: at(5, 8), assignedUserId: w.field.user.id })
    const secondShift = await shiftAt(w, published, { start: at(6, 0), end: at(6, 8), assignedUserId: second.user.id, status: 'CONFIRMED' })
    const elsewhere = await makeShiftAtOtherSite(other)

    expect(ids(await board({ ...WEEK, siteIds: w.fixture.site.id }))).toEqual([openDraft.id, fieldShift.id, secondShift.id])
    expect(ids(await board({ ...WEEK, siteIds: `${w.fixture.site.id},${other.site.id}` }))).toHaveLength(4)
    expect(ids(await board({ ...WEEK, userIds: `${w.field.user.id},${second.user.id}` }))).toEqual([fieldShift.id, secondShift.id])
    expect(ids(await board({ ...WEEK, statuses: 'OPEN,CONFIRMED' }))).toEqual([openDraft.id, elsewhere.id, secondShift.id])
    expect(ids(await board({ ...WEEK, scheduleId: published.id }))).toEqual([fieldShift.id, secondShift.id])
    expect(ids(await board({ ...WEEK, unassigned: 'true' }))).toEqual([openDraft.id, elsewhere.id])
    expect(ids(await board({ ...WEEK, includeDraft: 'false' }))).toEqual([fieldShift.id, secondShift.id])
  })

  it('combines the staff filter with unassigned instead of one replacing the other', async () => {
    const schedule = await publishedSchedule(w)
    const mine = await shiftAt(w, schedule, { start: at(3, 0), end: at(3, 8), assignedUserId: w.field.user.id })

    await shiftAt(w, schedule, { start: at(4, 0), end: at(4, 8), assignedUserId: (await addFieldUser(w)).user.id })

    expect(ids(await board({ ...WEEK, userIds: w.field.user.id, unassigned: 'false' }))).toEqual([mine.id])
    expect(ids(await board({ ...WEEK, userIds: w.field.user.id, unassigned: 'true' }))).toEqual([])
  })

  it('rejects malformed list filters', async () => {
    expect(body(await board({ ...WEEK, siteIds: 'not-a-uuid' })).error?.code).toBe('VALIDATION_ERROR')
    expect(body(await board({ ...WEEK, statuses: 'OPEN,NOPE' })).error?.code).toBe('VALIDATION_ERROR')
  })
})

describe('GET /v1/shifts/board: counts and the row ceiling', () => {
  it('counts every matching shift by status, plus extras, independent of the rows returned', async () => {
    const schedule = await publishedSchedule(w)

    await shiftAt(w, schedule, { start: at(3, 0), end: at(3, 8) })
    await shiftAt(w, schedule, { start: at(4, 0), end: at(4, 8), assignedUserId: w.field.user.id })
    await shiftAt(w, schedule, { start: at(5, 0), end: at(5, 8), status: 'CANCELLED' })
    await shiftAt(w, schedule, { start: at(6, 0), end: at(6, 8), isExtra: true, assignedUserId: w.field.user.id, status: 'COMPLETED' })

    expect(body(await board(WEEK)).data?.counts).toEqual({
      total: 4,
      open: 1,
      assigned: 1,
      confirmed: 0,
      inProgress: 0,
      completed: 1,
      noShow: 0,
      cancelled: 1,
      extra: 1
    })
  })

  it('stops at the ceiling and says so, while the counts still cover everything', async () => {
    const schedule = await draftSchedule(w)

    for (const day of [3, 4, 5]) await shiftAt(w, schedule, { start: at(day, 0), end: at(day, 8) })

    const admin = await t.prisma.user.findUniqueOrThrow({ where: { id: w.admin.user.id } })
    const result = await boardShifts(t.ctx, { id: admin.id, orgId: admin.orgId, role: admin.role, clientId: null }, boardQuery.parse(WEEK), 2)

    expect(result.shifts).toHaveLength(2)
    expect(result.truncated).toBe(true)
    expect(result.counts.total).toBe(3)
  })

  it('uses the site timezone, falling back to the organization', async () => {
    const floating = await makeSite(t, { clientId: w.fixture.client.id, timezone: null })
    const schedule = await draftSchedule(w)

    await t.prisma.shift.create({ data: { orgId: schedule.orgId, scheduleId: schedule.id, siteId: floating.id, scheduledStart: new Date(at(3, 0)), scheduledEnd: new Date(at(3, 8)), notes: 'Gate code 42' } })

    const [card] = body(await board(WEEK)).data?.shifts

    expect(card).toMatchObject({ site: { id: floating.id, timezone: 'America/Chicago' }, hasNotes: true })
  })
})

describe('GET /v1/shifts/board: other roles in scope', () => {
  it('a SUPERVISOR without any site sees an empty board, not an error', async () => {
    const lonely = await signIn(t, 'SUPERVISOR')

    await shiftAt(w, await draftSchedule(w))

    const response = await board(WEEK, lonely.token)

    expect(response.statusCode).toBe(200)
    expect(ids(response)).toEqual([])
    expect(body(response).data?.counts.total).toBe(0)
  })
})
