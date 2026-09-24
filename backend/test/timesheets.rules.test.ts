import { describe, expect, it } from 'vitest'

import type { TimesheetStatus } from '../src/generated/prisma/client.js'
import { D } from '../src/lib/money.js'
import { buildTermsSnapshot } from '../src/lib/terms-snapshot.js'
import { detectExceptions } from '../src/modules/timesheets/exception-rules.js'
import type { RuleInput, WorkRules } from '../src/modules/timesheets/exception-rules.js'
import { haversineMeters } from '../src/modules/timesheets/geo.js'
import { resolveRates } from '../src/modules/timesheets/pricing.js'
import { assertTransition, TRANSITIONS } from '../src/modules/timesheets/state.js'
import { computeActualMinutes, resolveTimes } from '../src/modules/timesheets/time-rules.js'
import { at, END, START } from './timesheets.setup.js'

const RULES: WorkRules = {
  lateInMinutes: 10,
  earlyOutMinutes: 10,
  overtimeThresholdMinutes: 15,
  weeklyOvertimeMinutes: 2400,
  geofenceMeters: 300,
  missingClockOutHours: 2,
  noShowMinutes: 30,
  clockInEarlyMinutes: 60
}

const SITE = { lat: 41.8781, lng: -87.6298 }
// 1 degree of latitude is about 111,195 m, so this is ~ 1 m per 0.000009 degrees
const northOf = (meters: number) => ({ lat: SITE.lat + meters / 111_194.9266, lng: SITE.lng })

const base: RuleInput = {
  scheduledStart: START,
  scheduledEnd: END,
  scheduledMinutes: 480,
  clockInAt: START,
  clockOutAt: END,
  actualMinutes: 480,
  autoClosed: false,
  clockInPoint: SITE,
  clockOutPoint: SITE,
  sitePoint: SITE,
  weeklyMinutes: 480
}

const types = (input: Partial<RuleInput>, rules: WorkRules = RULES) => detectExceptions({ ...base, ...input }, rules).map(found => found.type)

describe('haversine', () => {
  it('is zero for the same point, symmetric, and about 111.2 km per degree of latitude', () => {
    expect(haversineMeters(SITE, SITE)).toBe(0)
    expect(haversineMeters(SITE, { lat: SITE.lat + 1, lng: SITE.lng })).toBeCloseTo(111_195, -2)
    expect(haversineMeters(SITE, northOf(500))).toBeCloseTo(haversineMeters(northOf(500), SITE), 6)
    expect(haversineMeters(SITE, northOf(300))).toBeCloseTo(300, 0)
  })

  it('handles the antimeridian', () => {
    expect(haversineMeters({ lat: 0, lng: 179.9999 }, { lat: 0, lng: -179.9999 })).toBeLessThan(30)
  })
})

describe('exception rules: every threshold is strict', () => {
  it('LATE_IN: exactly at the threshold is fine, one minute past raises', () => {
    expect(types({ clockInAt: at(START, 10) })).toEqual([])
    expect(types({ clockInAt: at(START, 11) })).toEqual(['LATE_IN'])
    expect(detectExceptions({ ...base, clockInAt: at(START, 11) }, RULES)[0]?.detail).toMatchObject({ minutesLate: 11, thresholdMinutes: 10 })
    expect(types({ clockInAt: new Date(START.getTime() + 10 * 60_000 + 1) })).toEqual(['LATE_IN'])
  })

  it('EARLY_OUT: exactly at the threshold is fine, one minute earlier raises', () => {
    expect(types({ clockOutAt: at(END, -10), actualMinutes: 470 })).toEqual([])
    expect(types({ clockOutAt: at(END, -11), actualMinutes: 469 })).toEqual(['EARLY_OUT'])
  })

  it('OVERTIME (daily): scheduled + threshold is fine, one minute more raises', () => {
    expect(types({ actualMinutes: 495, weeklyMinutes: 495 })).toEqual([])
    expect(types({ actualMinutes: 496, weeklyMinutes: 496 })).toEqual(['OVERTIME'])
  })

  it('OVERTIME (weekly): exactly the weekly limit is fine, one minute more raises', () => {
    expect(types({ weeklyMinutes: 2400 })).toEqual([])

    const found = detectExceptions({ ...base, weeklyMinutes: 2401 }, RULES)

    expect(found.map(item => item.type)).toEqual(['OVERTIME'])
    expect(found[0]?.detail).toMatchObject({ reasons: ['WEEKLY'], weeklyMinutes: 2401, weeklyLimitMinutes: 2400 })
  })

  it('OVERTIME reports both reasons when both apply', () => {
    expect(detectExceptions({ ...base, actualMinutes: 600, weeklyMinutes: 3000 }, RULES)[0]?.detail).toMatchObject({ reasons: ['DAILY', 'WEEKLY'] })
  })

  it('GEOFENCE_MISS: exactly at the limit is fine, beyond raises', () => {
    const distance = haversineMeters(northOf(250), SITE)

    expect(types({ clockInPoint: northOf(250) }, { ...RULES, geofenceMeters: distance })).toEqual([])
    expect(types({ clockInPoint: northOf(250) }, { ...RULES, geofenceMeters: distance - 0.001 })).toEqual(['GEOFENCE_MISS'])
    expect(types({ clockInPoint: northOf(299) })).toEqual([])
    expect(types({ clockOutPoint: northOf(301) })).toEqual(['GEOFENCE_MISS'])
  })

  it('GEOFENCE_MISS: skipped for a site without coordinates, raised for a missing point when the site has them', () => {
    expect(types({ sitePoint: null, clockInPoint: null, clockOutPoint: null })).toEqual([])
    expect(types({ clockInPoint: null })).toEqual(['GEOFENCE_MISS'])
    expect(detectExceptions({ ...base, clockInPoint: null, clockOutPoint: northOf(400) }, RULES)[0]?.detail).toMatchObject({
      limitMeters: 300,
      clockInDistanceMeters: null,
      clockOutDistanceMeters: 400
    })
  })

  it('GEOFENCE_MISS only judges points that exist in time: an open entry has no clock-out point yet, an auto-closed one never will', () => {
    expect(types({ clockOutAt: null, clockOutPoint: null, actualMinutes: null, weeklyMinutes: 0 })).toEqual([])
    expect(types({ autoClosed: true, clockOutPoint: null })).toEqual([])
    expect(types({ clockInAt: null, clockOutAt: null, clockInPoint: null, clockOutPoint: null, actualMinutes: 0, weeklyMinutes: 0 })).toEqual([])
  })

  it('an auto-closed entry does not raise EARLY_OUT', () => {
    expect(types({ autoClosed: true, clockOutAt: at(END, -60) })).toEqual([])
  })

  it('reports several at once', () => {
    expect(types({ clockInAt: at(START, 30), clockInPoint: northOf(900) })).toEqual(['LATE_IN', 'GEOFENCE_MISS'])
  })
})

const issue = (code: string) => expect.objectContaining({ code: 'VALIDATION_ERROR', details: { issues: [expect.objectContaining({ code })] } })

describe('minutes and times', () => {
  it('actualMinutes = max(0, minutes(out - in) - break), rounded down to whole minutes', () => {
    expect(computeActualMinutes(START, END, 30)).toBe(450)
    expect(computeActualMinutes(START, at(START, 20), 45)).toBe(0)
    expect(computeActualMinutes(START, new Date(START.getTime() + 61_999), 0)).toBe(1)
  })

  const current = { clockInAt: START, clockOutAt: END, breakMinutes: 0, actualMinutes: 480 }
  const shift = { scheduledStart: START, scheduledEnd: END }

  it('applies a patch and recomputes minutes', () => {
    expect(resolveTimes(current, { breakMinutes: 60 }, shift)).toMatchObject({ actualMinutes: 420, breakMinutes: 60 })
    expect(resolveTimes(current, { clockOutAt: at(END, 30) }, shift).actualMinutes).toBe(510)
  })

  it('enforces the 12 hour window exactly at the edge', () => {
    expect(() => resolveTimes(current, { clockInAt: at(START, -12 * 60) }, shift)).not.toThrow()
    expect(() => resolveTimes(current, { clockInAt: at(START, -12 * 60 - 1) }, shift)).toThrow(issue('out_of_window'))
    expect(() => resolveTimes(current, { clockOutAt: at(END, 12 * 60 + 1) }, shift)).toThrow(issue('out_of_window'))
  })

  it('rejects out <= in and half-filled pairs, keeps a no-show as it is', () => {
    expect(() => resolveTimes(current, { clockOutAt: START }, shift)).toThrow(issue('before_clock_in'))
    expect(() => resolveTimes({ ...current, clockInAt: null, clockOutAt: null, actualMinutes: 0 }, { clockInAt: START }, shift)).toThrow(issue('incomplete'))
    expect(resolveTimes({ clockInAt: null, clockOutAt: null, breakMinutes: 0, actualMinutes: 0 }, { breakMinutes: 5 }, shift).actualMinutes).toBe(0)
  })
})

describe('state machine', () => {
  const all = Object.keys(TRANSITIONS) as TimesheetStatus[]

  it('allows exactly the edges in the table and refuses every other with INVALID_STATE + allowed', () => {
    for (const from of all) {
      for (const to of all) {
        if (TRANSITIONS[from].includes(to)) {
          expect(() => assertTransition(from, to)).not.toThrow()
        } else {
          expect(() => assertTransition(from, to), `${from} -> ${to}`).toThrow(expect.objectContaining({ code: 'INVALID_STATE', details: expect.objectContaining({ from, to, allowed: TRANSITIONS[from] }) }))
        }
      }
    }
  })

  it('matches the documented graph', () => {
    expect(TRANSITIONS.OPEN).toEqual(['SUBMITTED'])
    expect(TRANSITIONS.SUBMITTED).toEqual(['APPROVED', 'REJECTED', 'ADJUSTED'])
    expect(TRANSITIONS.ADJUSTED).toEqual(['APPROVED', 'REJECTED', 'ADJUSTED'])
    expect(TRANSITIONS.REJECTED).toEqual(['CORRECTED'])
    expect(TRANSITIONS.CORRECTED).toEqual(['SUBMITTED'])
    expect(TRANSITIONS.APPROVED).toEqual(['INVOICED'])
    expect(TRANSITIONS.INVOICED).toEqual([])
  })
})

describe('rate resolution from the snapshot', () => {
  const contract = { id: 'c1', contractNumber: 'C-1', version: 1, billingType: 'PER_VISIT', billingCycle: 'MONTHLY' } as const
  const line = (id: string, billRate: string, payRate: string | null) =>
    ({ id, siteId: 's1', serviceId: null, description: id, qty: D(1), billRate: D(billRate), payRate: payRate === null ? null : D(payRate), estMinutes: null, taxCode: null }) as never
  const snapshot = (...lines: never[]) => buildTermsSnapshot(contract, lines, [], 's1', 'UTC')

  it('uses the serviceRef line, else the first (primary) line', () => {
    const terms = snapshot(line('a', '100.00', '10.00'), line('b', '200.00', '20.00'))

    expect(resolveRates(terms, 'b', null)).toMatchObject({ billRate: D('200.00'), payRate: D('20.00') })
    expect(resolveRates(terms, null, null)).toMatchObject({ billRate: D('100.00'), payRate: D('10.00') })
    expect(resolveRates(terms, 'not-a-line', null)).toMatchObject({ billRate: D('100.00') })
  })

  it('pay rate: line, else the worker default, else zero', () => {
    const noPay = snapshot(line('a', '100.00', null))

    expect(resolveRates(noPay, null, D('17.50')).payRate.toFixed(2)).toBe('17.50')
    expect(resolveRates(noPay, null, null).payRate.toFixed(2)).toBe('0.00')
    expect(resolveRates(snapshot(line('a', '100.00', '9.00')), null, D('17.50')).payRate.toFixed(2)).toBe('9.00')
  })

  it('refuses to price a snapshot with no line or a corrupt one', () => {
    expect(() => resolveRates(snapshot(), null, null)).toThrow(expect.objectContaining({ code: 'UNPROCESSABLE' }))
    expect(() => resolveRates({ nonsense: true }, null, null)).toThrow(expect.objectContaining({ code: 'UNPROCESSABLE' }))
  })
})
