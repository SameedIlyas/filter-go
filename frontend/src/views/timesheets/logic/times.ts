import type { AdjustInput, CorrectInput, Timesheet } from '@/types/timesheetTypes'

import { dayKeyIn, formatTimeIn, minutesBetween, zonedInstant } from '../../scheduling/logic/zoned'

/*
 * Editing an entry's times in the SITE's timezone. The form works on `<input type="datetime-local">` values
 * ("YYYY-MM-DDTHH:mm" wall time); these helpers turn them into instants and into the smallest patch the backend
 * accepts (only the fields that changed), for both the supervisor's adjust and the worker's correct.
 */

const LOCAL = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/
const MAX_BREAK = 24 * 60

/** An instant as a datetime-local value in `zone`; '' for none. */
export const toLocalInput = (instant: string | null, zone: string): string => (instant ? `${dayKeyIn(instant, zone)}T${formatTimeIn(instant, zone)}` : '')

/** A datetime-local value in `zone` as an instant; null when blank or malformed. */
export const fromLocalInput = (value: string, zone: string): string | null => {
  const match = LOCAL.exec(value.trim())

  return match ? zonedInstant(match[1], match[2], zone) : null
}

export type TimesForm = { clockIn: string; clockOut: string; breakMinutes: string }

export const timesFormOf = (entry: Pick<Timesheet, 'clockInAt' | 'clockOutAt' | 'breakMinutes'>, zone: string): TimesForm => ({
  clockIn: toLocalInput(entry.clockInAt, zone),
  clockOut: toLocalInput(entry.clockOutAt, zone),
  breakMinutes: String(entry.breakMinutes)
})

type TimesPatch = { clockInAt?: string; clockOutAt?: string; breakMinutes?: number }

export type TimesResult = { ok: true; patch: TimesPatch; actualMinutes: number | null } | { ok: false; error: string; field: keyof TimesForm }

/** Same instant to the minute (the inputs have no seconds, the stored times may). */
const sameMinute = (a: string | null, b: string | null) => (a === null || b === null ? a === b : Math.floor(Date.parse(a) / 60_000) === Math.floor(Date.parse(b) / 60_000))

/**
 * Validates the form and returns only what changed, plus the worked minutes it would give (the backend computes the
 * same `max(0, out - in - break)`). A no-show with both times left blank stays blank.
 */
export const timesPatch = (entry: Pick<Timesheet, 'clockInAt' | 'clockOutAt' | 'breakMinutes' | 'actualMinutes'>, form: TimesForm, zone: string): TimesResult => {
  const breakText = form.breakMinutes.trim()
  const breakMinutes = breakText === '' ? 0 : Number(breakText)

  if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > MAX_BREAK) {
    return { ok: false, error: 'Break must be whole minutes between 0 and 1440.', field: 'breakMinutes' }
  }

  const clockInAt = form.clockIn.trim() ? fromLocalInput(form.clockIn, zone) : null
  const clockOutAt = form.clockOut.trim() ? fromLocalInput(form.clockOut, zone) : null

  if (form.clockIn.trim() && !clockInAt) return { ok: false, error: 'Enter a valid clock-in time.', field: 'clockIn' }
  if (form.clockOut.trim() && !clockOutAt) return { ok: false, error: 'Enter a valid clock-out time.', field: 'clockOut' }

  const patch: TimesPatch = {
    ...(clockInAt && !sameMinute(clockInAt, entry.clockInAt) ? { clockInAt } : {}),
    ...(clockOutAt && !sameMinute(clockOutAt, entry.clockOutAt) ? { clockOutAt } : {}),
    ...(breakMinutes !== entry.breakMinutes ? { breakMinutes } : {})
  }

  if (!clockInAt && !clockOutAt) return { ok: true, patch, actualMinutes: entry.actualMinutes }

  if (!clockInAt || !clockOutAt) {
    return { ok: false, error: 'Enter both a clock-in and a clock-out time.', field: clockInAt ? 'clockOut' : 'clockIn' }
  }

  if (Date.parse(clockOutAt) <= Date.parse(clockInAt)) return { ok: false, error: 'Clock-out must be after clock-in.', field: 'clockOut' }

  return { ok: true, patch, actualMinutes: Math.max(0, minutesBetween(clockInAt, clockOutAt) - breakMinutes) }
}

export type AdjustForm = TimesForm & { billable: boolean; payable: boolean; reason: string }

export type AdjustResult = { ok: true; input: AdjustInput; actualMinutes: number | null } | { ok: false; error: string; field: keyof AdjustForm | null }

/** The supervisor's adjust: changed times and flags, and a reason (both required by the backend). */
export const buildAdjust = (entry: Pick<Timesheet, 'clockInAt' | 'clockOutAt' | 'breakMinutes' | 'actualMinutes' | 'billable' | 'payable'>, form: AdjustForm, zone: string): AdjustResult => {
  const times = timesPatch(entry, form, zone)

  if (!times.ok) return times

  const flags = {
    ...(form.billable !== entry.billable ? { billable: form.billable } : {}),
    ...(form.payable !== entry.payable ? { payable: form.payable } : {})
  }

  if (Object.keys(times.patch).length === 0 && Object.keys(flags).length === 0) return { ok: false, error: 'Change a time, the break or a flag first.', field: null }

  const reason = form.reason.trim()

  if (!reason) return { ok: false, error: 'Say why you are adjusting it.', field: 'reason' }

  return { ok: true, input: { ...times.patch, ...flags, reason }, actualMinutes: times.actualMinutes }
}

export type CorrectResult = { ok: true; input: CorrectInput; actualMinutes: number | null } | { ok: false; error: string; field: keyof TimesForm | 'note' | null }

/** The worker's correction of a rejected entry: changed times and an optional note; at least one of them. */
export const buildCorrect = (entry: Pick<Timesheet, 'clockInAt' | 'clockOutAt' | 'breakMinutes' | 'actualMinutes'>, form: TimesForm & { note: string }, zone: string): CorrectResult => {
  const times = timesPatch(entry, form, zone)

  if (!times.ok) return times

  const note = form.note.trim()
  const input: CorrectInput = { ...times.patch, ...(note ? { note } : {}) }

  if (Object.keys(input).length === 0) return { ok: false, error: 'Fix a time or add a note for your supervisor.', field: null }

  return { ok: true, input, actualMinutes: times.actualMinutes }
}

/** "18:00 – 02:00" for an entry's actual times in `zone`; a dash for a missing side. */
export const clockRange = (entry: Pick<Timesheet, 'clockInAt' | 'clockOutAt'>, zone: string): string =>
  `${entry.clockInAt ? formatTimeIn(entry.clockInAt, zone) : '—'} – ${entry.clockOutAt ? formatTimeIn(entry.clockOutAt, zone) : '—'}`
