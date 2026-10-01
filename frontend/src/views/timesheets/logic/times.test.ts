import { describe, expect, it } from 'vitest'

import { buildAdjust, buildCorrect, clockRange, fromLocalInput, timesFormOf, timesPatch, toLocalInput } from './times'

const ZONE = 'America/Chicago'

/** Worked 18:00 -> 02:00 Chicago on Mon 2026-03-02 (UTC-6), no break. */
const entry = {
  clockInAt: '2026-03-03T00:00:00.000Z',
  clockOutAt: '2026-03-03T08:00:00.000Z',
  breakMinutes: 0,
  actualMinutes: 480,
  billable: true,
  payable: true
}

const form = timesFormOf(entry, ZONE)

describe('local input conversion', () => {
  it('round-trips through the site zone', () => {
    expect(form).toEqual({ clockIn: '2026-03-02T18:00', clockOut: '2026-03-03T02:00', breakMinutes: '0' })
    expect(fromLocalInput('2026-03-02T18:00', ZONE)).toBe('2026-03-03T00:00:00.000Z')
    expect(toLocalInput(null, ZONE)).toBe('')
    expect(fromLocalInput('nonsense', ZONE)).toBeNull()
  })

  it('handles the DST change (Chicago springs forward on 2026-03-08)', () => {
    expect(fromLocalInput('2026-03-08T12:00', ZONE)).toBe('2026-03-08T17:00:00.000Z')
  })
})

describe('timesPatch', () => {
  it('returns only what changed, with the minutes it would give', () => {
    const result = timesPatch(entry, { ...form, clockIn: '2026-03-02T18:30', breakMinutes: '30' }, ZONE)

    expect(result).toEqual({ ok: true, patch: { clockInAt: '2026-03-03T00:30:00.000Z', breakMinutes: 30 }, actualMinutes: 420 })
  })

  it('ignores seconds on the stored times', () => {
    const withSeconds = { ...entry, clockInAt: '2026-03-03T00:00:42.123Z' }

    expect(timesPatch(withSeconds, timesFormOf(withSeconds, ZONE), ZONE)).toMatchObject({ ok: true, patch: {} })
  })

  it('refuses a clock-out before clock-in, half a pair and a bad break', () => {
    expect(timesPatch(entry, { ...form, clockOut: '2026-03-02T17:00' }, ZONE)).toMatchObject({ ok: false, field: 'clockOut' })
    expect(timesPatch(entry, { ...form, clockOut: '' }, ZONE)).toMatchObject({ ok: false, field: 'clockOut' })
    expect(timesPatch(entry, { ...form, breakMinutes: '12.5' }, ZONE)).toMatchObject({ ok: false, field: 'breakMinutes' })
    expect(timesPatch(entry, { ...form, breakMinutes: '-1' }, ZONE)).toMatchObject({ ok: false, field: 'breakMinutes' })
  })

  it('keeps a no-show blank', () => {
    const noShow = { ...entry, clockInAt: null, clockOutAt: null, actualMinutes: 0 }

    expect(timesPatch(noShow, timesFormOf(noShow, ZONE), ZONE)).toEqual({ ok: true, patch: {}, actualMinutes: 0 })
  })

  it('never lets the break push the minutes below zero', () => {
    expect(timesPatch(entry, { ...form, breakMinutes: '600' }, ZONE)).toMatchObject({ ok: true, actualMinutes: 0 })
  })
})

describe('buildAdjust', () => {
  const base = { ...form, billable: true, payable: true, reason: '' }

  it('needs a change and a reason', () => {
    expect(buildAdjust(entry, { ...base, reason: 'x' }, ZONE)).toMatchObject({ ok: false, field: null })
    expect(buildAdjust(entry, { ...base, billable: false }, ZONE)).toMatchObject({ ok: false, field: 'reason' })
  })

  it('sends changed flags and times with the trimmed reason', () => {
    expect(buildAdjust(entry, { ...base, billable: false, clockOut: '2026-03-03T01:00', reason: '  Redo for the client  ' }, ZONE)).toEqual({
      ok: true,
      input: { clockOutAt: '2026-03-03T07:00:00.000Z', billable: false, reason: 'Redo for the client' },
      actualMinutes: 420
    })
  })
})

describe('buildCorrect', () => {
  const base = { ...form, note: '' }

  it('needs a fixed time or a note', () => {
    expect(buildCorrect(entry, base, ZONE)).toMatchObject({ ok: false, field: null })
    expect(buildCorrect(entry, { ...base, note: 'Took a 30 min break' }, ZONE)).toEqual({ ok: true, input: { note: 'Took a 30 min break' }, actualMinutes: 480 })
    expect(buildCorrect(entry, { ...base, breakMinutes: '30' }, ZONE)).toEqual({ ok: true, input: { breakMinutes: 30 }, actualMinutes: 450 })
  })
})

describe('clockRange', () => {
  it('shows site-local times and a dash for a missing side', () => {
    expect(clockRange(entry, ZONE)).toBe('18:00 – 02:00')
    expect(clockRange({ clockInAt: entry.clockInAt, clockOutAt: null }, ZONE)).toBe('18:00 – —')
  })
})
