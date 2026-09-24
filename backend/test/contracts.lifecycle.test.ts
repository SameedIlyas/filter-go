import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { TRANSITIONS, assertTransition } from '../src/modules/contracts/contract.state.js'
import { body, createTestApp, ensureOrg, makeClient, makeContract, makeFile, makeSite, resetDb } from './helpers.js'
import type { TestApp } from './helpers.js'
import { NIL_ID, buildWorld, contractIn, createDraft, draftBody, validLine, weekly } from './contracts.support.js'
import type { World } from './contracts.support.js'

type Status = 'DRAFT' | 'PENDING_SIGNATURE' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'CANCELLED'

let t: TestApp
let w: World

beforeAll(async () => {
  t = await createTestApp()
})

afterAll(() => t.close())

beforeEach(async () => {
  await resetDb(t.prisma)
  w = await buildWorld(t)
})

const act = (id: string, action: string, payload?: unknown, token = w.admin.token) => w.api.post(`/v1/contracts/${id}/${action}`, { token, body: payload })
const statusOf = async (id: string) => (await t.prisma.contract.findUniqueOrThrow({ where: { id } })).status
const actions = (id: string): Record<string, () => ReturnType<typeof act>> => ({
  submit: () => act(id, 'submit'),
  sign: () => act(id, 'sign', { signedBy: 'Pat Client' }),
  suspend: () => act(id, 'suspend'),
  resume: () => act(id, 'resume'),
  cancel: () => act(id, 'cancel', { reason: 'Client left' })
})

/** The rulebook, written out independently of the implementation's table. */
const EXPECTED: Record<Status, Record<string, Status | null>> = {
  DRAFT: { submit: 'PENDING_SIGNATURE', sign: null, suspend: null, resume: null, cancel: 'CANCELLED' },
  PENDING_SIGNATURE: { submit: null, sign: 'ACTIVE', suspend: null, resume: null, cancel: 'CANCELLED' },
  ACTIVE: { submit: null, sign: null, suspend: 'SUSPENDED', resume: null, cancel: 'CANCELLED' },
  SUSPENDED: { submit: null, sign: null, suspend: null, resume: 'ACTIVE', cancel: 'CANCELLED' },
  EXPIRED: { submit: null, sign: null, suspend: null, resume: null, cancel: null },
  CANCELLED: { submit: null, sign: null, suspend: null, resume: null, cancel: null }
}
const TARGET_OF: Record<string, Status> = { submit: 'PENDING_SIGNATURE', sign: 'ACTIVE', suspend: 'SUSPENDED', resume: 'ACTIVE', cancel: 'CANCELLED' }

describe('state machine table', () => {
  it('has exactly the documented edges', () => {
    expect(TRANSITIONS).toEqual({
      DRAFT: ['PENDING_SIGNATURE', 'CANCELLED'],
      PENDING_SIGNATURE: ['ACTIVE', 'CANCELLED'],
      ACTIVE: ['SUSPENDED', 'EXPIRED', 'CANCELLED'],
      SUSPENDED: ['ACTIVE', 'EXPIRED', 'CANCELLED'],
      EXPIRED: [],
      CANCELLED: []
    })
    expect(() => assertTransition('PENDING_SIGNATURE', 'DRAFT')).toThrow(/cannot become draft/)
    expect(() => assertTransition('EXPIRED', 'ACTIVE')).toThrow()
    expect(() => assertTransition('DRAFT', 'ACTIVE')).toThrow()
  })
})

describe('lifecycle endpoints across every status', () => {
  const cases = (Object.keys(EXPECTED) as Status[]).flatMap(status => Object.keys(EXPECTED[status] ?? {}).map(action => [status, action] as const))

  it.each(cases)('%s + %s', async (status, action) => {
    const { contract } = await contractIn(t, w, status)
    const expected = EXPECTED[status]?.[action] ?? null
    const response = await actions(contract.id)[action]?.()

    if (expected) {
      expect(response?.statusCode).toBe(200)
      expect(body(response as never).data?.contract.status).toBe(expected)
      expect(await statusOf(contract.id)).toBe(expected)
    } else {
      expect(response?.statusCode).toBe(409)
      expect(body(response as never).error).toMatchObject({
        code: 'INVALID_STATE',
        details: { entity: 'contract', from: status, to: TARGET_OF[action], allowed: TRANSITIONS[status] }
      })
      expect(await statusOf(contract.id)).toBe(status)
    }
  })

  it('an unknown id is 404', async () => {
    for (const action of ['submit', 'suspend', 'resume', 'new-version']) expect((await act(NIL_ID, action)).statusCode).toBe(404)

    expect((await act(NIL_ID, 'sign', { signedBy: 'A' })).statusCode).toBe(404)
    expect((await act(NIL_ID, 'cancel', { reason: 'A' })).statusCode).toBe(404)
  })

  it('rejects bad ids and unknown body fields', async () => {
    expect((await act('nope', 'submit')).statusCode).toBe(400)
    expect((await act(NIL_ID, 'submit', { force: true })).statusCode).toBe(400)
    expect((await act(NIL_ID, 'suspend', { reason: 'x' })).statusCode).toBe(400)
    expect((await act(NIL_ID, 'new-version', { x: 1 })).statusCode).toBe(400)
    expect((await act(NIL_ID, 'cancel', {})).statusCode).toBe(400)
    expect((await act(NIL_ID, 'cancel', { reason: '' })).statusCode).toBe(400)
    expect((await act(NIL_ID, 'cancel', { reason: 'x'.repeat(501) })).statusCode).toBe(400)
    expect((await act(NIL_ID, 'cancel', { reason: 'ok', extra: 1 })).statusCode).toBe(400)
  })

  it('audits every transition with the actor and the from/to states', async () => {
    const draft = await createDraft(w)

    await act(draft.id, 'submit')
    await act(draft.id, 'sign', { signedBy: 'Pat' })
    await act(draft.id, 'suspend')
    await act(draft.id, 'resume')
    await act(draft.id, 'cancel', { reason: 'Moved out' })

    const rows = await t.prisma.auditEvent.findMany({ where: { entity: 'contract', entityId: draft.id }, orderBy: { createdAt: 'asc' } })

    expect(rows.map(row => row.action)).toEqual(['created', 'submitted', 'signed', 'suspended', 'resumed', 'cancelled'])
    expect(rows.every(row => row.actorId === w.admin.id && row.orgId !== null)).toBe(true)
    expect(rows[3]?.diff).toEqual({ from: 'ACTIVE', to: 'SUSPENDED' })
    expect(rows[5]?.diff).toEqual({ from: 'ACTIVE', to: 'CANCELLED', reason: 'Moved out' })
  })
})

describe('submit: completeness validation (ARCHITECTURE 4.3)', () => {
  const submitIssues = async (id: string) => {
    const response = await act(id, 'submit')

    expect(response.statusCode).toBe(400)
    expect(body(response).error?.code).toBe('VALIDATION_ERROR')
    expect(await statusOf(id)).toBe('DRAFT')

    return (body(response).error?.details?.issues as Array<{ field: string; code: string }>).map(issue => `${issue.field}:${issue.code}`)
  }
  const draftWith = (over: Record<string, unknown>) => createDraft(w, over)

  it('submits a complete draft', async () => {
    const draft = await createDraft(w)
    const response = await act(draft.id, 'submit')

    expect(response.statusCode).toBe(200)
    expect(body(response).data?.contract.status).toBe('PENDING_SIGNATURE')
  })

  it('rejects a draft without lines', async () => {
    expect(await submitIssues((await draftWith({ lines: [], coverage: [] })).id)).toEqual(['lines:required'])
  })

  it('needs billRate > 0 and qty > 0 on every line, reporting each line', async () => {
    const draft = await draftWith({
      lines: [validLine(w.siteId), validLine(w.siteId, { billRate: '0' }), validLine(w.siteId, { qty: '0', billRate: '0.00' })]
    })

    expect(await submitIssues(draft.id)).toEqual(['lines[1].billRate:must_be_positive', 'lines[2].billRate:must_be_positive', 'lines[2].qty:must_be_positive'])
  })

  it('accepts the smallest positive amounts', async () => {
    const draft = await draftWith({ lines: [validLine(w.siteId, { billRate: '0.01', qty: '0.01' })] })

    expect((await act(draft.id, 'submit')).statusCode).toBe(200)
  })

  it("requires every line's site to belong to the contract's client", async () => {
    const foreign = await makeSite(t, { clientId: (await makeClient(t)).id })
    const { contract } = await contractIn(t, w, 'DRAFT', { lines: [{ siteId: w.siteId }, { siteId: foreign.id }], coverage: [{ siteId: w.siteId }, { siteId: foreign.id }] })

    expect(await submitIssues(contract.id)).toEqual(['lines[1].siteId:site_not_in_client', 'coverage[1].siteId:site_not_in_client'])
  })

  it('HOURLY allows exactly one line per site; other billing types allow several', async () => {
    const twoSameSite = [validLine(w.siteId), validLine(w.siteId, { description: 'Second' }), validLine(w.otherSiteId), validLine(w.siteId, { description: 'Third' })]
    const coverage = [weekly(w.siteId), weekly(w.otherSiteId)]
    const hourly = await draftWith({ billingType: 'HOURLY', lines: twoSameSite, coverage })

    expect(await submitIssues(hourly.id)).toEqual(['lines[1].siteId:one_line_per_site', 'lines[3].siteId:one_line_per_site'])
    expect((await act((await draftWith({ billingType: 'HOURLY', lines: [validLine(w.siteId), validLine(w.otherSiteId)], coverage })).id, 'submit')).statusCode).toBe(200)
    expect((await act((await draftWith({ billingType: 'PER_VISIT', lines: twoSameSite, coverage })).id, 'submit')).statusCode).toBe(200)
    expect((await act((await draftWith({ billingType: 'MONTHLY_FIXED', lines: twoSameSite, coverage })).id, 'submit')).statusCode).toBe(200)
  })

  it('MONTHLY_FIXED cannot be billed per visit, but a PER_VISIT contract may use any cycle', async () => {
    const bad = await draftWith({ billingType: 'MONTHLY_FIXED', billingCycle: 'PER_VISIT' })

    expect(await submitIssues(bad.id)).toEqual(['billingCycle:invalid_combination'])

    for (const billingCycle of ['PER_VISIT', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']) {
      expect((await act((await draftWith({ billingType: 'PER_VISIT', billingCycle })).id, 'submit')).statusCode).toBe(200)
    }

    expect((await act((await draftWith({ billingType: 'MONTHLY_FIXED', billingCycle: 'BIWEEKLY' })).id, 'submit')).statusCode).toBe(200)
  })

  it('every site with lines needs coverage; an AD_HOC row counts', async () => {
    const lines = [validLine(w.siteId), validLine(w.otherSiteId)]
    const missing = await draftWith({ lines, coverage: [weekly(w.siteId)] })
    const adHoc = await draftWith({ lines, coverage: [weekly(w.siteId), { siteId: w.otherSiteId, patternType: 'AD_HOC', visitsPerPeriod: 2 }] })

    expect(await submitIssues(missing.id)).toEqual(['coverage:site_without_coverage'])
    expect((await act(adHoc.id, 'submit')).statusCode).toBe(200)
  })

  it('WEEKLY needs unique weekdays, both times and different times (an end before the start means next day)', async () => {
    const cover = async (row: Record<string, unknown>) => submitIssues((await draftWith({ coverage: [weekly(w.siteId, row)] })).id)

    expect(await cover({ weekdays: [] })).toEqual(['coverage[0].weekdays:required'])
    expect(await cover({ weekdays: [2, 2] })).toEqual(['coverage[0].weekdays:duplicate_weekday'])
    expect(await cover({ timeStart: null })).toEqual(['coverage[0].timeStart:required'])
    expect(await cover({ timeEnd: null })).toEqual(['coverage[0].timeEnd:required'])
    expect(await cover({ timeStart: '09:00', timeEnd: '09:00' })).toEqual(['coverage[0].timeEnd:must_differ'])
    expect((await act((await draftWith({ coverage: [weekly(w.siteId, { timeStart: '22:00', timeEnd: '06:00', weekdays: [7] })] })).id, 'submit')).statusCode).toBe(200)
    expect((await act((await draftWith({ coverage: [weekly(w.siteId, { timeStart: '00:00', timeEnd: '23:59', weekdays: [1, 2, 3, 4, 5, 6, 7] })] })).id, 'submit')).statusCode).toBe(200)
  })

  it('catches malformed rows that bypassed the API (weekday 9, time "9:00", interval 0, no visits)', async () => {
    const { contract } = await contractIn(t, w, 'DRAFT', {
      coverage: [
        { siteId: w.siteId, patternType: 'WEEKLY', weekdays: [9], timeStart: '9:00', timeEnd: '17:00' },
        { siteId: w.siteId, patternType: 'INTERVAL', intervalDays: 0 },
        { siteId: w.siteId, patternType: 'AD_HOC' },
        { siteId: w.siteId, patternType: 'INTERVAL', intervalDays: 7 }
      ]
    })

    await t.prisma.contractCoverage.updateMany({ where: { contractId: contract.id, patternType: 'INTERVAL', intervalDays: 7 }, data: { intervalDays: null } })

    expect(await submitIssues(contract.id)).toEqual([
      'coverage[0].weekdays:invalid_weekday',
      'coverage[0].timeStart:invalid_time',
      'coverage[1].intervalDays:must_be_positive',
      'coverage[2].visitsPerPeriod:must_be_positive',
      'coverage[3].intervalDays:must_be_positive'
    ])
  })

  it('accepts INTERVAL >= 1 and AD_HOC visits >= 1', async () => {
    const draft = await draftWith({ coverage: [{ siteId: w.siteId, patternType: 'INTERVAL', intervalDays: 1 }, { siteId: w.siteId, patternType: 'AD_HOC', visitsPerPeriod: 1 }] })

    expect((await act(draft.id, 'submit')).statusCode).toBe(200)
  })

  it('endDate must not be before startDate (equal is fine)', async () => {
    expect(await submitIssues((await draftWith({ startDate: '2026-06-01', endDate: '2026-05-31' })).id)).toEqual(['endDate:before_start'])
    expect((await act((await draftWith({ startDate: '2026-06-01', endDate: '2026-06-01' })).id, 'submit')).statusCode).toBe(200)
    expect((await act((await draftWith({ startDate: '2026-06-01', endDate: null })).id, 'submit')).statusCode).toBe(200)
  })

  it('a tax code, when set, must exist in tax_rates', async () => {
    const draft = await draftWith({ lines: [validLine(w.siteId, { taxCode: 'GST' }), validLine(w.siteId, { taxCode: 'NOPE' })] })

    await t.prisma.taxRate.create({ data: { orgId: (await ensureOrg(t)).id, code: 'GST', ratePercent: 5 } })

    expect(await submitIssues(draft.id)).toEqual(['lines[1].taxCode:tax_code_not_found'])
    expect((await act((await draftWith({ lines: [validLine(w.siteId, { taxCode: 'gst' })] })).id, 'submit')).statusCode).toBe(200)
  })

  it("does not accept another organization's tax codes", async () => {
    await t.prisma.taxRate.create({ data: { orgId: (await ensureOrg(t, 'Other Org')).id, code: 'FOREIGN', ratePercent: 5 } })

    expect(await submitIssues((await draftWith({ lines: [validLine(w.siteId, { taxCode: 'FOREIGN' })] })).id)).toEqual(['lines[0].taxCode:tax_code_not_found'])
  })

  it('reports every problem at once, in a stable order', async () => {
    const draft = await draftWith({
      billingType: 'MONTHLY_FIXED',
      billingCycle: 'PER_VISIT',
      startDate: '2026-06-01',
      endDate: '2026-01-01',
      lines: [validLine(w.siteId, { billRate: '0', taxCode: 'NOPE' }), validLine(w.otherSiteId)],
      coverage: [weekly(w.siteId, { weekdays: [] })]
    })

    expect(await submitIssues(draft.id)).toEqual([
      'lines[0].billRate:must_be_positive',
      'lines[0].taxCode:tax_code_not_found',
      'billingCycle:invalid_combination',
      'endDate:before_start',
      'coverage:site_without_coverage',
      'coverage[0].weekdays:required'
    ])
  })

  it('a failed submit changes nothing and writes no audit row', async () => {
    const draft = await draftWith({ lines: [] })

    await act(draft.id, 'submit')

    expect((await t.prisma.auditEvent.findMany({ where: { entityId: draft.id } })).map(row => row.action)).toEqual(['created'])
  })
})

describe('sign', () => {
  const pending = () => contractIn(t, w, 'PENDING_SIGNATURE').then(fixture => fixture.contract)

  it('activates, records who signed and when, and audits', async () => {
    const contract = await pending()
    const file = await makeFile(t)
    const response = await act(contract.id, 'sign', { signedBy: '  Pat Client ', signedAt: '2026-01-05T15:30:00Z', documentFileId: file.id })
    const signed = body(response).data?.contract

    expect(response.statusCode).toBe(200)
    expect(signed).toMatchObject({ status: 'ACTIVE', signedBy: 'Pat Client', signedAt: '2026-01-05T15:30:00.000Z', documentFileId: file.id })

    const row = await t.prisma.auditEvent.findFirstOrThrow({ where: { entityId: contract.id, action: 'signed' } })

    expect(row.diff).toMatchObject({ from: 'PENDING_SIGNATURE', to: 'ACTIVE', signedBy: 'Pat Client', documentFileId: file.id })
  })

  it('defaults signedAt to now and documentFileId to null', async () => {
    const contract = await pending()
    const before = Date.now()
    const signed = body(await act(contract.id, 'sign', { signedBy: 'Pat' })).data?.contract

    expect(signed.documentFileId).toBeNull()
    expect(Math.abs(new Date(signed.signedAt).getTime() - before)).toBeLessThan(60_000)
  })

  it('validates the signature details', async () => {
    const contract = await pending()
    const sign = (payload: unknown) => act(contract.id, 'sign', payload)

    expect((await sign({})).statusCode).toBe(400)
    expect((await sign({ signedBy: '' })).statusCode).toBe(400)
    expect((await sign({ signedBy: 'x'.repeat(201) })).statusCode).toBe(400)
    expect((await sign({ signedBy: 'A', extra: 1 })).statusCode).toBe(400)
    expect((await sign({ signedBy: 'A', signedAt: 'yesterday' })).statusCode).toBe(400)
    expect((await sign({ signedBy: 'A', signedAt: '2026-01-05' })).statusCode).toBe(400)
    expect((await sign({ signedBy: 'A', documentFileId: 'nope' })).statusCode).toBe(400)

    const future = await sign({ signedBy: 'A', signedAt: new Date(Date.now() + 3_600_000).toISOString() })

    expect(future.statusCode).toBe(400)
    expect(body(future).error?.details?.issues).toMatchObject([{ field: 'signedAt', code: 'in_future' }])

    const missingFile = await sign({ signedBy: 'A', documentFileId: NIL_ID })

    expect(body(missingFile).error?.details?.issues).toMatchObject([{ field: 'documentFileId', code: 'file_not_found' }])
    expect(await statusOf(contract.id)).toBe('PENDING_SIGNATURE')
  })

  it("refuses another organization's document", async () => {
    const contract = await pending()
    const foreign = await makeFile(t, { orgId: (await ensureOrg(t, 'Other Org')).id })

    expect((await act(contract.id, 'sign', { signedBy: 'A', documentFileId: foreign.id })).statusCode).toBe(400)
  })

  it.each(['ACTIVE', 'SUSPENDED'] as const)('signing a new version expires the %s predecessor in the same transaction', async previousStatus => {
    const previous = await contractIn(t, w, previousStatus, { contractNumber: 'C-CHAIN' })
    const next = await makeContract(t, { orgId: previous.contract.orgId, client: previous.client, site: previous.site, contractNumber: 'C-CHAIN', version: 2, status: 'PENDING_SIGNATURE', supersedesContractId: previous.contract.id })
    const response = await act(next.contract.id, 'sign', { signedBy: 'Pat' })

    expect(response.statusCode).toBe(200)
    expect(body(response).data?.contract.versions).toEqual([
      { id: previous.contract.id, version: 1, status: 'EXPIRED' },
      { id: next.contract.id, version: 2, status: 'ACTIVE' }
    ])

    const rows = await t.prisma.auditEvent.findMany({ where: { entityId: previous.contract.id, action: 'expired' } })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.diff).toEqual({ from: previousStatus, to: 'EXPIRED', supersededBy: next.contract.id })
    expect(rows[0]?.actorId).toBe(w.admin.id)
  })

  it('leaves a predecessor that is already cancelled alone and still activates the new version', async () => {
    const previous = await contractIn(t, w, 'CANCELLED', { contractNumber: 'C-CHAIN' })
    const next = await makeContract(t, { orgId: previous.contract.orgId, client: previous.client, site: previous.site, contractNumber: 'C-CHAIN', version: 2, status: 'PENDING_SIGNATURE', supersedesContractId: previous.contract.id })

    expect((await act(next.contract.id, 'sign', { signedBy: 'Pat' })).statusCode).toBe(200)
    expect(await statusOf(previous.contract.id)).toBe('CANCELLED')
    expect(await t.prisma.auditEvent.count({ where: { entityId: previous.contract.id, action: 'expired' } })).toBe(0)
  })

  it('RACE: two simultaneous signatures activate the contract once and expire the predecessor once', async () => {
    const previous = await contractIn(t, w, 'ACTIVE', { contractNumber: 'C-RACE' })
    const next = await makeContract(t, { orgId: previous.contract.orgId, client: previous.client, site: previous.site, contractNumber: 'C-RACE', version: 2, status: 'PENDING_SIGNATURE', supersedesContractId: previous.contract.id })
    const results = await Promise.all([1, 2, 3].map(index => act(next.contract.id, 'sign', { signedBy: `Signer ${index}` })))
    const codes = results.map(result => result.statusCode).sort()

    expect(codes).toEqual([200, 409, 409])

    for (const loser of results.filter(result => result.statusCode === 409)) expect(body(loser).error?.code).toBe('INVALID_STATE')

    expect(await statusOf(next.contract.id)).toBe('ACTIVE')
    expect(await statusOf(previous.contract.id)).toBe('EXPIRED')
    expect(await t.prisma.auditEvent.count({ where: { entityId: previous.contract.id, action: 'expired' } })).toBe(1)
    expect(await t.prisma.auditEvent.count({ where: { entityId: next.contract.id, action: 'signed' } })).toBe(1)
  })

  it('RACE: sign against cancel has exactly one winner', async () => {
    const contract = await pending()
    const [signed, cancelled] = await Promise.all([act(contract.id, 'sign', { signedBy: 'Pat' }), act(contract.id, 'cancel', { reason: 'Changed mind' })])

    expect([signed.statusCode, cancelled.statusCode].sort()).toEqual([200, 409])
    expect(await statusOf(contract.id)).toBe(signed.statusCode === 200 ? 'ACTIVE' : 'CANCELLED')
  })

  it('RACE: two simultaneous suspends suspend once, the loser gets INVALID_STATE', async () => {
    const { contract } = await contractIn(t, w, 'ACTIVE')
    const results = await Promise.all([act(contract.id, 'suspend'), act(contract.id, 'suspend'), act(contract.id, 'suspend')])

    expect(results.map(result => result.statusCode).sort()).toEqual([200, 409, 409])
    expect(await t.prisma.auditEvent.count({ where: { entityId: contract.id, action: 'suspended' } })).toBe(1)
  })
})

describe('POST /contracts/:id/new-version', () => {
  const sourceFor = (status: Status = 'ACTIVE') => contractIn(t, w, status, {
    contractNumber: 'C-SRC',
    billingType: 'PER_VISIT',
    lines: [{ description: 'First', billRate: '150.00', payRate: '30.00', taxCode: 'GST' }, { description: 'Second', siteId: w.otherSiteId, billRate: '75.25', payRate: null }],
    coverage: [{}, { siteId: w.otherSiteId, patternType: 'INTERVAL', intervalDays: 14 }]
  })

  it.each(['ACTIVE', 'SUSPENDED'] as const)('copies a %s contract into DRAFT version 2', async status => {
    const source = await sourceFor(status)
    const response = await act(source.contract.id, 'new-version')
    const next = body(response).data?.contract

    expect(response.statusCode).toBe(201)
    expect(next).toMatchObject({
      status: 'DRAFT',
      version: 2,
      contractNumber: 'C-SRC',
      supersedesContractId: source.contract.id,
      signedAt: null,
      signedBy: null,
      startDate: '2026-01-01',
      billingType: 'PER_VISIT'
    })
    expect(next.id).not.toBe(source.contract.id)
    expect(next.lines.map((line: { description: string; billRate: string; payRate: string | null; taxCode: string | null }) => [line.description, line.billRate, line.payRate, line.taxCode])).toEqual([
      ['First', '150.00', '30.00', 'GST'],
      ['Second', '75.25', null, null]
    ])
    expect(next.coverage).toMatchObject([{ patternType: 'WEEKLY', weekdays: [1, 3, 5], timeStart: '18:00' }, { patternType: 'INTERVAL', intervalDays: 14 }])
    expect(next.versions.map((version: { version: number; status: string }) => [version.version, version.status])).toEqual([[1, status], [2, 'DRAFT']])
    expect(await statusOf(source.contract.id)).toBe(status)

    const row = await t.prisma.auditEvent.findFirstOrThrow({ where: { entityId: next.id, action: 'version_created' } })

    expect(row.diff).toMatchObject({ version: 2, supersedes: source.contract.id, lines: 2, coverage: 2 })
  })

  it('the copy is independent: editing version 2 leaves version 1 untouched', async () => {
    const source = await sourceFor()
    const next = body(await act(source.contract.id, 'new-version')).data?.contract

    await w.api.put(`/v1/contracts/${next.id}/lines`, { token: w.admin.token, body: { lines: [validLine(w.siteId, { billRate: '999.00' })] } })

    const original = body(await w.api.get(`/v1/contracts/${source.contract.id}`, { token: w.admin.token })).data?.contract

    expect(original.lines.map((line: { billRate: string }) => line.billRate)).toEqual(['150.00', '75.25'])
  })

  it.each(['DRAFT', 'PENDING_SIGNATURE', 'EXPIRED', 'CANCELLED'] as const)('is refused for a %s source (INVALID_STATE)', async status => {
    const source = await sourceFor(status)
    const response = await act(source.contract.id, 'new-version')

    expect(response.statusCode).toBe(409)
    expect(body(response).error).toMatchObject({ code: 'INVALID_STATE', details: { from: status } })
    expect(await t.prisma.contract.count({ where: { contractNumber: 'C-SRC' } })).toBe(1)
  })

  it.each(['DRAFT', 'PENDING_SIGNATURE'] as const)('only one open successor at a time: a %s version blocks another (CONFLICT)', async status => {
    const source = await sourceFor()

    await makeContract(t, { orgId: source.contract.orgId, client: source.client, site: source.site, contractNumber: 'C-SRC', version: 2, status, supersedesContractId: source.contract.id })

    const response = await act(source.contract.id, 'new-version')

    expect(response.statusCode).toBe(409)
    expect(body(response).error?.code).toBe('CONFLICT')
    expect(await t.prisma.contract.count({ where: { contractNumber: 'C-SRC' } })).toBe(2)
  })

  it('only the latest version can get a new version', async () => {
    const source = await sourceFor()

    await makeContract(t, { orgId: source.contract.orgId, client: source.client, site: source.site, contractNumber: 'C-SRC', version: 2, status: 'ACTIVE' })

    const response = await act(source.contract.id, 'new-version')

    expect(response.statusCode).toBe(409)
    expect(body(response).error?.code).toBe('CONFLICT')
  })

  it('a cancelled draft does not block a new attempt, and the number keeps counting up', async () => {
    const source = await sourceFor()
    const first = body(await act(source.contract.id, 'new-version')).data?.contract

    await act(first.id, 'cancel', { reason: 'Wrong terms' })

    const second = await act(source.contract.id, 'new-version')

    expect(second.statusCode).toBe(201)
    expect(body(second).data?.contract).toMatchObject({ version: 3, supersedesContractId: source.contract.id })
    expect(body(second).data?.contract.versions.map((version: { status: string }) => version.status)).toEqual(['ACTIVE', 'CANCELLED', 'DRAFT'])
  })

  it('RACE: two simultaneous requests create exactly one draft', async () => {
    const source = await sourceFor()
    const results = await Promise.all([1, 2, 3, 4].map(() => act(source.contract.id, 'new-version')))

    expect(results.map(result => result.statusCode).sort()).toEqual([201, 409, 409, 409])

    for (const loser of results.filter(result => result.statusCode === 409)) expect(body(loser).error?.code).toBe('CONFLICT')

    expect(await t.prisma.contract.count({ where: { contractNumber: 'C-SRC', status: 'DRAFT' } })).toBe(1)
  })

  it('walks the whole life of a renegotiation', async () => {
    const draft = await createDraft(w)

    await act(draft.id, 'submit')
    await act(draft.id, 'sign', { signedBy: 'Pat' })

    const v2 = body(await act(draft.id, 'new-version')).data?.contract

    await w.api.put(`/v1/contracts/${v2.id}/lines`, { token: w.admin.token, body: { lines: [validLine(w.siteId, { billRate: '160.00' })] } })
    await act(v2.id, 'submit')
    await act(v2.id, 'sign', { signedBy: 'Pat' })

    const chain = body(await w.api.get(`/v1/contracts/${v2.id}`, { token: w.admin.token })).data?.contract

    expect(chain.status).toBe('ACTIVE')
    expect(chain.versions).toEqual([{ id: draft.id, version: 1, status: 'EXPIRED' }, { id: v2.id, version: 2, status: 'ACTIVE' }])
    expect(chain.lines[0].billRate).toBe('160.00')
    expect(body(await w.api.get(`/v1/contracts/${draft.id}`, { token: w.admin.token })).data?.contract.lines[0].billRate).toBe('145.00')

    const latest = body(await w.api.get('/v1/contracts', { token: w.admin.token, query: { latestOnly: 'true' } })).data?.contracts

    expect(latest).toHaveLength(1)
    expect(latest[0]).toMatchObject({ id: v2.id, version: 2 })
    expect((await act(draft.id, 'new-version')).statusCode).toBe(409)
  })
})

describe('draft-record compatibility', () => {
  it('a rough draft made by lead conversion (structural record only) is edited and submitted through the same rules', async () => {
    const { createContractDraftRecord } = await import('../src/modules/contracts/draft-record.js')
    const { D } = await import('../src/lib/money.js')
    const admin = await t.prisma.user.findFirstOrThrow({ where: { id: w.admin.id } })
    const draft = await createContractDraftRecord(t.ctx, t.prisma, admin, {
      clientId: w.clientId,
      startDate: '2026-02-01',
      billingType: 'PER_VISIT',
      billingCycle: 'MONTHLY',
      lines: [{ siteId: w.siteId, description: 'Survey line', qty: D(1), billRate: D(0) }]
    })
    const read = await w.api.get(`/v1/contracts/${draft.id}`, { token: w.admin.token })

    expect(body(read).data?.contract).toMatchObject({ status: 'DRAFT', version: 1 })

    const submit = await act(draft.id, 'submit')

    expect((body(submit).error?.details?.issues as Array<{ field: string }>).map(issue => issue.field)).toEqual(['lines[0].billRate', 'coverage'])

    const fixed = draftBody(w.clientId, w.siteId)

    await w.api.put(`/v1/contracts/${draft.id}/lines`, { token: w.admin.token, body: { lines: fixed.lines } })
    await w.api.put(`/v1/contracts/${draft.id}/coverage`, { token: w.admin.token, body: { coverage: fixed.coverage } })

    expect((await act(draft.id, 'submit')).statusCode).toBe(200)
  })
})
