import { describe, expect, it } from 'vitest'

import type { InvoiceSummary, InvoiceTrace } from '@/types/invoiceTypes'

import { invoiceActions, nextStep } from './actions'
import { invoicesCsv, reconciliationCsv } from './csv'
import { lineAmount, lineErrors, paymentAmountError, sumMoney } from './money'
import { isDay, periodDays, periodError, previousMonth } from './period'

const synced = {
  accounting: { state: 'DONE' as const, lastError: null },
  payment: { state: 'NONE' as const, lastError: null }
}

const base = {
  status: 'DRAFT' as const,
  total: '100.00',
  amountPaid: '0.00',
  balance: '100.00',
  sync: synced,
  lineCount: 2
}

describe('invoiceActions', () => {
  it('lets a draft be edited, approved, voided and deleted', () => {
    const actions = invoiceActions(base, true)

    expect(actions).toMatchObject({ edit: true, approve: true, remove: true, void: true, send: false, pay: false })
  })

  it('refuses approval of an empty draft and says why', () => {
    const actions = invoiceActions({ ...base, total: '0.00', lineCount: 0 }, true)

    expect(actions.approve).toBe(false)
    expect(actions.approveBlocked).toMatch(/at least one line/)
  })

  it('sends only from SYNCED and takes payments only while money is owed', () => {
    expect(invoiceActions({ ...base, status: 'SYNCED' }, true)).toMatchObject({ send: true, pay: true, edit: false })
    expect(invoiceActions({ ...base, status: 'SENT' }, true)).toMatchObject({ send: false, pay: true })
    expect(invoiceActions({ ...base, status: 'PAID', amountPaid: '100.00', balance: '0.00' }, true).pay).toBe(false)
  })

  it('blocks void once money was received', () => {
    const actions = invoiceActions({ ...base, status: 'SENT', amountPaid: '10.00', balance: '90.00' }, true)

    expect(actions.void).toBe(false)
    expect(actions.voidBlocked).toMatch(/payment/)
  })

  it('offers a retry when either integration gave up', () => {
    const dead = { ...synced, payment: { state: 'DEAD' as const, lastError: 'boom' } }

    expect(invoiceActions({ ...base, status: 'SYNCED', sync: dead }, true).retrySync).toBe(true)
    expect(nextStep({ status: 'SYNCED', sync: dead })).toMatch(/pay link failed/)
  })

  it('gives a client user nothing to do', () => {
    expect(Object.values(invoiceActions(base, false)).some(Boolean)).toBe(false)
  })
})

describe('money', () => {
  it('prices a line exactly, rounding half up to the cent', () => {
    expect(lineAmount('3', '0.10')).toBe('0.30')
    expect(lineAmount('7.5', '22.50')).toBe('168.75')
    expect(lineAmount('0.3333', '10')).toBe('3.33')
    expect(lineAmount('0.0005', '10')).toBe('0.01')
    expect(lineAmount('1.23456', '10')).toBeNull()
    expect(lineAmount('2', 'abc')).toBeNull()
  })

  it('sums money without float drift', () => {
    expect(sumMoney(['0.10', '0.20'])).toBe('0.30')
    expect(sumMoney([])).toBe('0.00')
  })

  it('validates a manual line like the server', () => {
    expect(lineErrors({ description: ' ', qty: '0', unitRate: '1.234' })).toEqual({
      description: expect.any(String),
      qty: 'Must be more than zero.',
      unitRate: expect.any(String)
    })
    expect(lineErrors({ description: 'Call-out fee', qty: '1', unitRate: '75' })).toEqual({})
  })

  it('refuses an overpayment', () => {
    expect(paymentAmountError('100.01', '100.00')).toMatch(/still owed/)
    expect(paymentAmountError('100', '100.00')).toBeNull()
    expect(paymentAmountError('0', '100.00')).toBe('Must be more than zero.')
  })
})

describe('period', () => {
  it('defaults to the previous calendar month, across a year boundary', () => {
    expect(previousMonth(new Date(2026, 9, 2))).toEqual({ start: '2026-09-01', end: '2026-09-30' })
    expect(previousMonth(new Date(2026, 0, 15))).toEqual({ start: '2025-12-01', end: '2025-12-31' })
  })

  it('counts both ends and rejects impossible dates', () => {
    expect(periodDays('2026-09-01', '2026-09-30')).toBe(30)
    expect(isDay('2026-02-30')).toBe(false)
    expect(isDay('2026-02-28')).toBe(true)
  })

  it('explains a bad period', () => {
    expect(periodError('2026-09-10', '2026-09-01')).toMatch(/ends before/)
    expect(periodError('2025-01-01', '2026-01-02')).toMatch(/366/)
    expect(periodError('2026-09-01', '2026-09-30')).toBeNull()
  })
})

const summary = (patch: Partial<InvoiceSummary> = {}): InvoiceSummary => ({
  id: 'i1',
  invoiceNumber: 'INV-2026-000001',
  status: 'SENT',
  client: { id: 'c1', legalName: '=Acme, Inc.' },
  contract: { id: 'k1', contractNumber: 'CON-2026-000001', version: 2 },
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  issueDate: '2026-10-01',
  dueDate: '2026-10-31',
  subtotal: '100.00',
  tax: '8.00',
  total: '108.00',
  amountPaid: '0.00',
  balance: '108.00',
  paymentUrl: null,
  sentAt: null,
  paidAt: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  ...patch
})

describe('csv', () => {
  it('exports invoices with quoting and formula guards', () => {
    const [header, row] = invoicesCsv([summary()]).split('\r\n')

    expect(header.startsWith('Invoice number,Client,Contract,Status')).toBe(true)
    expect(row).toContain(`"'=Acme, Inc."`)
    expect(row).toContain('CON-2026-000001 v2,Sent,2026-10-01')
  })

  it('puts each billed line next to its timesheet, in the given timezone', () => {
    const trace: InvoiceTrace = {
      invoice: { id: 'i1', invoiceNumber: 'INV-2026-000001', status: 'SENT', contractId: 'k1' },
      lines: [
        {
          lineId: 'l1',
          sourceType: 'TIMESHEET',
          sourceId: 't1',
          description: 'Patrol - Mall - 2026-09-03',
          qty: '7.5000',
          unitRate: '20.00',
          amount: '150.00',
          taxAmount: '0.00',
          timesheet: {
            id: 't1',
            status: 'INVOICED',
            worker: { id: 'u1', name: 'Ana Field' },
            clockIn: { at: '2026-09-03T13:00:00.000Z', lat: null, lng: null },
            clockOut: { at: '2026-09-03T21:00:00.000Z', lat: null, lng: null },
            breakMinutes: 30,
            scheduledMinutes: 480,
            actualMinutes: 450,
            billable: true,
            autoClosed: false,
            billRateSnapshot: '20.00',
            approvedById: null,
            approvedAt: null
          },
          shift: {
            id: 's1',
            siteId: 'x',
            siteName: 'Mall',
            scheduledStart: '2026-09-03T13:00:00.000Z',
            scheduledEnd: '2026-09-03T21:00:00.000Z',
            status: 'COMPLETED',
            isExtra: false,
            notes: null
          },
          schedule: null,
          contract: null,
          lead: null,
          workLogPhotos: []
        }
      ]
    }

    const [, row] = reconciliationCsv([{ invoice: summary(), trace }], 'America/Chicago').split('\r\n')

    expect(row).toBe(
      `INV-2026-000001,"'=Acme, Inc.",Sent,Timesheet,Patrol - Mall - 2026-09-03,Mall,Ana Field,2026-09-03 08:00,2026-09-03 16:00,2026-09-03 08:00,2026-09-03 16:00,30,8.00,7.50,INVOICED,7.5000,20.00,150.00,0.00`
    )
  })
})
