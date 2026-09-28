import { afterEach, describe, expect, it, vi } from 'vitest'

import { compact, daysUntil, describeCoverage, formatMinutes, parseRowPath, rateUnit, spanMinutes } from './shared'

const weekly = (weekdays: number[], timeStart = '08:00', timeEnd = '12:00') => ({
  patternType: 'WEEKLY' as const,
  weekdays,
  timeStart,
  timeEnd,
  intervalDays: null,
  visitsPerPeriod: null
})

describe('spanMinutes', () => {
  it('measures a same-day window', () => {
    expect(spanMinutes('08:00', '12:30')).toBe(270)
  })

  it('treats an end at or before the start as running past midnight', () => {
    expect(spanMinutes('22:00', '06:00')).toBe(480)
    expect(spanMinutes('09:00', '09:00')).toBe(24 * 60)
  })

  it('is 0 for missing or malformed times', () => {
    expect(spanMinutes(null, '10:00')).toBe(0)
    expect(spanMinutes('8:00', '10:00')).toBe(0)
  })
})

describe('describeCoverage', () => {
  it('names common weekday sets', () => {
    expect(describeCoverage(weekly([1, 2, 3, 4, 5]))).toBe('Weekdays · 08:00–12:00')
    expect(describeCoverage(weekly([7, 6, 5, 4, 3, 2, 1]))).toBe('Every day · 08:00–12:00')
    expect(describeCoverage(weekly([6, 1]))).toBe('Mon, Sat · 08:00–12:00')
  })

  it('flags overnight windows', () => {
    expect(describeCoverage(weekly([6], '22:00', '06:00'))).toBe('Sat · 22:00–06:00 (overnight)')
  })

  it('describes interval and ad hoc patterns', () => {
    expect(describeCoverage({ ...weekly([]), patternType: 'INTERVAL', intervalDays: 1 })).toBe('Every 1 day')
    expect(describeCoverage({ ...weekly([]), patternType: 'INTERVAL', intervalDays: 30 })).toBe('Every 30 days')
    expect(describeCoverage({ ...weekly([]), patternType: 'AD_HOC', visitsPerPeriod: 2 })).toBe(
      'Ad hoc · 2 visits per period'
    )
  })
})

describe('parseRowPath', () => {
  it('reads the row index and field of the root asked for', () => {
    expect(parseRowPath('lines[2].billRate', 'lines')).toEqual({ index: 2, field: 'billRate' })
    expect(parseRowPath('coverage[0]', 'coverage')).toEqual({ index: 0, field: '' })
  })

  it('ignores other roots and non-row paths', () => {
    expect(parseRowPath('coverage[1].weekdays', 'lines')).toBeNull()
    expect(parseRowPath('coverage', 'coverage')).toBeNull()
    expect(parseRowPath('billingCycle', 'lines')).toBeNull()
  })
})

describe('daysUntil', () => {
  afterEach(() => vi.useRealTimers())

  it('counts calendar days from today, whatever the time of day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 28, 23, 30))

    expect(daysUntil('2026-09-28')).toBe(0)
    expect(daysUntil('2026-10-08')).toBe(10)
    expect(daysUntil('2026-09-27')).toBe(-1)
  })
})

describe('small formatters', () => {
  it('formats minutes', () => {
    expect(formatMinutes(null)).toBe('—')
    expect(formatMinutes(45)).toBe('45m')
    expect(formatMinutes(120)).toBe('2h')
    expect(formatMinutes(95)).toBe('1h 35m')
  })

  it('picks the rate unit from the billing type', () => {
    expect(rateUnit('HOURLY')).toBe('/ hr')
    expect(rateUnit('PER_VISIT')).toBe('/ visit')
    expect(rateUnit('MONTHLY_FIXED')).toBe('/ cycle')
  })

  it('compact drops empty strings and undefined but keeps null and false', () => {
    expect(compact({ a: '', b: undefined, c: null, d: false, e: 'x' })).toEqual({ c: null, d: false, e: 'x' })
  })
})
