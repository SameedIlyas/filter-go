import { describe, expect, it } from 'vitest'

import { generateWindows } from '../src/modules/scheduling/coverage-pattern.js'
import { shiftDefaults } from '../src/modules/scheduling/shift-defaults.js'
import type { TermsSnapshot } from '../src/lib/terms-snapshot.js'

type Row = TermsSnapshot['coverage'][number]

const weekly = (weekdays: number[], timeStart: string | null, timeEnd: string | null): Row => ({
  siteId: 's',
  patternType: 'WEEKLY',
  weekdays,
  timeStart,
  timeEnd,
  intervalDays: null,
  visitsPerPeriod: null
})

const interval = (intervalDays: number | null, timeStart: string | null = null, timeEnd: string | null = null): Row => ({
  siteId: 's',
  patternType: 'INTERVAL',
  weekdays: [],
  timeStart,
  timeEnd,
  intervalDays,
  visitsPerPeriod: null
})

const iso = (windows: ReturnType<typeof generateWindows>) => windows.map(window => [window.start.toISOString(), window.end.toISOString()])

const CHICAGO = 'America/Chicago'

describe('generateWindows: WEEKLY', () => {
  it('emits one window per matching weekday and ends the next day when timeEnd <= timeStart', () => {
    const windows = generateWindows([weekly([1, 3], '18:00', '02:00')], { start: '2026-03-02', end: '2026-03-08' }, CHICAGO, '2026-01-01')

    expect(iso(windows)).toEqual([
      ['2026-03-03T00:00:00.000Z', '2026-03-03T08:00:00.000Z'],
      ['2026-03-05T00:00:00.000Z', '2026-03-05T08:00:00.000Z']
    ])
  })

  it('keeps wall-clock times across the US spring-forward day (2026-03-08)', () => {
    const windows = generateWindows([weekly([1, 2, 3, 4, 5, 6, 7], '18:00', '23:00')], { start: '2026-03-07', end: '2026-03-09' }, CHICAGO, '2026-01-01')

    expect(iso(windows)).toEqual([
      // Sat 18:00-23:00 CST (UTC-6)
      ['2026-03-08T00:00:00.000Z', '2026-03-08T05:00:00.000Z'],
      // Sun 18:00-23:00 CDT (UTC-5): the same wall clock is one hour earlier in UTC
      ['2026-03-08T23:00:00.000Z', '2026-03-09T04:00:00.000Z'],
      // Mon 18:00-23:00 CDT
      ['2026-03-09T23:00:00.000Z', '2026-03-10T04:00:00.000Z']
    ])
  })

  it('resolves a shift that ends inside the skipped hour to the first real instant after the gap', () => {
    const [saturday] = generateWindows([weekly([6], '18:00', '02:00')], { start: '2026-03-07', end: '2026-03-07' }, CHICAGO, '2026-01-01')

    // 02:00 does not exist on 2026-03-08 in Chicago: clocks jump from 01:59 CST to 03:00 CDT (= 08:00Z)
    expect(saturday?.start.toISOString()).toBe('2026-03-08T00:00:00.000Z')
    expect(saturday?.end.toISOString()).toBe('2026-03-08T08:00:00.000Z')
  })

  it('handles the fall-back day (2026-11-01): the night shift is one hour longer in real time', () => {
    const windows = generateWindows([weekly([6, 7], '18:00', '02:00')], { start: '2026-10-31', end: '2026-11-01' }, CHICAGO, '2026-01-01')

    expect(iso(windows)).toEqual([
      // Sat Oct 31 18:00 CDT -> Sun Nov 1 02:00 CST: 9 real hours
      ['2026-10-31T23:00:00.000Z', '2026-11-01T08:00:00.000Z'],
      // Sun Nov 1 18:00 CST -> Mon Nov 2 02:00 CST: 8 real hours
      ['2026-11-02T00:00:00.000Z', '2026-11-02T08:00:00.000Z']
    ])
  })

  it('a shift on the last day of the period may end after the period', () => {
    const windows = generateWindows([weekly([1], '22:00', '06:00')], { start: '2026-03-02', end: '2026-03-02' }, CHICAGO, '2026-01-01')

    expect(iso(windows)).toEqual([['2026-03-03T04:00:00.000Z', '2026-03-03T12:00:00.000Z']])
  })

  it('a same-day shift stays on the same day', () => {
    const windows = generateWindows([weekly([1], '08:00', '16:30')], { start: '2026-03-02', end: '2026-03-02' }, CHICAGO, '2026-01-01')

    expect(iso(windows)).toEqual([['2026-03-02T14:00:00.000Z', '2026-03-02T22:30:00.000Z']])
  })

  it('skips rows with missing or equal times, and de-duplicates identical rows', () => {
    const period = { start: '2026-03-02', end: '2026-03-02' }

    expect(generateWindows([weekly([1], null, '10:00')], period, CHICAGO, '2026-01-01')).toEqual([])
    expect(generateWindows([weekly([1], '10:00', '10:00')], period, CHICAGO, '2026-01-01')).toEqual([])
    expect(generateWindows([weekly([1], '08:00', '10:00'), weekly([1], '08:00', '10:00')], period, CHICAGO, '2026-01-01')).toHaveLength(1)
  })

  it('a site with a different zone gets different instants for the same wall clock', () => {
    const period = { start: '2026-03-02', end: '2026-03-02' }
    const [london] = generateWindows([weekly([1], '09:00', '17:00')], period, 'Europe/London', '2026-01-01')
    const [tokyo] = generateWindows([weekly([1], '09:00', '17:00')], period, 'Asia/Tokyo', '2026-01-01')

    expect(london?.start.toISOString()).toBe('2026-03-02T09:00:00.000Z')
    expect(tokyo?.start.toISOString()).toBe('2026-03-02T00:00:00.000Z')
  })
})

describe('generateWindows: INTERVAL', () => {
  it('counts from the contract start when there is no earlier shift, with the 09:00-17:00 default', () => {
    // 2026-01-01 + 5k lands on Mar 2, 7 and 12 (Mar 2 is day 60)
    const windows = generateWindows([interval(5)], { start: '2026-03-01', end: '2026-03-15' }, CHICAGO, '2026-01-01')

    expect(iso(windows)).toEqual([
      ['2026-03-02T15:00:00.000Z', '2026-03-02T23:00:00.000Z'],
      ['2026-03-07T15:00:00.000Z', '2026-03-07T23:00:00.000Z'],
      ['2026-03-12T14:00:00.000Z', '2026-03-12T22:00:00.000Z']
    ])
  })

  it('counts from an anchor date taken from earlier shifts', () => {
    const windows = generateWindows([interval(5)], { start: '2026-03-05', end: '2026-03-20' }, CHICAGO, '2026-03-02')

    expect(windows.map(window => window.start.toISOString().slice(0, 10))).toEqual(['2026-03-07', '2026-03-12', '2026-03-17'])
  })

  it('the anchor day itself counts when it is inside the period', () => {
    const windows = generateWindows([interval(3)], { start: '2026-03-02', end: '2026-03-08' }, CHICAGO, '2026-03-02')

    expect(windows).toHaveLength(3)
  })

  it('uses the coverage times when both are set, including midnight crossing', () => {
    const windows = generateWindows([interval(7, '22:00', '06:00')], { start: '2026-03-02', end: '2026-03-02' }, CHICAGO, '2026-03-02')

    expect(iso(windows)).toEqual([['2026-03-03T04:00:00.000Z', '2026-03-03T12:00:00.000Z']])
  })

  it('across the spring-forward day the visit keeps its wall clock time', () => {
    const windows = generateWindows([interval(1)], { start: '2026-03-07', end: '2026-03-09' }, CHICAGO, '2026-03-01')

    expect(windows.map(window => window.start.toISOString())).toEqual(['2026-03-07T15:00:00.000Z', '2026-03-08T14:00:00.000Z', '2026-03-09T14:00:00.000Z'])
  })

  it('an interval of 0 or null generates nothing', () => {
    expect(generateWindows([interval(null)], { start: '2026-03-02', end: '2026-03-08' }, CHICAGO, '2026-03-02')).toEqual([])
    expect(generateWindows([interval(0)], { start: '2026-03-02', end: '2026-03-08' }, CHICAGO, '2026-03-02')).toEqual([])
  })
})

describe('generateWindows: AD_HOC and mixes', () => {
  it('AD_HOC generates nothing', () => {
    const adHoc: Row = { siteId: 's', patternType: 'AD_HOC', weekdays: [], timeStart: null, timeEnd: null, intervalDays: null, visitsPerPeriod: 4 }

    expect(generateWindows([adHoc], { start: '2026-03-02', end: '2026-03-08' }, CHICAGO, '2026-03-02')).toEqual([])
  })

  it('sorts windows from several rows by start time', () => {
    const windows = generateWindows([weekly([3], '08:00', '10:00'), weekly([1], '08:00', '10:00')], { start: '2026-03-02', end: '2026-03-08' }, CHICAGO, '2026-03-02')

    expect(windows.map(window => window.start.toISOString().slice(0, 10))).toEqual(['2026-03-02', '2026-03-04'])
  })
})

describe('shiftDefaults', () => {
  const snapshot = (items: number, billingType: TermsSnapshot['billingType']): TermsSnapshot => ({
    contractId: 'c',
    contractNumber: 'C-1',
    contractVersion: 1,
    billingType,
    billingCycle: 'MONTHLY',
    siteTimezone: CHICAGO,
    serviceItems: Array.from({ length: items }, (_, index) => ({
      lineId: `line-${index}`,
      siteId: 's',
      serviceId: null,
      description: 'x',
      qty: '2.00',
      billRate: '10.00',
      payRate: null,
      estMinutes: null,
      taxCode: null
    })),
    coverage: [],
    generatedAt: '2026-01-01T00:00:00.000Z'
  })

  it('one line: serviceRef is that line, per-visit contracts carry its quantity', () => {
    const defaults = shiftDefaults(snapshot(1, 'PER_VISIT'))

    expect(defaults.serviceRef).toBe('line-0')
    expect(defaults.billableQty?.toFixed(2)).toBe('2.00')
  })

  it('one hourly line: serviceRef is set but there is no billable quantity', () => {
    expect(shiftDefaults(snapshot(1, 'HOURLY'))).toMatchObject({ serviceRef: 'line-0', billableQty: null })
  })

  it('several lines or none: nothing is inferred', () => {
    expect(shiftDefaults(snapshot(2, 'PER_VISIT'))).toEqual({ serviceRef: null, billableQty: null })
    expect(shiftDefaults(snapshot(0, 'PER_VISIT'))).toEqual({ serviceRef: null, billableQty: null })
  })
})
