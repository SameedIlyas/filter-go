import { addDays, daysBetween, isoWeekday } from '../../scheduling/logic/zoned'

/** The backend's hours grid limit (docs/ARCHITECTURE.md 6.2). */
export const HOURS_MAX_DAYS = 45

export type DayWindow = { from: string; to: string }

/** Monday..Sunday of the week holding `day`. */
export const weekOf = (day: string): DayWindow => {
  const from = addDays(day, 1 - isoWeekday(day))

  return { from, to: addDays(from, 6) }
}

/** The same-length window just before (-1) or after (+1) this one. */
export const shiftWindow = (window: DayWindow, direction: -1 | 1): DayWindow => {
  const length = daysBetween(window.from, window.to) + 1

  return { from: addDays(window.from, direction * length), to: addDays(window.to, direction * length) }
}

/** Ordered, inside the 45-day limit; a reversed or too long range is cut to fit from `from`. */
export const clampWindow = (window: DayWindow): DayWindow => {
  const to = window.to < window.from ? window.from : window.to

  return daysBetween(window.from, to) >= HOURS_MAX_DAYS ? { from: window.from, to: addDays(window.from, HOURS_MAX_DAYS - 1) } : { from: window.from, to }
}

/**
 * The instant range for `GET /timesheets` (`from`/`to` are on the shift's scheduled start). Sites can be in any zone,
 * so a day window is widened by 14 hours each side to catch every site-local day; the table shows site-local days.
 */
export const instantRange = (window: DayWindow): { from: string; to: string } => {
  const SLACK_MS = 14 * 3_600_000

  return {
    from: new Date(Date.parse(`${window.from}T00:00:00Z`) - SLACK_MS).toISOString(),
    to: new Date(Date.parse(`${addDays(window.to, 1)}T00:00:00Z`) + SLACK_MS).toISOString()
  }
}

const weekdayFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' })
const rangeFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
const yearFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })

/** "Mon 2" for a grid column. */
export const formatDayColumn = (day: string) => `${weekdayFormat.format(new Date(`${day}T00:00:00Z`))} ${Number(day.slice(8, 10))}`

/** "Mar 2 – Mar 8, 2026" for a window. */
export const formatWindow = (window: DayWindow) =>
  `${(window.from.slice(0, 4) === window.to.slice(0, 4) ? rangeFormat : yearFormat).format(new Date(`${window.from}T00:00:00Z`))} – ${yearFormat.format(new Date(`${window.to}T00:00:00Z`))}`
