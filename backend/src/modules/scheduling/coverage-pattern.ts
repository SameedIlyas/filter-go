import type { TermsSnapshot } from '../../lib/terms-snapshot.js'
import { addDays, daysBetween, eachDay, isoWeekday, zonedInstant } from '../../lib/time.js'

export interface ShiftWindow {
  start: Date
  end: Date
}

export interface Period {
  /** "YYYY-MM-DD", inclusive. */
  start: string
  end: string
}

export const DEFAULT_VISIT_START = '09:00'
export const DEFAULT_VISIT_END = '17:00'

type CoverageRow = TermsSnapshot['coverage'][number]

/** One visit on calendar `day`. A `timeEnd` at or before `timeStart` means the shift ends the next day. */
const windowOn = (day: string, timeStart: string, timeEnd: string, zone: string): ShiftWindow => ({
  start: zonedInstant(day, timeStart, zone),
  end: zonedInstant(timeEnd <= timeStart ? addDays(day, 1) : day, timeEnd, zone)
})

const weeklyWindows = (row: CoverageRow, period: Period, zone: string): ShiftWindow[] => {
  if (!row.timeStart || !row.timeEnd || row.timeStart === row.timeEnd) return []

  const { timeStart, timeEnd } = row

  return eachDay(period.start, period.end)
    .filter(day => row.weekdays.includes(isoWeekday(day)))
    .map(day => windowOn(day, timeStart, timeEnd, zone))
}

/** Dates `anchor + k * every` (k >= 0) that fall inside the period. */
const intervalDates = (anchor: string, every: number, period: Period): string[] => {
  const offset = daysBetween(anchor, period.start)
  const firstStep = offset <= 0 ? 0 : Math.ceil(offset / every)
  const dates: string[] = []

  for (let date = addDays(anchor, firstStep * every); date <= period.end; date = addDays(date, every)) {
    dates.push(date)
  }

  return dates
}

const intervalWindows = (row: CoverageRow, period: Period, zone: string, anchor: string): ShiftWindow[] => {
  if (!row.intervalDays || row.intervalDays < 1) return []

  const hasTimes = row.timeStart !== null && row.timeEnd !== null && row.timeStart !== row.timeEnd
  const timeStart = hasTimes ? (row.timeStart ?? DEFAULT_VISIT_START) : DEFAULT_VISIT_START
  const timeEnd = hasTimes ? (row.timeEnd ?? DEFAULT_VISIT_END) : DEFAULT_VISIT_END

  return intervalDates(anchor, row.intervalDays, period).map(day => windowOn(day, timeStart, timeEnd, zone))
}

/**
 * Deterministic shift windows for a period (docs/ARCHITECTURE.md 5.3). Every wall-clock time becomes an instant
 * through `zonedInstant` in the SITE's zone, so DST days come out right. AD_HOC coverage generates nothing.
 * Sorted by start; exact duplicates (two coverage rows describing the same visit) are dropped.
 */
export const generateWindows = (coverage: CoverageRow[], period: Period, zone: string, intervalAnchor: string): ShiftWindow[] => {
  const windows = coverage.flatMap(row => {
    if (row.patternType === 'WEEKLY') return weeklyWindows(row, period, zone)
    if (row.patternType === 'INTERVAL') return intervalWindows(row, period, zone, intervalAnchor)

    return []
  })

  const unique = new Map(windows.map(window => [`${window.start.toISOString()}|${window.end.toISOString()}`, window]))

  return [...unique.values()].sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime())
}
