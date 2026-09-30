import { describe, expect, it } from 'vitest'

import type { ContractCoverage } from '@/types/contractTypes'

import { defaultPeriod, generatePreview } from './generatePreview'

const weekly = (weekdays: number[], extra: Partial<ContractCoverage> = {}): ContractCoverage => ({
  id: 'c1',
  siteId: 'site-1',
  patternType: 'WEEKLY',
  weekdays,
  timeStart: '08:00',
  timeEnd: '12:00',
  intervalDays: null,
  visitsPerPeriod: null,
  ...extra
})

const contract = { startDate: '2026-01-01', endDate: '2026-12-31' as string | null }

describe('generatePreview', () => {
  it('counts weekly visits in the period for this site only', () => {
    const rows = [weekly([1, 3, 5]), weekly([2], { siteId: 'site-2' })]
    const preview = generatePreview(rows, 'site-1', contract, '2026-03-02', '2026-03-29')

    expect(preview).toMatchObject({ periodStart: '2026-03-02', periodEnd: '2026-03-29', estimatedShifts: 12, adHocVisits: null, problem: null })
    expect(preview.patterns).toEqual(['Mon, Wed, Fri 08:00–12:00'])
  })

  it('clamps the period to the contract dates', () => {
    const preview = generatePreview([weekly([2])], 'site-1', { startDate: '2026-03-10', endDate: '2026-03-20' }, '2026-03-01', '2026-03-31')

    expect(preview).toMatchObject({ periodStart: '2026-03-10', periodEnd: '2026-03-20', estimatedShifts: 2, clamped: true })
  })

  it('estimates interval visits and reports ad-hoc visits for manual shifts', () => {
    const interval = generatePreview([weekly([], { patternType: 'INTERVAL', intervalDays: 7, timeStart: null, timeEnd: null })], 'site-1', contract, '2026-03-01', '2026-03-28')
    const adHoc = generatePreview([weekly([], { patternType: 'AD_HOC', visitsPerPeriod: 4 })], 'site-1', contract, '2026-03-01', '2026-03-31')

    expect(interval.estimatedShifts).toBe(4)
    expect(interval.patterns).toEqual(['Every 7 days'])
    expect(adHoc).toMatchObject({ estimatedShifts: 0, adHocVisits: 4, patterns: ['Ad hoc: 4 visits per period'] })
  })

  it('flags problems instead of estimating', () => {
    expect(generatePreview([weekly([1])], 'site-1', contract, '2026-03-10', '2026-03-01').problem).toMatch(/end on or after/i)
    expect(generatePreview([weekly([1])], 'site-1', contract, '2026-01-01', '2026-06-30').problem).toMatch(/93 days/)
    expect(generatePreview([weekly([1])], 'site-1', { startDate: '2027-01-01', endDate: null }, '2026-03-01', '2026-03-31').problem).toMatch(/outside the contract/i)
    expect(generatePreview([], 'site-1', contract, '2026-03-01', '2026-03-31').problem).toMatch(/no coverage/i)
  })
})

describe('defaultPeriod', () => {
  it('is next Monday to the end of that month', () => {
    expect(defaultPeriod('2026-09-30')).toEqual({ periodStart: '2026-10-05', periodEnd: '2026-10-31' })

    // A Monday itself moves to the following Monday
    expect(defaultPeriod('2026-03-02')).toEqual({ periodStart: '2026-03-09', periodEnd: '2026-03-31' })
  })
})
