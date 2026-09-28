import { describe, expect, it } from 'vitest'

import { blankRow, hours, siteTotals, toInput, validate } from './coverageRows'

const SITE = '2c69760a-5293-4a80-8eab-e5fbb1ae7926'

describe('validate', () => {
  it('accepts the default weekly row', () => {
    expect(validate([blankRow(SITE)])).toEqual({})
  })

  it('needs days and two different times on a weekly row', () => {
    const errors = validate([{ ...blankRow(SITE), weekdays: [], timeStart: '09:00', timeEnd: '09:00' }])

    expect(errors[0]).toMatchObject({ weekdays: expect.any(String), timeEnd: expect.any(String) })
  })

  it('checks the interval and ad hoc counts', () => {
    expect(validate([{ ...blankRow(SITE), patternType: 'INTERVAL', intervalDays: '0' }])[0]?.intervalDays).toBeDefined()
    expect(validate([{ ...blankRow(SITE), patternType: 'INTERVAL', intervalDays: '30' }])).toEqual({})
    expect(
      validate([{ ...blankRow(SITE), patternType: 'AD_HOC', visitsPerPeriod: '1001' }])[0]?.visitsPerPeriod
    ).toBeDefined()
  })
})

describe('toInput', () => {
  it('sends only the fields of the chosen pattern (the API schema is strict)', () => {
    expect(toInput(blankRow(SITE))).toEqual({
      siteId: SITE,
      patternType: 'WEEKLY',
      weekdays: [1, 2, 3, 4, 5],
      timeStart: '08:00',
      timeEnd: '12:00'
    })
    expect(toInput({ ...blankRow(SITE), patternType: 'INTERVAL', intervalDays: '14' })).toEqual({
      siteId: SITE,
      patternType: 'INTERVAL',
      weekdays: [],
      intervalDays: 14
    })
    expect(toInput({ ...blankRow(SITE), patternType: 'AD_HOC', visitsPerPeriod: '3' })).toEqual({
      siteId: SITE,
      patternType: 'AD_HOC',
      weekdays: [],
      visitsPerPeriod: 3
    })
  })
})

describe('siteTotals', () => {
  it('adds weekly visits and hours, including overnight rows, and averages intervals', () => {
    const totals = siteTotals([
      blankRow(SITE),
      { ...blankRow(SITE), weekdays: [6], timeStart: '22:00', timeEnd: '06:00' },
      { ...blankRow(SITE), patternType: 'INTERVAL', intervalDays: '7' },
      { ...blankRow(SITE), patternType: 'AD_HOC', visitsPerPeriod: '4' }
    ])

    expect(totals).toEqual({ visits: 7, minutes: 5 * 240 + 480 })
    expect(hours(totals.minutes)).toBe('28h')
  })
})
