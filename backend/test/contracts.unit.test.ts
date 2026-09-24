import { describe, expect, it } from 'vitest'

import { D } from '../src/lib/money.js'
import { byId, orderedIds } from '../src/modules/contracts/contract.rows.js'
import { parseBody, createContractBody } from '../src/modules/contracts/contract.schemas.js'
import { completenessIssues } from '../src/modules/contracts/contract.validation.js'
import type { CompletenessInput } from '../src/modules/contracts/contract.validation.js'
import { AppError } from '../src/lib/errors.js'

describe('orderedIds', () => {
  it('looks like a UUID (version 7, RFC variant) and sorts in request order', () => {
    const ids = orderedIds(300)

    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)

    expect(new Set(ids).size).toBe(300)
    expect(byId(ids.map(id => ({ id })).reverse()).map(row => row.id)).toEqual(ids)
  })

  it('handles the empty batch', () => {
    expect(orderedIds(0)).toEqual([])
  })
})

describe('parseBody', () => {
  it('rewrites Zod paths of array items to bracket form', () => {
    let caught: unknown

    try {
      parseBody(createContractBody, { clientId: 'x', lines: [{ billRate: 'nope' }] })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(AppError)

    const fields = ((caught as AppError).details?.issues ?? []).map(issue => issue.field)

    expect(fields).toEqual(expect.arrayContaining(['clientId', 'lines[0].siteId', 'lines[0].billRate']))
  })

  it('lets non-validation errors and valid input through', () => {
    expect(parseBody(createContractBody, { clientId: '00000000-0000-4000-8000-000000000000', startDate: '2026-01-01', billingType: 'HOURLY', billingCycle: 'WEEKLY' })).toMatchObject({ lines: [], coverage: [] })
  })
})

describe('completenessIssues', () => {
  const base = (over: Partial<CompletenessInput> = {}): CompletenessInput => ({
    contract: { startDate: new Date('2026-01-01'), endDate: null, billingType: 'PER_VISIT', billingCycle: 'MONTHLY' },
    lines: [],
    coverage: [],
    clientSiteIds: new Set(['s1']),
    taxCodes: new Set(),
    ...over
  })
  const line = { id: 'l', contractId: 'c', siteId: 's1', serviceId: null, description: 'd', qty: D(1), billRate: D(1), payRate: null, estMinutes: null, taxCode: null }

  it('flags an empty draft with exactly one problem', () => {
    expect(completenessIssues(base())).toEqual([{ field: 'lines', code: 'required', message: expect.any(String) }])
  })

  it('accepts a valid draft', () => {
    const coverage = { id: 'v', contractId: 'c', siteId: 's1', patternType: 'WEEKLY' as const, weekdays: [1], timeStart: '08:00', timeEnd: '09:00', intervalDays: null, visitsPerPeriod: null }

    expect(completenessIssues(base({ lines: [line], coverage: [coverage] }))).toEqual([])
  })
})
