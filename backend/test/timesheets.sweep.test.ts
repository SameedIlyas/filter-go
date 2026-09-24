import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { AppContext } from '../src/context.js'
import { allJobs } from '../src/jobs/registry.js'
import { runJobNow } from '../src/jobs/scheduler.js'
import { approveEntry } from '../src/modules/timesheets/approval.js'
import { clockIn } from '../src/modules/timesheets/clocking.js'
import { sweepTimesheets } from '../src/modules/timesheets/sweep.js'
import { timesheetsSweepJob } from '../src/modules/timesheets/timesheets.jobs.js'
import { createTestApp, makeSchedule, makeShift, makeTimesheet, resetDb } from './helpers.js'
import type { TestApp } from './helpers.js'
import { at, buildWorld, END, shiftFor, START } from './timesheets.setup.js'
import type { World } from './timesheets.setup.js'

let t: TestApp
let w: World

beforeAll(async () => {
  t = await createTestApp()
})
afterAll(() => t.close())
beforeEach(async () => {
  await resetDb(t.prisma)
  t.mailer.clear()
  w = await buildWorld(t)
})

const SITE = { lat: 41.8781, lng: -87.6298 }

/** An OPEN entry, clocked in on time, for a shift that has the default START..END times. */
const openEntry = async (input: { start?: Date; end?: Date } = {}) => {
  const shift = await shiftFor(t, w, { start: input.start, end: input.end, status: 'IN_PROGRESS' })
  const entry = await makeTimesheet(t, shift, w.worker.user, { status: 'OPEN', clockInAt: shift.scheduledStart, clockOutAt: null, actualMinutes: null })

  return { shift, entry }
}

const audits = (action: string) => t.prisma.auditEvent.findMany({ where: { entity: 'timesheet', action } })
const notes = (type: string) => t.prisma.notification.findMany({ where: { type } })

describe('sweep: missing clock-out', () => {
  it('closes an entry when the shift ended more than missingClockOutHours ago (strictly)', async () => {
    const { shift, entry } = await openEntry()

    expect(await sweepTimesheets(t.ctx, at(END, 120))).toMatchObject({ autoClosed: 0 })
    expect((await t.prisma.timesheetEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe('OPEN')

    const result = await sweepTimesheets(t.ctx, new Date(END.getTime() + 120 * 60_000 + 1))
    const closed = await t.prisma.timesheetEntry.findUniqueOrThrow({ where: { id: entry.id } })

    expect(result).toEqual({ autoClosed: 1, noShows: 0, failed: 0 })
    expect(closed).toMatchObject({ status: 'SUBMITTED', autoClosed: true, actualMinutes: 480 })
    expect(closed.clockOutAt).toEqual(END)
    expect((await t.prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })).status).toBe('COMPLETED')
  })

  it('raises MISSING_CLOCK_OUT (and no clock-out based exceptions), audits as the system and notifies the site supervisors', async () => {
    const { entry } = await openEntry()

    await sweepTimesheets(t.ctx, at(END, 500))

    const exceptions = await t.prisma.timesheetException.findMany({ where: { timesheetEntryId: entry.id } })

    // The makeTimesheet entry has no GPS and the site has coordinates: that clock-in miss is legitimately flagged too
    expect(exceptions.map(e => e.type).sort()).toEqual(['GEOFENCE_MISS', 'MISSING_CLOCK_OUT'])
    expect(exceptions.find(e => e.type === 'GEOFENCE_MISS')?.detail).not.toHaveProperty('clockOutDistanceMeters')

    const [audit] = await audits('auto_closed')

    expect(audit).toMatchObject({ actorId: null, userId: null, orgId: entry.orgId, entityId: entry.id })
    expect(audit?.diff).toMatchObject({ reason: 'missing_clock_out', actualMinutes: 480 })

    const sent = await notes('timesheet.auto_closed')

    expect(sent.map(n => n.userId)).toEqual([w.supervisor.user.id])
    expect(sent[0]?.data).toMatchObject({ timesheetId: entry.id })
    expect(t.mailer.sent).toHaveLength(0)
  })

  it('falls back to the organization admins when the site has no supervisor', async () => {
    await t.prisma.userSiteAccess.deleteMany({ where: { userId: w.supervisor.user.id } })
    await openEntry()
    await sweepTimesheets(t.ctx, at(END, 500))

    expect((await notes('timesheet.auto_closed')).map(n => n.userId)).toEqual([w.admin.user.id])
  })

  it('is idempotent: a second run (or two at once) changes nothing more', async () => {
    const { entry } = await openEntry()
    const now = at(END, 500)
    const runs = await Promise.all([sweepTimesheets(t.ctx, now), sweepTimesheets(t.ctx, now)])

    expect(runs.reduce((sum, run) => sum + run.autoClosed, 0)).toBe(1)
    expect(await sweepTimesheets(t.ctx, now)).toEqual({ autoClosed: 0, noShows: 0, failed: 0 })
    expect(await audits('auto_closed')).toHaveLength(1)
    expect(await notes('timesheet.auto_closed')).toHaveLength(1)
    expect(await t.prisma.timesheetException.count({ where: { timesheetEntryId: entry.id, type: 'MISSING_CLOCK_OUT' } })).toBe(1)
  })

  it('leaves alone entries that are already submitted, and open entries of shifts that have not ended', async () => {
    const live = await openEntry({ start: at(END, 600), end: at(END, 1080) })
    const done = await shiftFor(t, w, { start: at(START, 2880), end: at(END, 2880), status: 'COMPLETED' })

    await makeTimesheet(t, done, w.worker.user, { status: 'SUBMITTED' })

    expect(await sweepTimesheets(t.ctx, at(END, 500))).toEqual({ autoClosed: 0, noShows: 0, failed: 0 })
    expect((await t.prisma.timesheetEntry.findUniqueOrThrow({ where: { id: live.entry.id } })).status).toBe('OPEN')
  })

  it('reads the grace period from config.work', async () => {
    const lax = await createTestApp({ MISSING_CLOCK_OUT_HOURS: '10' })

    try {
      await openEntry()

      expect(await sweepTimesheets(lax.ctx, at(END, 9 * 60))).toMatchObject({ autoClosed: 0 })
      expect(await sweepTimesheets(lax.ctx, at(END, 10 * 60 + 1))).toMatchObject({ autoClosed: 1 })
    } finally {
      await lax.close()
    }
  })
})

describe('sweep: no-show', () => {
  it('marks an unstarted shift NO_SHOW once now is MORE than noShowMinutes after its start', async () => {
    const shift = await shiftFor(t, w)

    expect(await sweepTimesheets(t.ctx, at(START, 30))).toMatchObject({ noShows: 0 })
    expect((await t.prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })).status).toBe('ASSIGNED')

    expect(await sweepTimesheets(t.ctx, new Date(START.getTime() + 30 * 60_000 + 1))).toMatchObject({ noShows: 1 })
    expect((await t.prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })).status).toBe('NO_SHOW')
  })

  it('creates the zero, unbillable, unpayable SUBMITTED entry with a NO_SHOW exception, audit and emailed alert', async () => {
    const shift = await shiftFor(t, w)

    await sweepTimesheets(t.ctx, at(START, 45))
    await t.ctx.background.flush()

    const entry = await t.prisma.timesheetEntry.findUniqueOrThrow({ where: { shiftId: shift.id } })

    expect(entry).toMatchObject({ userId: w.worker.user.id, orgId: shift.orgId, clockInAt: null, clockOutAt: null, actualMinutes: 0, scheduledMinutes: 480, billable: false, payable: false, status: 'SUBMITTED' })
    expect((await t.prisma.timesheetException.findMany({ where: { timesheetEntryId: entry.id } })).map(e => e.type)).toEqual(['NO_SHOW'])
    expect((await audits('no_show'))[0]).toMatchObject({ actorId: null, entityId: entry.id, orgId: shift.orgId })

    const sent = await notes('timesheet.no_show')

    expect(sent.map(n => n.userId)).toEqual([w.supervisor.user.id])
    expect(t.mailer.sent.map(mail => mail.to)).toEqual([w.supervisor.user.email])
  })

  it('covers CONFIRMED and extra shifts, and falls back to admins without a supervisor', async () => {
    await t.prisma.userSiteAccess.deleteMany({ where: { userId: w.supervisor.user.id } })

    const confirmed = await shiftFor(t, w, { status: 'CONFIRMED' })
    const extra = await makeShift(t, w.schedule, { start: at(START, 600).toISOString(), end: at(END, 600).toISOString(), assignedUserId: w.worker.user.id, isExtra: true })

    expect(await sweepTimesheets(t.ctx, at(START, 900))).toMatchObject({ noShows: 2 })
    expect((await t.prisma.shift.findMany({ where: { id: { in: [confirmed.id, extra.id] } } })).map(s => s.status)).toEqual(['NO_SHOW', 'NO_SHOW'])
    expect((await notes('timesheet.no_show')).map(n => n.userId)).toEqual([w.admin.user.id, w.admin.user.id])
  })

  it('ignores shifts that are unassigned, started, cancelled, already have an entry, or sit in a schedule that is not PUBLISHED', async () => {
    const draft = await makeSchedule(t, w.fixture, { status: 'DRAFT', periodStart: '2026-04-01', periodEnd: '2026-04-07' })
    const locked = await makeSchedule(t, w.fixture, { status: 'LOCKED', periodStart: '2026-05-01', periodEnd: '2026-05-07' })
    const times = { start: START.toISOString(), end: END.toISOString() }
    const base = { ...times, assignedUserId: w.worker.user.id }

    await makeShift(t, w.schedule, { ...times })
    await makeShift(t, w.schedule, { ...base, status: 'IN_PROGRESS' })
    await makeShift(t, w.schedule, { ...base, status: 'CANCELLED' })
    await makeShift(t, w.schedule, { ...base, status: 'COMPLETED' })
    await makeShift(t, draft, base)
    await makeShift(t, locked, base)

    const withEntry = await makeShift(t, w.schedule, base)

    await makeTimesheet(t, withEntry, w.worker.user, { status: 'OPEN', clockInAt: START, clockOutAt: null, actualMinutes: null })

    expect(await sweepTimesheets(t.ctx, at(START, 120))).toEqual({ autoClosed: 0, noShows: 0, failed: 0 })
    expect(await t.prisma.timesheetEntry.count()).toBe(1)
  })

  it('is idempotent and safe when two sweeps run at once', async () => {
    await shiftFor(t, w)

    const now = at(START, 60)
    const runs = await Promise.all([sweepTimesheets(t.ctx, now), sweepTimesheets(t.ctx, now)])

    expect(runs.reduce((sum, run) => sum + run.noShows, 0)).toBe(1)
    expect(await sweepTimesheets(t.ctx, now)).toEqual({ autoClosed: 0, noShows: 0, failed: 0 })
    expect(await t.prisma.timesheetEntry.count()).toBe(1)
    expect(await audits('no_show')).toHaveLength(1)
    expect(await notes('timesheet.no_show')).toHaveLength(1)
  })

  it('RACE: a clock-in against the sweep on the same shift leaves exactly one consistent outcome', async () => {
    const shift = await shiftFor(t, w)
    const now = at(START, 31)
    const [clock, sweep] = await Promise.allSettled([clockIn(t.ctx, w.worker.actor, shift.id, SITE, undefined, now), sweepTimesheets(t.ctx, now)])
    const entries = await t.prisma.timesheetEntry.findMany({ where: { shiftId: shift.id } })
    const after = await t.prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })

    expect(sweep.status).toBe('fulfilled')
    expect(entries).toHaveLength(1)

    if (clock.status === 'fulfilled') {
      expect(after.status).toBe('IN_PROGRESS')
      expect(entries[0]?.status).toBe('OPEN')
    } else {
      expect(clock.reason).toMatchObject({ code: 'CLOCK_STATE' })
      expect(after.status).toBe('NO_SHOW')
      expect(entries[0]).toMatchObject({ status: 'SUBMITTED', clockInAt: null })
    }
  })

  it('a worker cannot clock in to a shift already marked no-show', async () => {
    const shift = await shiftFor(t, w)

    await sweepTimesheets(t.ctx, at(START, 60))

    await expect(clockIn(t.ctx, w.worker.actor, shift.id, SITE, undefined, at(START, 61))).rejects.toMatchObject({ code: 'CLOCK_STATE' })
  })

  it('reads the grace period from config.work', async () => {
    const strict = await createTestApp({ NO_SHOW_MINUTES: '5' })

    try {
      await shiftFor(t, w)

      expect(await sweepTimesheets(strict.ctx, at(START, 5))).toMatchObject({ noShows: 0 })
      expect(await sweepTimesheets(strict.ctx, at(START, 6))).toMatchObject({ noShows: 1 })
    } finally {
      await strict.close()
    }
  })
})

describe('sweep: resilience and registration', () => {
  it('one failing row is logged and skipped; the rest are still processed', async () => {
    await shiftFor(t, w)
    await shiftFor(t, w, { start: at(START, 1440), end: at(END, 1440) })

    let calls = 0
    const flaky: AppContext = {
      ...t.ctx,
      prisma: new Proxy(t.ctx.prisma, {
        get: (target, prop, receiver) => {
          if (prop !== '$transaction') return Reflect.get(target, prop, receiver)

          return (...args: Parameters<typeof target.$transaction>) => {
            calls += 1

            return calls === 1 ? Promise.reject(new Error('boom')) : (target.$transaction as (...a: unknown[]) => Promise<unknown>)(...args)
          }
        }
      })
    }

    const result = await sweepTimesheets(flaky, at(START, 3000))

    expect(result).toEqual({ autoClosed: 0, noShows: 1, failed: 1 })
    expect(await t.prisma.timesheetEntry.count()).toBe(1)

    // the failed row is picked up by the next healthy run
    expect(await sweepTimesheets(t.ctx, at(START, 3000))).toMatchObject({ noShows: 1 })
  })

  it('the job is registered as timesheets.sweep every 60 seconds and works through runJobNow', async () => {
    await shiftFor(t, w)

    expect(allJobs.find(job => job.name === 'timesheets.sweep')).toBe(timesheetsSweepJob)
    expect(timesheetsSweepJob.everySeconds).toBe(60)

    // The default clock is "now", so use a shift that is genuinely in the past
    await t.prisma.shift.updateMany({ data: { scheduledStart: new Date(Date.now() - 3 * 3_600_000), scheduledEnd: new Date(Date.now() - 1 * 3_600_000) } })
    await runJobNow(t.ctx, timesheetsSweepJob)

    const lease = await t.prisma.jobLease.findUniqueOrThrow({ where: { name: 'timesheets.sweep' } })

    expect(lease.lastError).toBeNull()
    expect(lease.lastRunAt).toBeInstanceOf(Date)
    expect((await t.prisma.shift.findFirstOrThrow()).status).toBe('NO_SHOW')
  })

  it('an entry auto-closed by the sweep is approvable like any other, with the exception resolved on approval', async () => {
    const { entry } = await openEntry()

    await sweepTimesheets(t.ctx, at(END, 500))

    const approved = await approveEntry(t.ctx, w.admin.actor, entry.id)

    expect(approved.status).toBe('APPROVED')
    expect(approved.exceptions.every(e => e.resolved)).toBe(true)
  })
})
