import type { ContractCoverage } from '@/types/contractTypes'

import { addDays, daysBetween, isoWeekday } from './zoned'

/** Same limit as the backend (MAX_PERIOD_DAYS). */
export const MAX_PERIOD_DAYS = 93

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export type GeneratePreview = {

  /** The period after clamping to the contract's dates (what the backend will actually use). */
  periodStart: string
  periodEnd: string
  clamped: boolean

  /** Shifts generation will create (INTERVAL is an estimate: its anchor depends on earlier schedules). */
  estimatedShifts: number

  /** Expected visits from AD_HOC coverage, which the supervisor adds by hand; null when there is none. */
  adHocVisits: number | null

  /** One line per coverage pattern, e.g. "Mon, Wed, Fri 08:00–12:00". */
  patterns: string[]

  /** Why generating would fail, or null. */
  problem: string | null
}

const timeWindow = (row: ContractCoverage) => (row.timeStart && row.timeEnd ? ` ${row.timeStart}–${row.timeEnd}` : '')

const describe = (row: ContractCoverage): string => {
  if (row.patternType === 'WEEKLY') return `${row.weekdays.map(day => WEEKDAY_NAMES[day - 1]).join(', ')}${timeWindow(row)}`
  if (row.patternType === 'INTERVAL') return `Every ${row.intervalDays} days${timeWindow(row)}`

  return `Ad hoc: ${row.visitsPerPeriod ?? 0} visits per period`
}

const countShifts = (row: ContractCoverage, start: string, end: string): number => {
  const days = daysBetween(start, end) + 1

  if (row.patternType === 'WEEKLY') {
    return Array.from({ length: days }, (_, index) => addDays(start, index)).filter(day => row.weekdays.includes(isoWeekday(day))).length
  }

  if (row.patternType === 'INTERVAL' && row.intervalDays) return Math.ceil(days / row.intervalDays)

  return 0
}

export const generatePreview = (
  coverage: ContractCoverage[],
  siteId: string,
  contract: { startDate: string; endDate: string | null },
  periodStart: string,
  periodEnd: string
): GeneratePreview => {
  const rows = coverage.filter(row => row.siteId === siteId)
  const start = periodStart < contract.startDate ? contract.startDate : periodStart
  const end = contract.endDate && periodEnd > contract.endDate ? contract.endDate : periodEnd
  const adHoc = rows.filter(row => row.patternType === 'AD_HOC')

  const base = {
    periodStart: start,
    periodEnd: end,
    clamped: start !== periodStart || end !== periodEnd,
    estimatedShifts: 0,
    adHocVisits: adHoc.length ? adHoc.reduce((total, row) => total + (row.visitsPerPeriod ?? 0), 0) : null,
    patterns: rows.map(describe)
  }

  const problem =
    periodEnd < periodStart
      ? 'The period must end on or after its start.'
      : rows.length === 0
        ? 'This site has no coverage on the contract.'
        : end < start
          ? 'This period is outside the contract dates.'
          : daysBetween(start, end) + 1 > MAX_PERIOD_DAYS
            ? `A schedule can cover at most ${MAX_PERIOD_DAYS} days.`
            : null

  if (problem) return { ...base, problem }

  return { ...base, estimatedShifts: rows.reduce((total, row) => total + countShifts(row, start, end), 0), problem: null }
}

/** Next Monday (never today) to the last day of that Monday's month. */
export const defaultPeriod = (today: string): { periodStart: string; periodEnd: string } => {
  const periodStart = addDays(today, 8 - isoWeekday(today))
  const [year, month] = periodStart.split('-').map(Number)
  const periodEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)

  return { periodStart, periodEnd }
}
