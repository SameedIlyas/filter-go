/*
 * Timezone-aware date helpers on plain strings, built on Intl only.
 * A "day key" is a calendar date "YYYY-MM-DD"; an instant is an ISO-8601 UTC string.
 * Shift times are always shown in the SITE's timezone (docs/ARCHITECTURE.md 2.4).
 */

const partsFormatter = new Map<string, Intl.DateTimeFormat>()

/** Cached formatter per zone: creating Intl formatters is the expensive part when placing thousands of shifts. */
const formatterFor = (zone: string) => {
  let formatter = partsFormatter.get(zone)

  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    partsFormatter.set(zone, formatter)
  }

  return formatter
}

type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number }

const wallClock = (instant: string | Date, zone: string): WallClock => {
  const parts = formatterFor(zone).formatToParts(typeof instant === 'string' ? new Date(instant) : instant)
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value ?? 0)

  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') }
}

const pad = (value: number) => String(value).padStart(2, '0')

/** The calendar date of `instant` in `zone`. */
export const dayKeyIn = (instant: string | Date, zone: string): string => {
  const { year, month, day } = wallClock(instant, zone)

  return `${year}-${pad(month)}-${pad(day)}`
}

/** "HH:mm" (24h) of `instant` in `zone`. */
export const formatTimeIn = (instant: string | Date, zone: string): string => {
  const { hour, minute } = wallClock(instant, zone)

  return `${pad(hour)}:${pad(minute)}`
}

/** Minutes `zone` is ahead of UTC at `instant`. */
const offsetMinutes = (instant: Date, zone: string): number => {
  const clock = wallClock(instant, zone)
  const asUtc = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second)

  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000)
}

/**
 * The UTC instant of wall-clock `time` ("HH:mm") on `dayKey` in `zone`. Two passes settle the offset on DST
 * change days; a wall time that does not exist (the skipped hour) resolves forward, like the backend's Luxon.
 */
export const zonedInstant = (dayKey: string, time: string, zone: string): string => {
  const [year, month, day] = dayKey.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const naive = Date.UTC(year, month - 1, day, hour, minute)
  const first = naive - offsetMinutes(new Date(naive), zone) * 60_000
  const second = naive - offsetMinutes(new Date(first), zone) * 60_000

  return new Date(second).toISOString()
}

/** `dayKey` moved by `days` calendar days. */
export const addDays = (dayKey: string, days: number): string => {
  const [year, month, day] = dayKey.split('-').map(Number)

  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/** ISO weekday of a day key: Monday = 1 ... Sunday = 7. */
export const isoWeekday = (dayKey: string): number => {
  const [year, month, day] = dayKey.split('-').map(Number)

  return ((new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7) + 1
}

/** Whole days from `from` to `to` (both day keys). */
export const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

/** Today's day key in the browser's zone. */
export const todayKey = (): string => dayKeyIn(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone)

/** Minutes between two instants. */
export const minutesBetween = (start: string, end: string): number => Math.round((Date.parse(end) - Date.parse(start)) / 60_000)
