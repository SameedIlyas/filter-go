import { describe, expect, it } from 'vitest'

import type { Shift } from '@/types/scheduleTypes'

import { canOfferClockIn, clockQueryRange, minutesSince, nextClockable } from './clockLogic'

const NOW = Date.parse('2026-03-02T15:00:00Z')

const shift = (id: string, start: string, end: string, patch: Partial<Shift> = {}): Shift =>
  ({
    id,
    scheduleId: 's',
    scheduleStatus: 'PUBLISHED',
    siteId: 'site',
    site: { id: 'site', name: 'HQ', timezone: 'America/Chicago' },
    scheduledStart: start,
    scheduledEnd: end,
    status: 'ASSIGNED',
    assignedUser: null,
    isExtra: false,
    notes: null,
    serviceRef: null,
    createdAt: start,
    updatedAt: start,
    ...patch
  }) as Shift

describe('nextClockable', () => {
  it('picks the soonest assigned or confirmed shift that has not ended', () => {
    const shifts = [
      shift('later', '2026-03-03T00:00:00Z', '2026-03-03T08:00:00Z'),
      shift('soon', '2026-03-02T16:00:00Z', '2026-03-02T20:00:00Z', { status: 'CONFIRMED' }),
      shift('over', '2026-03-02T06:00:00Z', '2026-03-02T14:00:00Z')
    ]

    expect(nextClockable(shifts, NOW)?.id).toBe('soon')
  })

  it('skips running, finished, cancelled and draft-schedule shifts', () => {
    const shifts = [
      shift('running', '2026-03-02T14:00:00Z', '2026-03-02T22:00:00Z', { status: 'IN_PROGRESS' }),
      shift('cancelled', '2026-03-02T16:00:00Z', '2026-03-02T20:00:00Z', { status: 'CANCELLED' }),
      shift('draft', '2026-03-02T16:00:00Z', '2026-03-02T20:00:00Z', { scheduleStatus: 'DRAFT' })
    ]

    expect(nextClockable(shifts, NOW)).toBeNull()
  })
})

describe('canOfferClockIn', () => {
  it('opens 12 hours before the start and closes at the end', () => {
    expect(canOfferClockIn({ scheduledStart: '2026-03-03T03:00:00Z', scheduledEnd: '2026-03-03T08:00:00Z' }, NOW)).toBe(true)
    expect(canOfferClockIn({ scheduledStart: '2026-03-03T03:01:00Z', scheduledEnd: '2026-03-03T08:00:00Z' }, NOW)).toBe(false)
    expect(canOfferClockIn({ scheduledStart: '2026-03-02T10:00:00Z', scheduledEnd: '2026-03-02T15:00:00Z' }, NOW)).toBe(false)
  })
})

describe('helpers', () => {
  it('queries from yesterday to the day after tomorrow (UTC)', () => {
    expect(clockQueryRange(NOW)).toEqual({ from: '2026-03-01T00:00:00.000Z', to: '2026-03-04T00:00:00.000Z' })
  })

  it('counts whole minutes on shift, never below zero', () => {
    expect(minutesSince('2026-03-02T13:30:30Z', NOW)).toBe(89)
    expect(minutesSince('2026-03-02T16:00:00Z', NOW)).toBe(0)
  })
})
