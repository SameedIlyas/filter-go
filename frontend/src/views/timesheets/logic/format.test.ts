import { describe, expect, it } from 'vitest'

import { describeException, formatAge, formatMinutes, formatVariance } from './format'

describe('formatMinutes', () => {
  it('reads as hours and minutes', () => {
    expect(formatMinutes(480)).toBe('8h')
    expect(formatMinutes(465)).toBe('7h 45m')
    expect(formatMinutes(45)).toBe('45m')
    expect(formatMinutes(0)).toBe('0m')
    expect(formatMinutes(-65)).toBe('-1h 5m')
  })

  it('shows a dash when there is no number', () => {
    expect(formatMinutes(null)).toBe('—')
    expect(formatMinutes(undefined)).toBe('—')
  })
})

describe('formatVariance', () => {
  it('signs the difference from the schedule and hides a match or a missing actual', () => {
    expect(formatVariance(495, 480)).toBe('+15m')
    expect(formatVariance(415, 480)).toBe('-1h 5m')
    expect(formatVariance(480, 480)).toBe('')
    expect(formatVariance(null, 480)).toBe('')
  })
})

describe('describeException', () => {
  it('uses the numbers in detail', () => {
    expect(describeException({ type: 'LATE_IN', detail: { minutesLate: 23, thresholdMinutes: 10 } })).toBe('Clocked in 23m late')
    expect(describeException({ type: 'EARLY_OUT', detail: { minutesEarly: 75 } })).toBe('Clocked out 1h 15m early')
    expect(
      describeException({ type: 'OVERTIME', detail: { reasons: ['DAILY', 'WEEKLY'], actualMinutes: 600, scheduledMinutes: 480, weeklyMinutes: 2520, weeklyLimitMinutes: 2400 } })
    ).toBe('Overtime: 2h over the shift; 42h this week (limit 40h)')
    expect(describeException({ type: 'GEOFENCE_MISS', detail: { limitMeters: 200, clockInDistanceMeters: 1460, clockOutDistanceMeters: null } })).toBe(
      'Outside the site: clock-in 1.5 km away, clock-out no GPS'
    )
    expect(describeException({ type: 'GEOFENCE_MISS', detail: { clockOutDistanceMeters: 320 } })).toBe('Outside the site: clock-out 320 m away')
  })

  it('falls back to a plain label when detail is missing or odd', () => {
    expect(describeException({ type: 'LATE_IN', detail: {} })).toBe('Clocked in late')
    expect(describeException({ type: 'OVERTIME', detail: { reasons: 'nope' } })).toBe('Overtime')
    expect(describeException({ type: 'NO_SHOW', detail: {} })).toBe('Did not clock in')
    expect(describeException({ type: 'MISSING_CLOCK_OUT', detail: {} })).toBe('Never clocked out; closed at the scheduled end')
  })
})

describe('formatAge', () => {
  const now = Date.parse('2026-03-03T12:00:00Z')

  it('reads as the time waited', () => {
    expect(formatAge('2026-03-03T11:59:40Z', now)).toBe('just now')
    expect(formatAge('2026-03-03T11:48:00Z', now)).toBe('12m ago')
    expect(formatAge('2026-03-03T09:00:00Z', now)).toBe('3h ago')
    expect(formatAge('2026-03-01T13:00:00Z', now)).toBe('47h ago')
    expect(formatAge('2026-02-28T12:00:00Z', now)).toBe('3d ago')
    expect(formatAge('2026-03-03T13:00:00Z', now)).toBe('just now')
  })
})
