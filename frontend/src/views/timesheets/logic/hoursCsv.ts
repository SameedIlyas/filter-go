import type { HoursResponse, HoursTally } from '@/types/timesheetTypes'

export type HoursMetric = 'workedMinutes' | 'approvedMinutes' | 'scheduledMinutes'

/** Decimal hours with two places, the form payroll sheets expect ("7.75"). */
export const decimalHours = (minutes: number): string => (minutes / 60).toFixed(2)

/** RFC 4180: quote a cell when it holds a comma, quote or line break; double inner quotes. */
const cell = (value: string): string => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

/** A leading =, +, - or @ makes spreadsheets run the cell as a formula; prefix such names with an apostrophe. */
const safeText = (value: string): string => (/^[=+\-@]/.test(value) ? `'${value}` : value)

const minutesOf = (tally: HoursTally | undefined, metric: HoursMetric): number => tally?.[metric] ?? 0

/**
 * The hours grid as CSV: one row per worker, one column per day of `metric` in decimal hours, then the scheduled,
 * worked, approved and overtime totals, and a closing total row. CRLF line ends, as Excel expects.
 */
export const hoursCsv = (data: HoursResponse, metric: HoursMetric): string => {
  const header = ['Worker', ...data.days, 'Scheduled', 'Worked', 'Approved', 'Overtime']

  const rows = data.workers.map(worker => [
    safeText(worker.user.name),
    ...data.days.map(day => decimalHours(minutesOf(worker.days[day], metric))),
    decimalHours(worker.scheduledMinutes),
    decimalHours(worker.workedMinutes),
    decimalHours(worker.approvedMinutes),
    decimalHours(worker.overtimeMinutes)
  ])

  const total = [
    'Total',
    ...data.days.map(day => decimalHours(minutesOf(data.totals.days[day], metric))),
    decimalHours(data.totals.scheduledMinutes),
    decimalHours(data.totals.workedMinutes),
    decimalHours(data.totals.approvedMinutes),
    decimalHours(data.totals.overtimeMinutes)
  ]

  return [header, ...rows, total].map(row => row.map(cell).join(',')).join('\r\n')
}
