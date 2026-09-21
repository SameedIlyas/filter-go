import { DateTime } from 'luxon'
import { z } from 'zod'

/*
 * Time conventions (docs/ARCHITECTURE.md section 2):
 *  - instants (shift times, clock stamps, created/updated) are UTC `timestamptz`, sent as ISO-8601 strings
 *  - calendar dates (period start/end, contract dates, due dates) are `date`, sent as "YYYY-MM-DD"
 *  - recurring wall-clock times ("18:00") are "HH:mm" strings interpreted in the SITE's timezone
 * All conversions between the three go through this file, so DST is handled in exactly one place.
 */

export const isValidTimezone = (zone: string): boolean => DateTime.local().setZone(zone).isValid

export const timezoneField = z.string().trim().refine(isValidTimezone, 'Unknown timezone. Use an IANA name such as "America/Chicago".')

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/

/** "YYYY-MM-DD" that is a real calendar date. Stays a string; convert with `toDateOnly` when persisting. */
export const dateOnlyField = z
  .string()
  .trim()
  .refine(value => DATE_ONLY.test(value) && DateTime.fromISO(value, { zone: 'utc' }).isValid, 'Use a real date in YYYY-MM-DD format.')

/** "HH:mm", 24-hour. */
export const timeOfDayField = z.string().trim().regex(TIME_OF_DAY, 'Use 24-hour HH:mm, e.g. "18:00".')

/** ISO-8601 instant with an explicit offset or Z, returned as a Date. */
export const instantField = z
  .string()
  .trim()
  .refine(value => /(Z|[+-]\d{2}:?\d{2})$/i.test(value) && DateTime.fromISO(value).isValid, 'Use an ISO-8601 timestamp with a timezone, e.g. "2026-03-02T18:00:00Z".')
  .transform(value => DateTime.fromISO(value).toJSDate())

/** "YYYY-MM-DD" -> Date at 00:00 UTC, the form Prisma expects for `@db.Date`. */
export const toDateOnly = (value: string): Date => new Date(`${value}T00:00:00.000Z`)

/** Date read from a `@db.Date` column -> "YYYY-MM-DD". */
export const fromDateOnly = (value: Date): string => value.toISOString().slice(0, 10)

export const fromDateOnlyOrNull = (value: Date | null | undefined): string | null => (value ? fromDateOnly(value) : null)

/** The instant at which the wall-clock time `hhmm` happens on calendar day `date` in `zone` (DST-aware). */
export const zonedInstant = (date: string, hhmm: string, zone: string): Date =>
  DateTime.fromISO(`${date}T${hhmm}`, { zone }).toUTC().toJSDate()

/** All calendar days from `start` to `end` inclusive, as "YYYY-MM-DD". */
export const eachDay = (start: string, end: string): string[] => {
  const days: string[] = []

  for (let day = DateTime.fromISO(start, { zone: 'utc' }); day <= DateTime.fromISO(end, { zone: 'utc' }); day = day.plus({ days: 1 })) {
    days.push(day.toISODate() ?? '')
  }

  return days
}

export const addDays = (date: string, days: number): string => DateTime.fromISO(date, { zone: 'utc' }).plus({ days }).toISODate() ?? date

/** ISO weekday of a calendar date: 1 = Monday ... 7 = Sunday. */
export const isoWeekday = (date: string): number => DateTime.fromISO(date, { zone: 'utc' }).weekday

/** Whole days from `a` to `b` (b - a). */
export const daysBetween = (a: string, b: string): number =>
  Math.round(DateTime.fromISO(b, { zone: 'utc' }).diff(DateTime.fromISO(a, { zone: 'utc' }), 'days').days)

/** Monday 00:00 of the week containing `instant`, in `zone`, as a UTC instant. */
export const startOfWeek = (instant: Date, zone: string): Date => DateTime.fromJSDate(instant, { zone }).startOf('week').toUTC().toJSDate()

/** The calendar date ("YYYY-MM-DD") of `instant` in `zone`. */
export const localDate = (instant: Date, zone: string): string => DateTime.fromJSDate(instant, { zone }).toISODate() ?? ''

/** Whole minutes between two instants (b - a), rounded down. */
export const minutesBetween = (a: Date, b: Date): number => Math.floor((b.getTime() - a.getTime()) / 60_000)
