// Type Imports
import type { ContractDetail, LineInput } from '@/types/contractTypes'

/** Editable line rows for LinesDialog: form state <-> API body, plus the client-side checks. */

export type Row = {
  key: string
  siteId: string
  serviceId: string
  description: string
  qty: string
  billRate: string
  payRate: string
  estMinutes: string
  taxCode: string
}

export type RowErrors = Record<number, Partial<Record<keyof Row, string>>>

const MONEY = /^\d{1,10}(\.\d{1,2})?$/
const QTY = /^\d{1,8}(\.\d{1,2})?$/

let keySeq = 0
const nextKey = () => `row-${++keySeq}`

export const blankRow = (siteId = ''): Row => ({
  key: nextKey(),
  siteId,
  serviceId: '',
  description: '',
  qty: '1',
  billRate: '',
  payRate: '',
  estMinutes: '',
  taxCode: ''
})

export const toRows = (contract: ContractDetail): Row[] =>
  contract.lines.map(line => ({
    key: nextKey(),
    siteId: line.siteId,
    serviceId: line.serviceId ?? '',
    description: line.description,
    qty: String(Number(line.qty)),
    billRate: line.billRate ?? '',
    payRate: line.payRate ?? '',
    estMinutes: line.estMinutes ? String(line.estMinutes) : '',
    taxCode: line.taxCode ?? ''
  }))

/** Client-side checks that mirror the API schema, so most mistakes never make a round trip. */
export const validate = (rows: Row[]): RowErrors => {
  const errors: RowErrors = {}

  rows.forEach((row, index) => {
    const e: Partial<Record<keyof Row, string>> = {}

    if (!row.siteId) e.siteId = 'Pick a site.'
    if (!row.description.trim()) e.description = 'Required.'
    if (!QTY.test(row.qty.trim()) || Number(row.qty) <= 0) e.qty = 'A quantity above 0, up to 2 decimals.'
    if (!MONEY.test(row.billRate.trim())) e.billRate = 'An amount like 145.00.'
    if (row.payRate.trim() && !MONEY.test(row.payRate.trim())) e.payRate = 'An amount like 22.50.'

    if (
      row.estMinutes.trim() &&
      !(Number.isInteger(Number(row.estMinutes)) && Number(row.estMinutes) >= 1 && Number(row.estMinutes) <= 10_080)
    ) {
      e.estMinutes = 'Whole minutes, 1 to 10080.'
    }

    if (Object.keys(e).length) errors[index] = e
  })

  return errors
}

export const toInput = (row: Row): LineInput => ({
  siteId: row.siteId,
  serviceId: row.serviceId || null,
  description: row.description.trim(),
  qty: row.qty.trim(),
  billRate: row.billRate.trim(),
  payRate: row.payRate.trim() || null,
  estMinutes: row.estMinutes.trim() ? Number(row.estMinutes) : null,
  taxCode: row.taxCode || null
})
