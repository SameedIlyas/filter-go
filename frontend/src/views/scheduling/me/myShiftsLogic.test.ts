import { describe, expect, it } from 'vitest'

import type { Shift } from '@/types/scheduleTypes'

import { buildExtraShift, calendarZone, queryRangeFor, siteZones, toShiftEvents, upcomingShifts, wallClockAsUtc } from './myShiftsLogic'

const shift = (overrides: Partial<Shift> = {}): Shift => ({
  id: 's1',
  scheduleId: 'sch1',
  scheduleStatus: 'PUBLISHED',
  siteId: 'site1',
  site: { id: 'site1', name: 'Depot', timezone: 'America/Chicago' },
  scheduledStart: '2026-03-03T00:00:00.000Z',
  scheduledEnd: '2026-03-03T08:00:00.000Z',
  status: 'ASSIGNED',
  assignedUser: { id: 'u1', name: 'Sam' },
  isExtra: false,
  notes: null,
  serviceRef: null,
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
  ...overrides
})

describe('queryRangeFor', () => {
  it('pads the visible dates a day either side, whatever zone FullCalendar reported them in', () => {
    const expected = { from: '2026-03-01T00:00:00.000Z', to: '2026-03-10T00:00:00.000Z' }

    expect(queryRangeFor('2026-03-02T00:00:00Z', '2026-03-09T00:00:00Z')).toEqual(expected)
    expect(queryRangeFor('2026-03-02T00:00:00+05:00', '2026-03-09T00:00:00+05:00')).toEqual(expected)
  })
})

describe('calendarZone', () => {
  it('uses the site zone when every shift shares one', () => {
    expect(calendarZone([shift(), shift({ id: 's2' })])).toEqual({ mode: 'site', zone: 'America/Chicago' })
  })

  it('falls back to local time, flagged as mixed, when zones differ', () => {
    const karachi = shift({ site: { id: 'site2', name: 'Port', timezone: 'Asia/Karachi' } })

    expect(calendarZone([shift(), karachi])).toEqual({ mode: 'local', mixed: true })
    expect(calendarZone([])).toEqual({ mode: 'local', mixed: false })
  })
})

describe('toShiftEvents', () => {
  it('coerces site wall clock to UTC in site mode and keeps instants in local mode', () => {
    const [site] = toShiftEvents([shift()], { mode: 'site', zone: 'America/Chicago' })

    expect(site.start).toBe('2026-03-02T18:00:00Z')
    expect(site.end).toBe('2026-03-03T02:00:00Z')

    const [local] = toShiftEvents([shift()], { mode: 'local', mixed: true })

    expect(local.start).toBe('2026-03-03T00:00:00.000Z')
  })

  it('marks extra shifts in the title', () => {
    expect(toShiftEvents([shift({ isExtra: true })], { mode: 'local', mixed: false })[0].title).toBe('Depot · Extra')
  })
})

describe('wallClockAsUtc', () => {
  it('writes the zone wall clock as UTC', () => {
    expect(wallClockAsUtc('2026-03-03T03:30:00.000Z', 'Asia/Karachi')).toBe('2026-03-03T08:30:00Z')
  })
})

describe('upcomingShifts', () => {
  const now = Date.parse('2026-03-03T04:00:00.000Z')

  it('keeps unfinished, not-cancelled shifts that have not ended, soonest first, capped', () => {
    const shifts = [
      shift({ id: 'later', scheduledStart: '2026-03-05T00:00:00.000Z', scheduledEnd: '2026-03-05T08:00:00.000Z' }),
      shift({ id: 'running' }),
      shift({ id: 'cancelled', status: 'CANCELLED', scheduledStart: '2026-03-04T00:00:00.000Z', scheduledEnd: '2026-03-04T08:00:00.000Z' }),
      shift({ id: 'past', scheduledStart: '2026-03-01T00:00:00.000Z', scheduledEnd: '2026-03-01T08:00:00.000Z' }),
      shift({ id: 'soon', scheduledStart: '2026-03-04T00:00:00.000Z', scheduledEnd: '2026-03-04T08:00:00.000Z' }),
      shift({ id: 'last', scheduledStart: '2026-03-06T00:00:00.000Z', scheduledEnd: '2026-03-06T08:00:00.000Z' })
    ]

    expect(upcomingShifts(shifts, now).map(item => item.id)).toEqual(['running', 'soon', 'later'])
  })
})

describe('siteZones', () => {
  it('maps each site to its timezone', () => {
    expect(siteZones([shift()]).get('site1')).toBe('America/Chicago')
  })
})

describe('buildExtraShift', () => {
  const period = { start: '2026-03-01', end: '2026-03-31' }

  it('turns site-local times into instants', () => {
    expect(buildExtraShift({ date: '2026-03-02', startTime: '09:00', endTime: '13:30', zone: 'America/Chicago', period })).toEqual({
      ok: true,
      start: '2026-03-02T15:00:00.000Z',
      end: '2026-03-02T19:30:00.000Z'
    })
  })

  it('treats an end before the start as the next day', () => {
    const result = buildExtraShift({ date: '2026-03-02', startTime: '22:00', endTime: '02:00', zone: 'UTC', period })

    expect(result).toEqual({ ok: true, start: '2026-03-02T22:00:00.000Z', end: '2026-03-03T02:00:00.000Z' })
  })

  it('refuses equal times and dates outside the period', () => {
    expect(buildExtraShift({ date: '2026-03-02', startTime: '09:00', endTime: '09:00', zone: 'UTC', period })).toMatchObject({ ok: false, field: 'endTime' })
    expect(buildExtraShift({ date: '2026-04-01', startTime: '09:00', endTime: '10:00', zone: 'UTC', period })).toMatchObject({ ok: false, field: 'date' })
  })
})
