import { Errors } from '../../lib/errors.js'
import { minutesBetween } from '../../lib/time.js'

/** Corrections may move a time at most this far outside the scheduled shift. */
export const CORRECTION_WINDOW_MS = 12 * 60 * 60 * 1000

/** `actualMinutes = max(0, minutes(out - in) - break)` (docs/ARCHITECTURE.md 6.3). */
export const computeActualMinutes = (clockInAt: Date, clockOutAt: Date, breakMinutes: number): number =>
  Math.max(0, minutesBetween(clockInAt, clockOutAt) - breakMinutes)

export interface EntryTimes {
  clockInAt: Date | null
  clockOutAt: Date | null
  breakMinutes: number
  actualMinutes: number | null
}

export interface TimesPatch {
  clockInAt?: Date
  clockOutAt?: Date
  breakMinutes?: number
}

const assertInWindow = (field: string, value: Date, shift: { scheduledStart: Date; scheduledEnd: Date }): void => {
  const earliest = shift.scheduledStart.getTime() - CORRECTION_WINDOW_MS
  const latest = shift.scheduledEnd.getTime() + CORRECTION_WINDOW_MS

  if (value.getTime() < earliest || value.getTime() > latest) {
    throw Errors.invalidField(field, 'out_of_window', 'The time must be within 12 hours of the scheduled shift.')
  }
}

/**
 * The entry's times after applying a patch, with minutes recomputed. Throws a field error when a patched time is
 * outside the correction window, when the pair is incomplete, or when clock-out is not after clock-in.
 * An entry with no times at all (a no-show) keeps its minutes.
 */
export const resolveTimes = (current: EntryTimes, patch: TimesPatch, shift: { scheduledStart: Date; scheduledEnd: Date }): EntryTimes => {
  if (patch.clockInAt) assertInWindow('clockInAt', patch.clockInAt, shift)

  if (patch.clockOutAt) assertInWindow('clockOutAt', patch.clockOutAt, shift)

  const clockInAt = patch.clockInAt ?? current.clockInAt
  const clockOutAt = patch.clockOutAt ?? current.clockOutAt
  const breakMinutes = patch.breakMinutes ?? current.breakMinutes

  if (clockInAt === null && clockOutAt === null) return { clockInAt, clockOutAt, breakMinutes, actualMinutes: current.actualMinutes }

  if (clockInAt === null || clockOutAt === null) {
    throw Errors.invalidField(clockInAt === null ? 'clockInAt' : 'clockOutAt', 'incomplete', 'Provide both a clock-in and a clock-out time.')
  }

  if (clockOutAt.getTime() <= clockInAt.getTime()) {
    throw Errors.invalidField('clockOutAt', 'before_clock_in', 'Clock-out must be after clock-in.')
  }

  return { clockInAt, clockOutAt, breakMinutes, actualMinutes: computeActualMinutes(clockInAt, clockOutAt, breakMinutes) }
}

const sameInstant = (a: Date | null, b: Date | null): boolean => (a === null || b === null ? a === b : a.getTime() === b.getTime())

export const timesEqual = (a: EntryTimes, b: EntryTimes): boolean =>
  sameInstant(a.clockInAt, b.clockInAt) && sameInstant(a.clockOutAt, b.clockOutAt) && a.breakMinutes === b.breakMinutes && a.actualMinutes === b.actualMinutes

/** The audit-friendly (JSON) form of an entry's times. */
export const describeTimes = (times: EntryTimes) => ({
  clockInAt: times.clockInAt?.toISOString() ?? null,
  clockOutAt: times.clockOutAt?.toISOString() ?? null,
  breakMinutes: times.breakMinutes,
  actualMinutes: times.actualMinutes
})
