import { describe, expect, it } from 'vitest'

import { shiftTimes } from './shiftTimes'

const CHICAGO = 'America/Chicago'

describe('shiftTimes', () => {
  it('turns a site-local date and times into instants', () => {
    expect(shiftTimes('2026-03-04', '09:00', '17:00', CHICAGO)).toEqual({
      ok: true,
      start: '2026-03-04T15:00:00.000Z',
      end: '2026-03-04T23:00:00.000Z',
      overnight: false,
      hours: 8
    })
  })

  it('an end at or before the start means the next day', () => {
    expect(shiftTimes('2026-03-02', '18:00', '02:00', CHICAGO)).toMatchObject({
      ok: true,
      start: '2026-03-03T00:00:00.000Z',
      end: '2026-03-03T08:00:00.000Z',
      overnight: true,
      hours: 8
    })
  })

  it('refuses missing values and identical times', () => {
    expect(shiftTimes('', '09:00', '17:00', CHICAGO)).toMatchObject({ ok: false })
    expect(shiftTimes('2026-03-04', '09:00', '', CHICAGO)).toMatchObject({ ok: false })
    expect(shiftTimes('2026-03-04', '09:00', '09:00', CHICAGO)).toEqual({ ok: false, error: 'Start and end cannot be the same time.' })
  })
})
