/** Calendar dates as "YYYY-MM-DD", in the browser's local calendar (an invoice period is a list of days, not instants). */

/** The server refuses runs longer than this (run.service.ts MAX_RUN_DAYS). */
export const MAX_RUN_DAYS = 366

const DAY_MS = 24 * 60 * 60 * 1000

const pad = (value: number) => String(value).padStart(2, '0')

export const isoDay = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const utcOf = (day: string): number => {
  const [year, month, date] = day.split('-').map(Number)

  return Date.UTC(year, month - 1, date)
}

/** A real calendar date in "YYYY-MM-DD" form (no February 30th). */
export const isDay = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(utcOf(value)).toISOString().slice(0, 10) === value

/** Days covered by a period, both ends included. */
export const periodDays = (start: string, end: string): number => Math.round((utcOf(end) - utcOf(start)) / DAY_MS) + 1

/** The calendar month before `today`: the usual period of a monthly run. */
export const previousMonth = (today: Date): { start: string; end: string } => {
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const end = new Date(today.getFullYear(), today.getMonth(), 0)

  return { start: isoDay(start), end: isoDay(end) }
}

/** Why a run period would be refused, or null. */
export const periodError = (start: string, end: string): string | null => {
  if (!isDay(start) || !isDay(end)) return 'Pick both dates.'
  if (end < start) return 'The period ends before it starts.'
  if (periodDays(start, end) > MAX_RUN_DAYS) return `A run covers at most ${MAX_RUN_DAYS} days.`

  return null
}
