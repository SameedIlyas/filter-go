import { describe, expect, it } from 'vitest'

import { addDays, dayKeyIn, formatTimeIn, isoWeekday, zonedInstant } from './zoned'

describe('dayKeyIn', () => {
  it('is the calendar date in the given zone, not in UTC', () => {
    // 03:00Z on the 3rd is still the evening of the 2nd in Chicago (UTC-6)
    expect(dayKeyIn('2026-03-03T03:00:00.000Z', 'America/Chicago')).toBe('2026-03-02')
    expect(dayKeyIn('2026-03-03T03:00:00.000Z', 'Asia/Karachi')).toBe('2026-03-03')
    expect(dayKeyIn('2026-03-03T03:00:00.000Z', 'UTC')).toBe('2026-03-03')
  })
})

describe('formatTimeIn', () => {
  it('is 24h HH:mm in the zone', () => {
    expect(formatTimeIn('2026-03-03T00:00:00.000Z', 'America/Chicago')).toBe('18:00')
    expect(formatTimeIn('2026-03-03T00:05:00.000Z', 'UTC')).toBe('00:05')
  })
})

describe('zonedInstant', () => {
  it('turns a local date + time in a zone into the UTC instant', () => {
    expect(zonedInstant('2026-03-02', '18:00', 'America/Chicago')).toBe('2026-03-03T00:00:00.000Z')
    expect(zonedInstant('2026-07-01', '09:30', 'America/Chicago')).toBe('2026-07-01T14:30:00.000Z')
    expect(zonedInstant('2026-03-02', '05:00', 'Asia/Karachi')).toBe('2026-03-02T00:00:00.000Z')
  })

  it('is DST-safe on the day the clocks change', () => {
    // US DST starts 2026-03-08 at 02:00 local: 09:00 that day is CDT (UTC-5)
    expect(zonedInstant('2026-03-08', '09:00', 'America/Chicago')).toBe('2026-03-08T14:00:00.000Z')
    expect(zonedInstant('2026-03-07', '09:00', 'America/Chicago')).toBe('2026-03-07T15:00:00.000Z')
  })
})

describe('addDays / isoWeekday', () => {
  it('works on plain date keys across month and year ends', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('numbers weekdays ISO-style, Monday = 1', () => {
    expect(isoWeekday('2026-03-02')).toBe(1)
    expect(isoWeekday('2026-03-08')).toBe(7)
  })
})
