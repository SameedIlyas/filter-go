import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { ExceptionType, Shift } from '../src/generated/prisma/client.js'
import { clockIn, clockOut } from '../src/modules/timesheets/clocking.js'
import { body, client, createTestApp, makeSchedule, makeShift, resetDb, signIn } from './helpers.js'
import type { TestApp } from './helpers.js'
import { at, buildWorld, END, entryFor, otherOrgAdmin, shiftFor, START } from './timesheets.setup.js'
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

const SITE = { lat: 41.8781, lng: -87.6298 }
const northOf = (meters: number) => ({ lat: SITE.lat + meters / 111_194.9266, lng: SITE.lng })

/** A shift that is on right now: started 5 minutes ago, ends in 8 hours. */
const liveShift = (input: { status?: Shift['status'] } = {}) => {
  const start = new Date(Date.now() - 5 * 60_000)

  return shiftFor(t, w, { start, end: new Date(start.getTime() + 8 * 3_600_000), status: input.status })
}

/** Clocks in and out through the services with explicit server times; returns the entry and its exception types. */
const work = async (input: {
  start?: Date
  end?: Date
  inAt?: Date
  outAt?: Date
  inPoint?: { lat?: number; lng?: number }
  outPoint?: { lat?: number; lng?: number }
  breakMinutes?: number
}) => {
  const shift = await shiftFor(t, w, { start: input.start, end: input.end })
  const opened = await clockIn(t.ctx, w.worker.actor, shift.id, input.inPoint ?? SITE, undefined, input.inAt ?? input.start ?? START)
  const closed = await clockOut(t.ctx, w.worker.actor, opened.id, { ...(input.outPoint ?? SITE), breakMinutes: input.breakMinutes }, undefined, input.outAt ?? input.end ?? END)
  const exceptions = await t.prisma.timesheetException.findMany({ where: { timesheetEntryId: closed.id }, orderBy: { type: 'asc' } })

  return { shift, entry: closed, exceptions, types: exceptions.map(row => row.type).sort() as ExceptionType[] }
}

describe('POST /v1/shifts/:id/clock-in', () => {
  it('creates the entry with the SERVER time, moves the shift to IN_PROGRESS, audits, and shows no rates', async () => {
    const shift = await liveShift()
    const before = Date.now()
    const res = await api().post(`/v1/shifts/${shift.id}/clock-in`, { token: w.worker.token, body: SITE })
    const json = body(res)

    expect(res.statusCode).toBe(201)
    expect(json.data?.timesheet).toMatchObject({ status: 'OPEN', shiftId: shift.id, userId: w.worker.user.id, clockOutAt: null, actualMinutes: null, scheduledMinutes: 480 })
    expect(json.data?.timesheet).not.toHaveProperty('payRateSnapshot')
    expect(json.data?.timesheet).not.toHaveProperty('billRateSnapshot')
    expect(new Date(json.data?.timesheet.clockInAt).getTime()).toBeGreaterThanOrEqual(before - 1000)
    expect((await t.prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })).status).toBe('IN_PROGRESS')

    const entry = await t.prisma.timesheetEntry.findUniqueOrThrow({ where: { shiftId: shift.id } })

    expect(entry).toMatchObject({ clockInLat: SITE.lat, clockInLng: SITE.lng, status: 'OPEN' })

    const audit = await t.prisma.auditEvent.findFirst({ where: { entity: 'timesheet', entityId: entry.id, action: 'clocked_in' } })

    expect(audit).toMatchObject({ actorId: w.worker.user.id, orgId: w.worker.user.orgId })
  })

  it('accepts a clock-in without GPS and raises GEOFENCE_MISS for it (site has coordinates)', async () => {
    const shift = await liveShift()
    const res = await api().post(`/v1/shifts/${shift.id}/clock-in`, { token: w.worker.token, body: {} })

    expect(res.statusCode).toBe(201)
    expect(body(res).data?.timesheet.exceptions.map((e: { type: string }) => e.type)).toEqual(['GEOFENCE_MISS'])
  })

  it('needs a token, the FIELD_USER role, the assigned user, and a shift of the caller organization', async () => {
    const shift = await liveShift()
    const url = `/v1/shifts/${shift.id}/clock-in`

    expect((await api().post(url, { body: SITE })).statusCode).toBe(401)

    for (const other of [w.admin, w.supervisor, w.clientUser]) {
      expect((await api().post(url, { token: other.token, body: SITE })).statusCode).toBe(403)
    }

    const stranger = await signIn(t, 'FIELD_USER')

    expect((await api().post(url, { token: stranger.token, body: SITE })).statusCode).toBe(404)

    const foreign = await otherOrgAdmin(t)
    const foreignWorker = await signIn(t, 'FIELD_USER', { orgId: foreign.user.orgId })

    expect((await api().post(url, { token: foreignWorker.token, body: SITE })).statusCode).toBe(404)
    expect((await api().post('/v1/shifts/00000000-0000-4000-8000-000000000000/clock-in', { token: w.worker.token, body: SITE })).statusCode).toBe(404)
  })

  it('validates: bad id, unknown fields (no client clock), coordinate ranges, half a point', async () => {
    const shift = await liveShift()
    const url = `/v1/shifts/${shift.id}/clock-in`
    const post = (payload: object) => api().post(url, { token: w.worker.token, body: payload })

    expect((await api().post('/v1/shifts/not-a-uuid/clock-in', { token: w.worker.token, body: SITE })).statusCode).toBe(400)
    expect((await post({ ...SITE, at: new Date().toISOString() })).statusCode).toBe(400)
    expect((await post({ lat: 90.5, lng: 0 })).statusCode).toBe(400)
    expect((await post({ lat: -91, lng: 0 })).statusCode).toBe(400)
    expect((await post({ lat: 0, lng: 180.1 })).statusCode).toBe(400)
    expect((await post({ lat: 0, lng: -181 })).statusCode).toBe(400)
    expect((await post({ lat: '41.8' , lng: 1 })).statusCode).toBe(400)
    expect((await post({ lat: 41.8 })).statusCode).toBe(400)
    expect((await post({ lng: 41.8 })).statusCode).toBe(400)
    expect((await t.prisma.timesheetEntry.count())).toBe(0)
  })

  it('hides shifts of an unpublished schedule from the worker (404) and refuses a locked one', async () => {
    const draft = await makeSchedule(t, w.fixture, { status: 'DRAFT', periodStart: '2026-04-01', periodEnd: '2026-04-07' })
    const start = new Date(Date.now() - 60_000)
    const draftShift = await makeShift(t, draft, { start: start.toISOString(), end: at(start, 480).toISOString(), assignedUserId: w.worker.user.id })

    expect((await api().post(`/v1/shifts/${draftShift.id}/clock-in`, { token: w.worker.token, body: SITE })).statusCode).toBe(404)

    await t.prisma.schedule.update({ where: { id: w.schedule.id }, data: { status: 'LOCKED' } })

    const shift = await liveShift()
    const res = await api().post(`/v1/shifts/${shift.id}/clock-in`, { token: w.worker.token, body: SITE })

    expect(res.statusCode).toBe(409)
    expect(body(res).error?.code).toBe('SCHEDULE_LOCKED')
  })

  it('is a CLOCK_STATE error once the shift was started, completed or marked no-show, and INVALID_STATE for a cancelled one', async () => {
    for (const status of ['IN_PROGRESS', 'COMPLETED', 'NO_SHOW'] as const) {
      const shift = await liveShift({ status })
      const res = await api().post(`/v1/shifts/${shift.id}/clock-in`, { token: w.worker.token, body: SITE })

      expect(res.statusCode, status).toBe(409)
      expect(body(res).error?.code).toBe('CLOCK_STATE')
    }

    const cancelled = await liveShift({ status: 'CANCELLED' })
    const res = await api().post(`/v1/shifts/${cancelled.id}/clock-in`, { token: w.worker.token, body: SITE })

    expect(body(res).error).toMatchObject({ code: 'INVALID_STATE', details: { from: 'CANCELLED', allowed: ['ASSIGNED', 'CONFIRMED'] } })
  })

  it('a second clock-in on the same shift is CLOCK_STATE and creates no second entry', async () => {
    const shift = await liveShift()

    expect((await api().post(`/v1/shifts/${shift.id}/clock-in`, { token: w.worker.token, body: SITE })).statusCode).toBe(201)

    const again = await api().post(`/v1/shifts/${shift.id}/clock-in`, { token: w.worker.token, body: SITE })

    expect(again.statusCode).toBe(409)
    expect(body(again).error?.code).toBe('CLOCK_STATE')
    expect(await t.prisma.timesheetEntry.count()).toBe(1)
  })

  it('RACE: two simultaneous clock-ins create exactly one entry', async () => {
    const shift = await liveShift()
    const url = `/v1/shifts/${shift.id}/clock-in`
    const results = await Promise.all([1, 2, 3].map(() => api().post(url, { token: w.worker.token, body: SITE })))

    expect(results.map(r => r.statusCode).sort()).toEqual([201, 409, 409])
    expect(results.filter(r => r.statusCode === 409).every(r => body(r).error?.code === 'CLOCK_STATE')).toBe(true)
    expect(await t.prisma.timesheetEntry.count({ where: { shiftId: shift.id } })).toBe(1)
    expect(await t.prisma.auditEvent.count({ where: { action: 'clocked_in' } })).toBe(1)
  })

  it('works for a CONFIRMED shift too', async () => {
    const shift = await liveShift({ status: 'CONFIRMED' })

    expect((await api().post(`/v1/shifts/${shift.id}/clock-in`, { token: w.worker.token, body: SITE })).statusCode).toBe(201)
  })
})

describe('clock-in window', () => {
  const attempt = async (now: Date) => {
    const shift = await shiftFor(t, w)

    return clockIn(t.ctx, w.worker.actor, shift.id, SITE, undefined, now)
  }

  it('opens exactly clockInEarlyMinutes before the start and closes exactly at the end', async () => {
    await expect(attempt(at(START, -60))).resolves.toMatchObject({ status: 'OPEN' })
    await expect(attempt(at(START, -61))).rejects.toMatchObject({ code: 'CLOCK_WINDOW', statusCode: 409 })
    await expect(attempt(END)).resolves.toMatchObject({ status: 'OPEN' })
    await expect(attempt(new Date(END.getTime() + 1))).rejects.toMatchObject({ code: 'CLOCK_WINDOW' })
  })

  it('a refused clock-in changes nothing', async () => {
    const shift = await shiftFor(t, w)

    await expect(clockIn(t.ctx, w.worker.actor, shift.id, SITE, undefined, at(START, -600))).rejects.toMatchObject({ code: 'CLOCK_WINDOW' })
    expect((await t.prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })).status).toBe('ASSIGNED')
    expect(await t.prisma.timesheetEntry.count()).toBe(0)
  })

  it('reads the window from config.work', async () => {
    const strict = await createTestApp({ CLOCK_IN_EARLY_MINUTES: '5' })

    try {
      const shift = await shiftFor(t, w)

      await expect(clockIn(strict.ctx, w.worker.actor, shift.id, SITE, undefined, at(START, -6))).rejects.toMatchObject({ code: 'CLOCK_WINDOW' })
      await expect(clockIn(strict.ctx, w.worker.actor, shift.id, SITE, undefined, at(START, -5))).resolves.toMatchObject({ status: 'OPEN' })
    } finally {
      await strict.close()
    }
  })
})

describe('POST /v1/timesheets/:id/clock-out', () => {
  const open = async () => {
    const shift = await liveShift()
    const res = await api().post(`/v1/shifts/${shift.id}/clock-in`, { token: w.worker.token, body: SITE })
    const id = body(res).data?.timesheet.id as string

    // Move the clock-in back so clock-out (server time, now) is clearly after it
    await t.prisma.timesheetEntry.update({ where: { id }, data: { clockInAt: new Date(Date.now() - 65 * 60_000) } })

    return { shift, id }
  }

  it('submits the entry, computes minutes, completes the shift and audits', async () => {
    const { shift, id } = await open()
    const res = await api().post(`/v1/timesheets/${id}/clock-out`, { token: w.worker.token, body: { ...SITE, breakMinutes: 15 } })
    const json = body(res)

    expect(res.statusCode).toBe(200)
    expect(json.data?.timesheet).toMatchObject({ status: 'SUBMITTED', breakMinutes: 15, actualMinutes: 50 })
    expect(json.data?.timesheet.clockOutAt).toBeTruthy()
    expect((await t.prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })).status).toBe('COMPLETED')
    expect(await t.prisma.auditEvent.count({ where: { entity: 'timesheet', entityId: id, action: 'clocked_out' } })).toBe(1)
  })

  it('needs a token and the FIELD_USER role; only the entry owner in the same org finds it', async () => {
    const { id } = await open()
    const url = `/v1/timesheets/${id}/clock-out`

    expect((await api().post(url, { body: SITE })).statusCode).toBe(401)

    for (const other of [w.admin, w.supervisor, w.clientUser]) {
      expect((await api().post(url, { token: other.token, body: SITE })).statusCode).toBe(403)
    }

    const stranger = await signIn(t, 'FIELD_USER')

    expect((await api().post(url, { token: stranger.token, body: SITE })).statusCode).toBe(404)
    expect((await api().post(`/v1/timesheets/${'0'.repeat(8)}-0000-4000-8000-000000000000/clock-out`, { token: w.worker.token, body: SITE })).statusCode).toBe(404)
    expect((await api().post('/v1/timesheets/nope/clock-out', { token: w.worker.token, body: SITE })).statusCode).toBe(400)
    expect((await t.prisma.timesheetEntry.findUniqueOrThrow({ where: { id } })).status).toBe('OPEN')
  })

  it('validates the body: unknown fields, break range, half a point', async () => {
    const { id } = await open()
    const post = (payload: object) => api().post(`/v1/timesheets/${id}/clock-out`, { token: w.worker.token, body: payload })

    expect((await post({ ...SITE, clockOutAt: new Date().toISOString() })).statusCode).toBe(400)
    expect((await post({ ...SITE, breakMinutes: -1 })).statusCode).toBe(400)
    expect((await post({ ...SITE, breakMinutes: 1441 })).statusCode).toBe(400)
    expect((await post({ ...SITE, breakMinutes: 1.5 })).statusCode).toBe(400)
    expect((await post({ lat: 12 })).statusCode).toBe(400)
    expect((await post({ lat: 100, lng: 1 })).statusCode).toBe(400)
  })

  it('a break longer than the shift gives zero minutes, never negative', async () => {
    const { id } = await open()
    const res = await api().post(`/v1/timesheets/${id}/clock-out`, { token: w.worker.token, body: { ...SITE, breakMinutes: 600 } })

    expect(body(res).data?.timesheet.actualMinutes).toBe(0)
  })

  it('a second clock-out (or one on a submitted entry) is CLOCK_STATE', async () => {
    const { id } = await open()

    expect((await api().post(`/v1/timesheets/${id}/clock-out`, { token: w.worker.token, body: SITE })).statusCode).toBe(200)

    const again = await api().post(`/v1/timesheets/${id}/clock-out`, { token: w.worker.token, body: SITE })

    expect(again.statusCode).toBe(409)
    expect(body(again).error?.code).toBe('CLOCK_STATE')

    const { entry } = await entryFor(t, w, { status: 'APPROVED' })

    expect(body(await api().post(`/v1/timesheets/${entry.id}/clock-out`, { token: w.worker.token, body: SITE })).error?.code).toBe('CLOCK_STATE')
  })

  it('RACE: two simultaneous clock-outs produce one result', async () => {
    const { id, shift } = await open()
    const results = await Promise.all([1, 2, 3].map(() => api().post(`/v1/timesheets/${id}/clock-out`, { token: w.worker.token, body: { ...SITE, breakMinutes: 5 } })))

    expect(results.map(r => r.statusCode).sort()).toEqual([200, 409, 409])
    expect(await t.prisma.auditEvent.count({ where: { entityId: id, action: 'clocked_out' } })).toBe(1)
    expect((await t.prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })).status).toBe('COMPLETED')
  })

  it('refuses a clock-out that would not be after the clock-in', async () => {
    const shift = await shiftFor(t, w)
    const opened = await clockIn(t.ctx, w.worker.actor, shift.id, SITE, undefined, START)

    await expect(clockOut(t.ctx, w.worker.actor, opened.id, SITE, undefined, START)).rejects.toMatchObject({ code: 'UNPROCESSABLE' })
  })
})

describe('exceptions raised by clocking (boundaries)', () => {
  it('on time and on site: none', async () => {
    const { entry, types } = await work({})

    expect(types).toEqual([])
    expect(entry).toMatchObject({ status: 'SUBMITTED', actualMinutes: 480 })
  })

  it('LATE_IN: exactly 10 minutes late is fine, 11 raises with the minutes', async () => {
    expect((await work({ inAt: at(START, 10) })).types).toEqual([])

    const late = await work({ inAt: at(START, 11) })

    expect(late.types).toEqual(['LATE_IN'])
    expect(late.exceptions[0]?.detail).toMatchObject({ minutesLate: 11 })
  })

  it('EARLY_OUT: exactly 10 minutes early is fine, 11 raises', async () => {
    expect((await work({ outAt: at(END, -10) })).types).toEqual([])
    expect((await work({ outAt: at(END, -11) })).types).toEqual(['EARLY_OUT'])
  })

  it('OVERTIME (daily): scheduled + 15 minutes is fine, +16 raises', async () => {
    expect((await work({ outAt: at(END, 15) })).types).toEqual([])
    expect((await work({ outAt: at(END, 16) })).types).toEqual(['OVERTIME'])
  })

  it('a break brings a long day back under the overtime threshold', async () => {
    expect((await work({ outAt: at(END, 60), breakMinutes: 45 })).types).toEqual([])
  })

  it('GEOFENCE_MISS: 299 m fine, 301 m raises for either clock point', async () => {
    expect((await work({ inPoint: northOf(299), outPoint: northOf(299) })).types).toEqual([])

    const far = await work({ outPoint: northOf(301) })

    expect(far.types).toEqual(['GEOFENCE_MISS'])
    expect(far.exceptions[0]?.detail).toMatchObject({ limitMeters: 300, clockOutDistanceMeters: 301 })
    expect((await work({ inPoint: northOf(301) })).types).toEqual(['GEOFENCE_MISS'])
  })

  it('GEOFENCE_MISS: a missing GPS point on a site with coordinates raises; a site without coordinates never does', async () => {
    expect((await work({ outPoint: {} })).types).toEqual(['GEOFENCE_MISS'])

    await t.prisma.site.update({ where: { id: w.fixture.site.id }, data: { lat: null, lng: null } })

    expect((await work({ inPoint: {}, outPoint: northOf(50_000) })).types).toEqual([])
  })

  it('reads every threshold from config.work', async () => {
    const strict = await createTestApp({ LATE_IN_MINUTES: '2', GEOFENCE_METERS: '50' })

    try {
      const shift = await shiftFor(t, w)
      const opened = await clockIn(strict.ctx, w.worker.actor, shift.id, northOf(60), undefined, at(START, 3))

      expect(opened.exceptions.map(e => e.type).sort()).toEqual(['GEOFENCE_MISS', 'LATE_IN'])
    } finally {
      await strict.close()
    }
  })

  it('clock-in already raises LATE_IN and GEOFENCE_MISS; clock-out adds the rest and refreshes numbers', async () => {
    const shift = await shiftFor(t, w)
    const opened = await clockIn(t.ctx, w.worker.actor, shift.id, northOf(400), undefined, at(START, 20))

    expect(opened.exceptions.map(e => e.type).sort()).toEqual(['GEOFENCE_MISS', 'LATE_IN'])

    const closed = await clockOut(t.ctx, w.worker.actor, opened.id, SITE, undefined, at(END, -30))

    expect(closed.exceptions.map(e => e.type).sort()).toEqual(['EARLY_OUT', 'GEOFENCE_MISS', 'LATE_IN'])
    expect(closed.exceptions.find(e => e.type === 'GEOFENCE_MISS')?.detail).toMatchObject({ clockInDistanceMeters: 400 })
  })
})

describe('weekly overtime (Monday-start week in the SITE timezone)', () => {
  // Site is Chicago. Week of START: Mon 2026-03-02 00:00 CST (06:00Z) .. Mon 2026-03-09 00:00 CDT (05:00Z, DST started on the 8th)
  const prior = (clockIn: string, minutes: number, status: 'SUBMITTED' | 'REJECTED' | 'APPROVED' = 'SUBMITTED', worker = w.worker.user) =>
    entryFor(t, w, {
      status,
      worker,
      start: new Date(clockIn),
      end: at(new Date(clockIn), 60),
      clockInAt: new Date(clockIn),
      clockOutAt: at(new Date(clockIn), 60),
      actualMinutes: minutes
    })

  const scenario = async (thisWeekMinutes: number) => {
    await prior('2026-03-02T05:30:00Z', 3000) // Sun 23:30 CST: last week, excluded
    await prior('2026-03-02T06:30:00Z', thisWeekMinutes) // Mon 00:30 CST: included
    await prior('2026-03-03T06:30:00Z', 5000, 'REJECTED') // rejected: excluded
    await prior('2026-03-09T05:30:00Z', 3000) // Mon 00:30 CDT: next week, excluded
    await prior('2026-03-04T06:30:00Z', 3000, 'SUBMITTED', (await signIn(t, 'FIELD_USER')).user) // another worker

    return work({})
  }

  it('exactly 2400 minutes in the week is fine', async () => {
    expect((await scenario(1920)).types).toEqual([])
  })

  it('2401 raises OVERTIME (WEEKLY) and only counts this worker, this week, non-rejected', async () => {
    const result = await scenario(1921)

    expect(result.types).toEqual(['OVERTIME'])
    expect(result.exceptions[0]?.detail).toMatchObject({ reasons: ['WEEKLY'], weeklyMinutes: 2401, weeklyLimitMinutes: 2400 })
  })

  it('uses the organization timezone when the site has none', async () => {
    await t.prisma.site.update({ where: { id: w.fixture.site.id }, data: { timezone: null } })

    // org zone is America/Chicago too: same week boundaries
    expect((await scenario(1921)).types).toEqual(['OVERTIME'])
  })

  it('a different site timezone moves the week boundary', async () => {
    // In Tokyo the week starts Mon 00:00 JST = Sun 15:00Z, so the "last week" entry of the Chicago scenario counts
    await t.prisma.site.update({ where: { id: w.fixture.site.id }, data: { timezone: 'Asia/Tokyo' } })
    await prior('2026-03-02T05:30:00Z', 2000)

    expect((await work({})).types).toEqual(['OVERTIME'])
  })
})
