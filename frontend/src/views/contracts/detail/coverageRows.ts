// Type Imports
import type { ContractDetail, CoverageInput, CoveragePattern } from '@/types/contractTypes'

import { spanMinutes } from '../shared'

/** Editable coverage rows for CoverageDrawer: form state <-> API body, the completeness checks, weekly totals. */

export type Row = {
  key: string
  siteId: string
  patternType: CoveragePattern
  weekdays: number[]
  timeStart: string
  timeEnd: string
  intervalDays: string
  visitsPerPeriod: string
}

export type RowErrors = Record<number, Partial<Record<keyof Row, string>>>

let keySeq = 0
const nextKey = () => `cov-${++keySeq}`

export const blankRow = (siteId: string): Row => ({
  key: nextKey(),
  siteId,
  patternType: 'WEEKLY',
  weekdays: [1, 2, 3, 4, 5],
  timeStart: '08:00',
  timeEnd: '12:00',
  intervalDays: '7',
  visitsPerPeriod: '1'
})

export const toRows = (contract: ContractDetail): Row[] =>
  contract.coverage.map(row => ({
    key: nextKey(),
    siteId: row.siteId,
    patternType: row.patternType,
    weekdays: row.weekdays,
    timeStart: row.timeStart ?? '',
    timeEnd: row.timeEnd ?? '',
    intervalDays: row.intervalDays ? String(row.intervalDays) : '7',
    visitsPerPeriod: row.visitsPerPeriod ? String(row.visitsPerPeriod) : '1'
  }))

const positiveInt = (value: string, max: number) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= max

/** Mirrors the submit-time completeness rules (ARCHITECTURE 4.3) for each row. */
export const validate = (rows: Row[]): RowErrors => {
  const errors: RowErrors = {}

  rows.forEach((row, index) => {
    const e: Partial<Record<keyof Row, string>> = {}

    if (row.patternType === 'WEEKLY') {
      if (row.weekdays.length === 0) e.weekdays = 'Pick at least one day.'
      if (!row.timeStart) e.timeStart = 'Required.'
      if (!row.timeEnd) e.timeEnd = 'Required.'
      if (row.timeStart && row.timeStart === row.timeEnd) e.timeEnd = 'Must differ from the start.'
    }

    if (row.patternType === 'INTERVAL' && !positiveInt(row.intervalDays, 3650)) e.intervalDays = '1 to 3650 days.'
    if (row.patternType === 'AD_HOC' && !positiveInt(row.visitsPerPeriod, 1000)) e.visitsPerPeriod = '1 to 1000 visits.'

    if (Object.keys(e).length) errors[index] = e
  })

  return errors
}

export const toInput = (row: Row): CoverageInput => {
  if (row.patternType === 'WEEKLY') {
    return {
      siteId: row.siteId,
      patternType: 'WEEKLY',
      weekdays: row.weekdays,
      timeStart: row.timeStart,
      timeEnd: row.timeEnd
    }
  }

  if (row.patternType === 'INTERVAL')
    return { siteId: row.siteId, patternType: 'INTERVAL', weekdays: [], intervalDays: Number(row.intervalDays) }

  return { siteId: row.siteId, patternType: 'AD_HOC', weekdays: [], visitsPerPeriod: Number(row.visitsPerPeriod) }
}

/** Weekly visits and hours a site's WEEKLY rows plan, plus the average for interval rows. */
export const siteTotals = (rows: Row[]) =>
  rows.reduce(
    (acc, row) => {
      if (row.patternType === 'WEEKLY') {
        return {
          visits: acc.visits + row.weekdays.length,
          minutes: acc.minutes + row.weekdays.length * spanMinutes(row.timeStart, row.timeEnd)
        }
      }

      if (row.patternType === 'INTERVAL' && Number(row.intervalDays) > 0)
        return { ...acc, visits: acc.visits + 7 / Number(row.intervalDays) }

      return acc
    },
    { visits: 0, minutes: 0 }
  )

export const hours = (minutes: number) => `${Math.round((minutes / 60) * 10) / 10}h`
