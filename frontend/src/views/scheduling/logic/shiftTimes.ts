import { addDays, minutesBetween, zonedInstant } from './zoned'

export type ShiftTimes =
  | { ok: true; start: string; end: string; overnight: boolean; hours: number }
  | { ok: false; error: string }

const TIME = /^\d{2}:\d{2}$/

/**
 * A shift entered as a site-local date plus "HH:mm" times. An end at or before the start crosses midnight, the
 * same rule as contract coverage (docs/ARCHITECTURE.md 5.3), so a shift is always under 24 hours.
 */
export const shiftTimes = (date: string, start: string, end: string, zone: string): ShiftTimes => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !TIME.test(start) || !TIME.test(end)) {
    return { ok: false, error: 'Enter a date and both times.' }
  }

  if (start === end) return { ok: false, error: 'Start and end cannot be the same time.' }

  const overnight = end < start
  const startsAt = zonedInstant(date, start, zone)
  const endsAt = zonedInstant(overnight ? addDays(date, 1) : date, end, zone)

  return { ok: true, start: startsAt, end: endsAt, overnight, hours: Math.round((minutesBetween(startsAt, endsAt) / 60) * 100) / 100 }
}
