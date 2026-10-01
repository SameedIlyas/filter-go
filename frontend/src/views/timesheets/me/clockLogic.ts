import type { Shift } from '@/types/scheduleTypes'

/*
 * Which shift the clock card offers, and how long the worker has been on. The server owns the clock-in window
 * (CLOCK_IN_EARLY_MINUTES is not exposed), so the card only narrows to shifts that could plausibly open soon and
 * lets the server's CLOCK_WINDOW message explain a refusal.
 */

/** Offer "Clock in" for shifts starting within this long. */
export const CLOCK_IN_LOOKAHEAD_MS = 12 * 60 * 60 * 1000

/** The query window for the card: yesterday 00:00Z to the day after tomorrow, so a running overnight shift is in it. */
export const clockQueryRange = (now: number): { from: string; to: string } => {
  const today = new Date(now)
  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())

  return { from: new Date(midnight - 86_400_000).toISOString(), to: new Date(midnight + 2 * 86_400_000).toISOString() }
}

/** The soonest shift I could clock in to: assigned or confirmed, on a published schedule, not over yet. */
export const nextClockable = (shifts: Shift[], now: number): Shift | null =>
  shifts
    .filter(shift => (shift.status === 'ASSIGNED' || shift.status === 'CONFIRMED') && shift.scheduleStatus === 'PUBLISHED' && Date.parse(shift.scheduledEnd) > now)
    .sort((a, b) => Date.parse(a.scheduledStart) - Date.parse(b.scheduledStart))[0] ?? null

/** Clock-in is offered from 12 hours before the start until the end (the server decides the real window). */
export const canOfferClockIn = (shift: Pick<Shift, 'scheduledStart' | 'scheduledEnd'>, now: number): boolean =>
  Date.parse(shift.scheduledStart) - now <= CLOCK_IN_LOOKAHEAD_MS && now < Date.parse(shift.scheduledEnd)

/** Whole minutes since `instant` (never negative). */
export const minutesSince = (instant: string, now: number): number => Math.max(0, Math.floor((now - Date.parse(instant)) / 60_000))
