import { describe, expect, it } from 'vitest'

import type { ContractDetail } from '@/types/contractTypes'

import { blankRow, toInput, toRows, validate } from './lineRows'
import type { Row } from './lineRows'

const SITE = '2c69760a-5293-4a80-8eab-e5fbb1ae7926'

const row = (over: Partial<Row> = {}): Row => ({
  ...blankRow(SITE),
  description: 'Filter change',
  billRate: '45.00',
  ...over
})

describe('validate', () => {
  it('accepts a complete row', () => {
    expect(validate([row()])).toEqual({})
  })

  it('reports every problem of every row, by index', () => {
    const errors = validate([
      row(),
      row({ siteId: '', description: ' ', qty: '0', billRate: '12.345', payRate: 'abc', estMinutes: '0' })
    ])

    expect(Object.keys(errors)).toEqual(['1'])
    expect(Object.keys(errors[1]).sort()).toEqual(['billRate', 'description', 'estMinutes', 'payRate', 'qty', 'siteId'])
  })

  it('mirrors the API limits', () => {
    expect(validate([row({ qty: '1.25' })])).toEqual({})
    expect(validate([row({ qty: '1.255' })])[0]?.qty).toBeDefined()
    expect(validate([row({ qty: '123456789' })])[0]?.qty).toBeDefined()
    expect(validate([row({ estMinutes: '10080' })])).toEqual({})
    expect(validate([row({ estMinutes: '10081' })])[0]?.estMinutes).toBeDefined()

    // A zero rate may be saved on a draft; only sending for signature refuses it
    expect(validate([row({ billRate: '0' })])).toEqual({})
  })
})

describe('toInput', () => {
  it('trims text and sends cleared optionals as null', () => {
    expect(
      toInput(
        row({ description: '  Filter change ', qty: ' 2 ', payRate: '', estMinutes: '', taxCode: '', serviceId: '' })
      )
    ).toEqual({
      siteId: SITE,
      serviceId: null,
      description: 'Filter change',
      qty: '2',
      billRate: '45.00',
      payRate: null,
      estMinutes: null,
      taxCode: null
    })
  })

  it('converts minutes to a number', () => {
    expect(toInput(row({ estMinutes: '90' })).estMinutes).toBe(90)
  })
})

describe('toRows', () => {
  it('turns API lines into editable rows, tolerating redacted rates', () => {
    const contract = {
      lines: [
        {
          id: 'l1',
          siteId: SITE,
          serviceId: null,
          description: 'AHU',
          qty: '6.00',
          estMinutes: 20,
          taxCode: 'GST',
          billRate: '45.00',
          payRate: null
        },
        { id: 'l2', siteId: SITE, serviceId: 's1', description: 'Coil', qty: '1.50', estMinutes: null, taxCode: null }
      ]
    } as unknown as ContractDetail

    const [first, second] = toRows(contract)

    expect(first).toMatchObject({
      qty: '6',
      billRate: '45.00',
      payRate: '',
      estMinutes: '20',
      taxCode: 'GST',
      serviceId: ''
    })
    expect(second).toMatchObject({ qty: '1.5', billRate: '', estMinutes: '', serviceId: 's1' })
    expect(first.key).not.toBe(second.key)
  })
})
