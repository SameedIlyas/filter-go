import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { TimesheetStatus } from '../src/generated/prisma/client.js'
import { D } from '../src/lib/money.js'
import { body, client, createTestApp, makeTimesheet, resetDb, signIn } from './helpers.js'
import type { TestApp } from './helpers.js'
import { addException, at, buildWorld, END, entryFor, otherOrgAdmin, outsideSupervisor, shiftFor, START } from './timesheets.setup.js'
import type { World } from './timesheets.setup.js'

let t: TestApp
let w: World
const api = () => client(t.app)

beforeAll(async () => {
  t = await createTestApp()
})
afterAll(() => t.close())
beforeEach(async () => {
  await resetDb(t.prisma)
  w = await buildWorld(t)
})

const post = (path: string, token: string, payload: object = {}) => api().post(path, { token, body: payload })
const rowOf = (id: string) => t.prisma.timesheetEntry.findUniqueOrThrow({ where: { id } })
const audits = (id: string, action: string) => t.prisma.auditEvent.findMany({ where: { entity: 'timesheet', entityId: id, action } })
const codeOf = (res: Parameters<typeof body>[0]) => body(res).error?.code

describe('POST /v1/timesheets/:id/approve', () => {
  it('stamps the snapshot rates, records the approver, resolves every exception and audits, all together', async () => {
    const { entry } = await entryFor(t, w)

    await addException(t, entry.id, 'LATE_IN')
    await addException(t, entry.id, 'OVERTIME')

    const res = await post(`/v1/timesheets/${entry.id}/approve`, w.supervisor.token)
    const json = body(res)

    expect(res.statusCode).toBe(200)
    expect(json.data?.timesheet).toMatchObject({ status: 'APPROVED', approvedById: w.supervisor.user.id, payRateSnapshot: '22.00', openExceptionCount: 0 })
    expect(json.data?.timesheet).not.toHaveProperty('billRateSnapshot')

    const row = await rowOf(entry.id)

    expect(row).toMatchObject({ status: 'APPROVED', approvedById: w.supervisor.user.id })
    expect(row.payRateSnapshot?.toFixed(2)).toBe('22.00')
    expect(row.billRateSnapshot?.toFixed(2)).toBe('145.00')
    expect(row.approvedAt).toBeInstanceOf(Date)

    const exceptions = await t.prisma.timesheetException.findMany({ where: { timesheetEntryId: entry.id } })

    expect(exceptions).toHaveLength(2)
    expect(exceptions.every(e => e.resolved && e.resolvedById === w.supervisor.user.id && e.resolvedAt)).toBe(true)

    const [audit] = await audits(entry.id, 'approved')

    expect(audit?.diff).toMatchObject({ fromStatus: 'SUBMITTED', payRateSnapshot: '22.00', billRateSnapshot: '145.00', exceptionsResolved: ['LATE_IN', 'OVERTIME'] })
    expect(audit?.actorId).toBe(w.supervisor.user.id)
  })

  it('an admin sees both stamped rates in the response', async () => {
    const { entry } = await entryFor(t, w)
    const res = await post(`/v1/timesheets/${entry.id}/approve`, w.admin.token)

    expect(body(res).data?.timesheet).toMatchObject({ payRateSnapshot: '22.00', billRateSnapshot: '145.00' })
  })

  it('approves an ADJUSTED entry too', async () => {
    const { entry } = await entryFor(t, w, { status: 'ADJUSTED' })

    expect((await post(`/v1/timesheets/${entry.id}/approve`, w.admin.token)).statusCode).toBe(200)
  })

  it('stamps billable and payable as independent flags (a redo is billable=false, payable=true)', async () => {
    const { entry } = await entryFor(t, w, { billable: false, payable: true })
    const res = await post(`/v1/timesheets/${entry.id}/approve`, w.admin.token)

    expect(body(res).data?.timesheet).toMatchObject({ billable: false, payable: true, status: 'APPROVED' })
  })

  it('pay rate falls back to the worker default, then to zero', async () => {
    const noLinePay = await buildWorldAgain([{ billRate: '100.00', payRate: null }])
    const first = await entryFor(t, noLinePay)

    expect(body(await post(`/v1/timesheets/${first.entry.id}/approve`, noLinePay.admin.token)).data?.timesheet).toMatchObject({ payRateSnapshot: '18.00', billRateSnapshot: '100.00' })

    const bare = await signIn(t, 'FIELD_USER')
    const second = await entryFor(t, noLinePay, { worker: bare.user })

    expect(body(await post(`/v1/timesheets/${second.entry.id}/approve`, noLinePay.admin.token)).data?.timesheet.payRateSnapshot).toBe('0.00')
  })

  it('prices from the shift serviceRef line, else the first line of the snapshot', async () => {
    const two = await buildWorldAgain([
      { description: 'Standard', billRate: '100.00', payRate: '10.00' },
      { description: 'Deep clean', billRate: '250.50', payRate: '31.25' }
    ])
    const [, deep] = two.fixture.lines
    const primary = await entryFor(t, two)
    const chosen = await entryFor(t, two, { serviceRef: deep?.id })

    expect(body(await post(`/v1/timesheets/${primary.entry.id}/approve`, two.admin.token)).data?.timesheet).toMatchObject({ billRateSnapshot: '100.00', payRateSnapshot: '10.00' })
    expect(body(await post(`/v1/timesheets/${chosen.entry.id}/approve`, two.admin.token)).data?.timesheet).toMatchObject({ billRateSnapshot: '250.50', payRateSnapshot: '31.25' })
  })

  it('reads the frozen snapshot: a contract or user rate changed BEFORE approval is ignored', async () => {
    const { entry } = await entryFor(t, w)

    await t.prisma.contractLine.updateMany({ data: { billRate: D('999.00'), payRate: D('99.00') } })
    await t.prisma.user.update({ where: { id: w.worker.user.id }, data: { defaultPayRate: D('77.00') } })

    const res = await post(`/v1/timesheets/${entry.id}/approve`, w.admin.token)

    expect(body(res).data?.timesheet).toMatchObject({ billRateSnapshot: '145.00', payRateSnapshot: '22.00' })
  })

  it('an approved entry never changes when the live contract line or the worker default rate change afterwards', async () => {
    const { entry } = await entryFor(t, w)

    await post(`/v1/timesheets/${entry.id}/approve`, w.admin.token)
    await t.prisma.contractLine.updateMany({ data: { billRate: D('500.00'), payRate: D('50.00') } })
    await t.prisma.user.update({ where: { id: w.worker.user.id }, data: { defaultPayRate: D('40.00') } })

    const detail = await api().get(`/v1/timesheets/${entry.id}`, { token: w.admin.token })

    expect(body(detail).data?.timesheet).toMatchObject({ billRateSnapshot: '145.00', payRateSnapshot: '22.00' })
  })

  it('is refused when the schedule terms cannot price the shift', async () => {
    const { entry } = await entryFor(t, w)
    const snapshot = w.schedule.termsSnapshot as { serviceItems: unknown[] }

    await t.prisma.schedule.update({ where: { id: w.schedule.id }, data: { termsSnapshot: { ...snapshot, serviceItems: [] } } })

    const res = await post(`/v1/timesheets/${entry.id}/approve`, w.admin.token)

    expect(res.statusCode).toBe(422)
    expect((await rowOf(entry.id)).status).toBe('SUBMITTED')
  })

  it.each(['OPEN', 'REJECTED', 'CORRECTED', 'APPROVED', 'INVOICED'] as TimesheetStatus[])('refuses an entry in status %s with INVALID_STATE and stamps nothing', async status => {
    const { entry } = await entryFor(t, w, { status })
    const res = await post(`/v1/timesheets/${entry.id}/approve`, w.admin.token)

    expect(res.statusCode).toBe(409)
    expect(body(res).error).toMatchObject({ code: 'INVALID_STATE', details: { from: status, to: 'APPROVED' } })
    expect((await rowOf(entry.id)).approvedAt).toBeNull()
  })

  it('RACE: approving the same entry at the same time stamps and audits once', async () => {
    const { entry } = await entryFor(t, w)
    const results = await Promise.all([w.admin, w.supervisor, w.admin].map(who => post(`/v1/timesheets/${entry.id}/approve`, who.token)))

    expect(results.map(r => r.statusCode).sort()).toEqual([200, 409, 409])
    expect(await audits(entry.id, 'approved')).toHaveLength(1)
  })

  it('needs sign-in, ADMIN or SUPERVISOR, and an entry in the caller organization and site scope', async () => {
    const { entry } = await entryFor(t, w)
    const url = `/v1/timesheets/${entry.id}/approve`

    expect((await api().post(url, {})).statusCode).toBe(401)
    expect((await post(url, w.worker.token)).statusCode).toBe(403)
    expect((await post(url, w.clientUser.token)).statusCode).toBe(403)
    expect((await post(url, (await otherOrgAdmin(t)).token)).statusCode).toBe(404)
    expect((await post(url, (await outsideSupervisor(t)).token)).statusCode).toBe(404)
    expect((await post('/v1/timesheets/nope/approve', w.admin.token)).statusCode).toBe(400)
    expect((await post(`/v1/timesheets/${'0'.repeat(8)}-0000-4000-8000-000000000000/approve`, w.admin.token)).statusCode).toBe(404)
    expect((await post(url, w.admin.token, { rate: '1.00' })).statusCode).toBe(400)
    expect((await rowOf(entry.id)).status).toBe('SUBMITTED')
  })
})

const buildWorldAgain = async (lines: NonNullable<Parameters<typeof buildWorld>[1]>['lines']) => {
  await resetDb(t.prisma)

  return buildWorld(t, { lines })
}

describe('POST /v1/timesheets/approve-batch', () => {
  it('approves clean SUBMITTED entries and reports why it skipped the others', async () => {
    const clean = await entryFor(t, w)
    const cleanToo = await entryFor(t, w, { start: at(START, 24 * 60), end: at(END, 24 * 60) })
    const flagged = await entryFor(t, w, { start: at(START, 48 * 60), end: at(END, 48 * 60) })
    const adjusted = await entryFor(t, w, { status: 'ADJUSTED', start: at(START, 72 * 60), end: at(END, 72 * 60) })
    const open = await entryFor(t, w, { status: 'OPEN', start: at(START, 96 * 60), end: at(END, 96 * 60) })
    const missing = '11111111-1111-4111-8111-111111111111'

    await addException(t, flagged.entry.id, 'GEOFENCE_MISS')
    await addException(t, cleanToo.entry.id, 'LATE_IN', true)

    const ids = [clean, cleanToo, flagged, adjusted, open].map(item => item.entry.id).concat(missing)
    const res = await post('/v1/timesheets/approve-batch', w.supervisor.token, { ids })
    const data = body(res).data

    expect(res.statusCode).toBe(200)
    expect(data?.approved).toEqual([clean.entry.id, cleanToo.entry.id])
    expect(data?.skipped).toEqual([
      { id: flagged.entry.id, reason: 'HAS_UNRESOLVED_EXCEPTIONS' },
      { id: adjusted.entry.id, reason: 'NOT_SUBMITTED' },
      { id: open.entry.id, reason: 'NOT_SUBMITTED' },
      { id: missing, reason: 'NOT_FOUND' }
    ])
    expect((await rowOf(clean.entry.id)).payRateSnapshot?.toFixed(2)).toBe('22.00')
    expect((await rowOf(flagged.entry.id)).status).toBe('SUBMITTED')
    expect(await audits(clean.entry.id, 'approved')).toHaveLength(1)
  })

  it('treats duplicates once, other organizations and out-of-scope sites as not found, and unpriceable entries as skipped', async () => {
    const mine = await entryFor(t, w)
    const outsider = await outsideSupervisor(t)
    const res = await post('/v1/timesheets/approve-batch', outsider.token, { ids: [mine.entry.id, mine.entry.id] })

    expect(body(res).data).toEqual({ approved: [], skipped: [{ id: mine.entry.id, reason: 'NOT_FOUND' }] })

    const foreign = await otherOrgAdmin(t)

    expect(body(await post('/v1/timesheets/approve-batch', foreign.token, { ids: [mine.entry.id] })).data?.skipped[0]?.reason).toBe('NOT_FOUND')

    const snapshot = w.schedule.termsSnapshot as { serviceItems: unknown[] }

    await t.prisma.schedule.update({ where: { id: w.schedule.id }, data: { termsSnapshot: { ...snapshot, serviceItems: [] } } })

    expect(body(await post('/v1/timesheets/approve-batch', w.admin.token, { ids: [mine.entry.id, mine.entry.id] })).data).toEqual({
      approved: [],
      skipped: [{ id: mine.entry.id, reason: 'UNPROCESSABLE' }]
    })
  })

  it('validates: 1 to 100 uuids, nothing else', async () => {
    const one = '11111111-1111-4111-8111-111111111111'

    expect((await post('/v1/timesheets/approve-batch', w.admin.token, { ids: [] })).statusCode).toBe(400)
    expect((await post('/v1/timesheets/approve-batch', w.admin.token, { ids: ['nope'] })).statusCode).toBe(400)
    expect((await post('/v1/timesheets/approve-batch', w.admin.token, {})).statusCode).toBe(400)
    expect((await post('/v1/timesheets/approve-batch', w.admin.token, { ids: [one], extra: 1 })).statusCode).toBe(400)
    expect((await post('/v1/timesheets/approve-batch', w.admin.token, { ids: Array(101).fill(one) })).statusCode).toBe(400)
    expect((await post('/v1/timesheets/approve-batch', w.admin.token, { ids: Array(100).fill(one) })).statusCode).toBe(200)
  })

  it('needs sign-in and ADMIN or SUPERVISOR', async () => {
    const payload = { ids: ['11111111-1111-4111-8111-111111111111'] }

    expect((await api().post('/v1/timesheets/approve-batch', { body: payload })).statusCode).toBe(401)
    expect((await post('/v1/timesheets/approve-batch', w.worker.token, payload)).statusCode).toBe(403)
    expect((await post('/v1/timesheets/approve-batch', w.clientUser.token, payload)).statusCode).toBe(403)
  })

  it('RACE: two batches over the same entries approve each entry exactly once', async () => {
    const entries = await Promise.all([0, 1, 2, 3, 4].map(day => entryFor(t, w, { start: at(START, day * 1440), end: at(END, day * 1440) })))
    const ids = entries.map(item => item.entry.id)
    const [a, b] = await Promise.all([post('/v1/timesheets/approve-batch', w.admin.token, { ids }), post('/v1/timesheets/approve-batch', w.supervisor.token, { ids })])
    const approvedA = body(a).data?.approved as string[]
    const approvedB = body(b).data?.approved as string[]

    expect(approvedA.length + approvedB.length).toBe(5)
    expect(new Set([...approvedA, ...approvedB]).size).toBe(5)
    expect(await t.prisma.auditEvent.count({ where: { action: 'approved' } })).toBe(5)
  })
})

describe('POST /v1/timesheets/:id/reject', () => {
  it('rejects a SUBMITTED entry with a reason, tells the worker, audits', async () => {
    const { entry } = await entryFor(t, w)
    const res = await post(`/v1/timesheets/${entry.id}/reject`, w.supervisor.token, { reason: 'Clock-out looks wrong' })

    expect(res.statusCode).toBe(200)
    expect(body(res).data?.timesheet).toMatchObject({ status: 'REJECTED', rejectionReason: 'Clock-out looks wrong' })

    const note = await t.prisma.notification.findFirstOrThrow({ where: { userId: w.worker.user.id, type: 'timesheet.rejected' } })

    expect(note.body).toContain('Clock-out looks wrong')
    expect(note.data).toMatchObject({ timesheetId: entry.id })
    expect((await audits(entry.id, 'rejected'))[0]?.diff).toMatchObject({ reason: 'Clock-out looks wrong', fromStatus: 'SUBMITTED' })
  })

  it('rejects an ADJUSTED entry too', async () => {
    const { entry } = await entryFor(t, w, { status: 'ADJUSTED' })

    expect((await post(`/v1/timesheets/${entry.id}/reject`, w.admin.token, { reason: 'No' })).statusCode).toBe(200)
  })

  it.each(['OPEN', 'REJECTED', 'CORRECTED', 'APPROVED', 'INVOICED'] as TimesheetStatus[])('refuses status %s with INVALID_STATE', async status => {
    const { entry } = await entryFor(t, w, { status })
    const res = await post(`/v1/timesheets/${entry.id}/reject`, w.admin.token, { reason: 'No' })

    expect(res.statusCode).toBe(409)
    expect(body(res).error).toMatchObject({ code: 'INVALID_STATE', details: { from: status, to: 'REJECTED' } })
    expect(await t.prisma.notification.count()).toBe(0)
  })

  it('validates and guards', async () => {
    const { entry } = await entryFor(t, w)
    const url = `/v1/timesheets/${entry.id}/reject`

    expect((await post(url, w.admin.token, {})).statusCode).toBe(400)
    expect((await post(url, w.admin.token, { reason: '   ' })).statusCode).toBe(400)
    expect((await post(url, w.admin.token, { reason: 'x'.repeat(1001) })).statusCode).toBe(400)
    expect((await post(url, w.admin.token, { reason: 'ok', extra: true })).statusCode).toBe(400)
    expect((await api().post(url, { body: { reason: 'x' } })).statusCode).toBe(401)
    expect((await post(url, w.worker.token, { reason: 'x' })).statusCode).toBe(403)
    expect((await post(url, w.clientUser.token, { reason: 'x' })).statusCode).toBe(403)
    expect((await post(url, (await otherOrgAdmin(t)).token, { reason: 'x' })).statusCode).toBe(404)
    expect((await post(url, (await outsideSupervisor(t)).token, { reason: 'x' })).statusCode).toBe(404)
    expect((await rowOf(entry.id)).status).toBe('SUBMITTED')
  })
})

describe('POST /v1/timesheets/:id/adjust', () => {
  it('changes times, recomputes minutes and exceptions, and audits before/after with the reason', async () => {
    const { entry } = await entryFor(t, w)
    const res = await post(`/v1/timesheets/${entry.id}/adjust`, w.supervisor.token, { clockOutAt: at(END, 30).toISOString(), breakMinutes: 10, reason: 'Stayed late to finish' })
    const json = body(res)

    expect(res.statusCode).toBe(200)
    expect(json.data?.timesheet).toMatchObject({ status: 'ADJUSTED', actualMinutes: 500, breakMinutes: 10, adjustmentReason: 'Stayed late to finish' })
    // the entry has no GPS points and the site has coordinates, so GEOFENCE_MISS is (correctly) raised as well
    expect(json.data?.timesheet.exceptions.map((e: { type: string }) => e.type).sort()).toEqual(['GEOFENCE_MISS', 'OVERTIME'])

    const [audit] = await audits(entry.id, 'adjusted')

    expect(audit?.diff).toMatchObject({
      reason: 'Stayed late to finish',
      before: { clockOutAt: END.toISOString(), breakMinutes: 0, actualMinutes: 480, billable: true, status: 'SUBMITTED' },
      after: { clockOutAt: at(END, 30).toISOString(), breakMinutes: 10, actualMinutes: 500, status: 'ADJUSTED' }
    })
  })

  it('removes an unresolved exception whose cause is gone, but keeps a resolved one as history', async () => {
    const { entry } = await entryFor(t, w, { clockInAt: at(START, 30), actualMinutes: 450 })

    await addException(t, entry.id, 'LATE_IN')
    await addException(t, entry.id, 'OVERTIME', true)
    await addException(t, entry.id, 'GEOFENCE_MISS')
    await post(`/v1/timesheets/${entry.id}/adjust`, w.admin.token, { clockInAt: START.toISOString(), reason: 'Arrived on time' })

    const left = await t.prisma.timesheetException.findMany({ where: { timesheetEntryId: entry.id }, orderBy: { type: 'asc' } })

    // LATE_IN: cause gone, unresolved -> deleted. OVERTIME: cause gone but resolved -> stays. GEOFENCE_MISS: no GPS on the entry and the site has coordinates -> still there
    expect(left.map(e => [e.type, e.resolved])).toEqual([['OVERTIME', true], ['GEOFENCE_MISS', false]])
  })

  it('billable and payable are independent flags', async () => {
    const { entry } = await entryFor(t, w)
    const res = await post(`/v1/timesheets/${entry.id}/adjust`, w.admin.token, { billable: false, reason: 'Redo of a failed visit' })

    expect(body(res).data?.timesheet).toMatchObject({ billable: false, payable: true, status: 'ADJUSTED' })

    const again = await post(`/v1/timesheets/${entry.id}/adjust`, w.admin.token, { payable: false, reason: 'Unpaid too' })

    expect(body(again).data?.timesheet).toMatchObject({ billable: false, payable: false })
  })

  it('an ADJUSTED entry can be adjusted again', async () => {
    const { entry } = await entryFor(t, w, { status: 'ADJUSTED' })

    expect((await post(`/v1/timesheets/${entry.id}/adjust`, w.admin.token, { breakMinutes: 30, reason: 'Lunch' })).statusCode).toBe(200)
    expect((await rowOf(entry.id)).actualMinutes).toBe(450)
  })

  it('RACE: two simultaneous adjusts apply one after the other, each seeing the other as its "before"', async () => {
    const { entry } = await entryFor(t, w)
    const results = await Promise.all([
      post(`/v1/timesheets/${entry.id}/adjust`, w.admin.token, { breakMinutes: 30, reason: 'A' }),
      post(`/v1/timesheets/${entry.id}/adjust`, w.supervisor.token, { breakMinutes: 45, reason: 'B' })
    ])

    expect(results.map(r => r.statusCode)).toEqual([200, 200])

    const rows = await audits(entry.id, 'adjusted')
    const befores = rows.map(row => (row.diff as { before: { breakMinutes: number } }).before.breakMinutes).sort()

    expect(rows).toHaveLength(2)
    expect(befores[0]).toBe(0)
    expect([30, 45]).toContain(befores[1])
  })

  it('validates: a reason and at least one change, sane times, no unknown fields', async () => {
    const { entry } = await entryFor(t, w)
    const url = `/v1/timesheets/${entry.id}/adjust`
    const adjust = (payload: object) => post(url, w.admin.token, payload)

    expect((await adjust({ breakMinutes: 5 })).statusCode).toBe(400)
    expect((await adjust({ breakMinutes: 5, reason: '  ' })).statusCode).toBe(400)
    expect((await adjust({ reason: 'only a reason' })).statusCode).toBe(400)
    expect((await adjust({ clockOutAt: 'yesterday', reason: 'x' })).statusCode).toBe(400)
    expect((await adjust({ clockOutAt: '2026-03-03T08:00:00', reason: 'x' })).statusCode).toBe(400)
    expect((await adjust({ breakMinutes: -5, reason: 'x' })).statusCode).toBe(400)
    expect((await adjust({ billable: 'no', reason: 'x' })).statusCode).toBe(400)
    expect((await adjust({ breakMinutes: 5, reason: 'x', status: 'APPROVED' })).statusCode).toBe(400)
    expect((await adjust({ payRateSnapshot: '1.00', reason: 'x' })).statusCode).toBe(400)
    expect((await adjust({ clockOutAt: START.toISOString(), reason: 'x' })).statusCode).toBe(400)
    expect((await adjust({ clockInAt: at(START, -13 * 60).toISOString(), reason: 'x' })).statusCode).toBe(400)
    expect((await adjust({ clockOutAt: at(END, 13 * 60).toISOString(), reason: 'x' })).statusCode).toBe(400)
    expect((await rowOf(entry.id)).status).toBe('SUBMITTED')
  })

  it('refuses a request that changes nothing', async () => {
    const { entry } = await entryFor(t, w)
    const res = await post(`/v1/timesheets/${entry.id}/adjust`, w.admin.token, { breakMinutes: 0, billable: true, reason: 'no-op' })

    expect(res.statusCode).toBe(422)
    expect((await rowOf(entry.id)).status).toBe('SUBMITTED')
  })

  it.each(['OPEN', 'REJECTED', 'CORRECTED', 'APPROVED', 'INVOICED'] as TimesheetStatus[])('refuses status %s with INVALID_STATE (approved and invoiced are immutable)', async status => {
    const { entry } = await entryFor(t, w, { status })
    const res = await post(`/v1/timesheets/${entry.id}/adjust`, w.admin.token, { breakMinutes: 5, reason: 'x' })

    expect(res.statusCode).toBe(409)
    expect(body(res).error).toMatchObject({ code: 'INVALID_STATE', details: { from: status, to: 'ADJUSTED' } })
    expect((await rowOf(entry.id)).breakMinutes).toBe(0)
  })

  it('guards: sign-in, role, organization, site scope', async () => {
    const { entry } = await entryFor(t, w)
    const url = `/v1/timesheets/${entry.id}/adjust`
    const payload = { breakMinutes: 5, reason: 'x' }

    expect((await api().post(url, { body: payload })).statusCode).toBe(401)
    expect((await post(url, w.worker.token, payload)).statusCode).toBe(403)
    expect((await post(url, w.clientUser.token, payload)).statusCode).toBe(403)
    expect((await post(url, (await otherOrgAdmin(t)).token, payload)).statusCode).toBe(404)
    expect((await post(url, (await outsideSupervisor(t)).token, payload)).statusCode).toBe(404)
    expect((await post('/v1/timesheets/x/adjust', w.admin.token, payload)).statusCode).toBe(400)
  })

  it('gives a no-show real times: the entry is filled in and the shift returns to COMPLETED', async () => {
    const shift = await shiftFor(t, w, { status: 'NO_SHOW' })
    const noShow = await makeTimesheet(t, shift, w.worker.user, { clockInAt: null, clockOutAt: null, actualMinutes: 0, billable: false, payable: false })

    await addException(t, noShow.id, 'NO_SHOW')

    const half = await post(`/v1/timesheets/${noShow.id}/adjust`, w.admin.token, { clockInAt: START.toISOString(), reason: 'x' })

    expect(half.statusCode).toBe(400)

    const res = await post(`/v1/timesheets/${noShow.id}/adjust`, w.admin.token, {
      clockInAt: START.toISOString(),
      clockOutAt: END.toISOString(),
      billable: true,
      payable: true,
      reason: 'Was on site, forgot the app'
    })

    expect(body(res).data?.timesheet).toMatchObject({ status: 'ADJUSTED', actualMinutes: 480, billable: true })
    expect((await t.prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })).status).toBe('COMPLETED')
    // The sweep-owned NO_SHOW exception stays until a supervisor resolves it or approves
    expect((await t.prisma.timesheetException.findMany({ where: { timesheetEntryId: noShow.id } })).map(e => e.type)).toContain('NO_SHOW')
  })
})

describe('correct and resubmit', () => {
  const rejected = async () => {
    const made = await entryFor(t, w, { clockOutAt: at(END, -60), actualMinutes: 420 })

    await post(`/v1/timesheets/${made.entry.id}/reject`, w.supervisor.token, { reason: 'Left early?' })

    return made.entry
  }

  it('walks the whole loop: reject -> correct -> resubmit -> approve, recomputing exceptions on the way', async () => {
    const entry = await rejected()
    const url = `/v1/timesheets/${entry.id}`
    const fixed = await api().patch(`${url}/correct`, { token: w.worker.token, body: { clockOutAt: END.toISOString(), note: 'Phone died' } })

    expect(fixed.statusCode).toBe(200)
    expect(body(fixed).data?.timesheet).toMatchObject({ status: 'CORRECTED', actualMinutes: 480, rejectionReason: 'Left early?' })
    expect((await audits(entry.id, 'corrected'))[0]?.diff).toMatchObject({ note: 'Phone died', before: { actualMinutes: 420 }, after: { actualMinutes: 480 } })

    const again = await post(`${url}/resubmit`, w.worker.token)

    expect(again.statusCode).toBe(200)
    expect(body(again).data?.timesheet).toMatchObject({ status: 'SUBMITTED', rejectionReason: null })
    expect((await audits(entry.id, 'resubmitted'))[0]?.diff).toMatchObject({ previousRejectionReason: 'Left early?' })
    expect((await post(`${url}/approve`, w.admin.token)).statusCode).toBe(200)
  })

  it('correct only works on a REJECTED entry, for its own worker', async () => {
    const entry = await rejected()
    const url = `/v1/timesheets/${entry.id}/correct`
    const patch = (token: string, payload: object) => api().patch(url, { token, body: payload })

    expect((await api().patch(url, { body: { note: 'x' } })).statusCode).toBe(401)
    expect((await patch(w.supervisor.token, { note: 'x' })).statusCode).toBe(403)
    expect((await patch(w.admin.token, { note: 'x' })).statusCode).toBe(403)
    expect((await patch((await signIn(t, 'FIELD_USER')).token, { note: 'x' })).statusCode).toBe(404)
    expect((await patch(w.worker.token, { note: 'x' })).statusCode).toBe(200)

    // now CORRECTED, so a second correct is an invalid edge
    const second = await patch(w.worker.token, { note: 'again' })

    expect(second.statusCode).toBe(409)
    expect(body(second).error).toMatchObject({ code: 'INVALID_STATE', details: { from: 'CORRECTED', to: 'CORRECTED' } })
  })

  it.each(['OPEN', 'SUBMITTED', 'APPROVED', 'ADJUSTED', 'INVOICED'] as TimesheetStatus[])('correct refuses status %s', async status => {
    const { entry } = await entryFor(t, w, { status })
    const res = await api().patch(`/v1/timesheets/${entry.id}/correct`, { token: w.worker.token, body: { note: 'x' } })

    expect(res.statusCode).toBe(409)
    expect(codeOf(res)).toBe('INVALID_STATE')
  })

  it.each(['OPEN', 'SUBMITTED', 'REJECTED', 'APPROVED', 'ADJUSTED', 'INVOICED'] as TimesheetStatus[])('resubmit refuses status %s', async status => {
    const { entry } = await entryFor(t, w, { status })
    const res = await post(`/v1/timesheets/${entry.id}/resubmit`, w.worker.token)

    expect(res.statusCode).toBe(409)
    expect(body(res).error).toMatchObject({ code: 'INVALID_STATE', details: { from: status, to: 'SUBMITTED' } })
  })

  it('validates corrections: window of 12 hours around the shift, order, whole minutes, no unknown fields', async () => {
    const entry = await rejected()
    const url = `/v1/timesheets/${entry.id}/correct`
    const patch = (payload: object) => api().patch(url, { token: w.worker.token, body: payload })

    expect((await patch({})).statusCode).toBe(400)
    expect((await patch({ clockInAt: at(START, -12 * 60 - 1).toISOString() })).statusCode).toBe(400)
    expect((await patch({ clockOutAt: at(END, 12 * 60 + 1).toISOString() })).statusCode).toBe(400)
    expect((await patch({ clockOutAt: START.toISOString() })).statusCode).toBe(400)
    expect((await patch({ breakMinutes: 1.5 })).statusCode).toBe(400)
    expect((await patch({ approvedAt: START.toISOString() })).statusCode).toBe(400)
    expect((await patch({ payRateSnapshot: '9.00' })).statusCode).toBe(400)
    expect((await rowOf(entry.id)).status).toBe('REJECTED')
    expect((await patch({ clockInAt: at(START, -12 * 60).toISOString(), clockOutAt: at(END, 12 * 60).toISOString() })).statusCode).toBe(200)
  })

  it('a correction that brings a new problem raises the exception on resubmit', async () => {
    const entry = await rejected()

    await api().patch(`/v1/timesheets/${entry.id}/correct`, { token: w.worker.token, body: { clockInAt: at(START, 45).toISOString() } })
    await post(`/v1/timesheets/${entry.id}/resubmit`, w.worker.token)

    expect((await t.prisma.timesheetException.findMany({ where: { timesheetEntryId: entry.id } })).map(e => e.type).sort()).toEqual(['EARLY_OUT', 'GEOFENCE_MISS', 'LATE_IN'].sort())
  })

  it('resubmit guards: token, role, owner, strict body', async () => {
    const entry = await rejected()
    const url = `/v1/timesheets/${entry.id}/resubmit`

    await api().patch(`/v1/timesheets/${entry.id}/correct`, { token: w.worker.token, body: { note: 'x' } })

    expect((await api().post(url, {})).statusCode).toBe(401)
    expect((await post(url, w.supervisor.token)).statusCode).toBe(403)
    expect((await post(url, (await signIn(t, 'FIELD_USER')).token)).statusCode).toBe(404)
    expect((await post(url, w.worker.token, { x: 1 })).statusCode).toBe(400)
    expect((await post(url, w.worker.token)).statusCode).toBe(200)
  })
})

describe('POST /v1/timesheet-exceptions/:id/resolve', () => {
  it('resolves one exception without approving the entry, and audits', async () => {
    const { entry } = await entryFor(t, w)
    const late = await addException(t, entry.id, 'LATE_IN')
    const res = await post(`/v1/timesheet-exceptions/${late.id}/resolve`, w.supervisor.token, { note: 'Traffic, agreed with client' })

    expect(res.statusCode).toBe(200)
    expect(body(res).data?.exception).toMatchObject({ id: late.id, type: 'LATE_IN', resolved: true, resolvedById: w.supervisor.user.id })
    expect((await rowOf(entry.id)).status).toBe('SUBMITTED')
    expect((await audits(entry.id, 'exception_resolved'))[0]?.diff).toMatchObject({ exceptionId: late.id, type: 'LATE_IN', note: 'Traffic, agreed with client' })
  })

  it('a second resolve is a CONFLICT (RACE: only one of two simultaneous calls wins)', async () => {
    const { entry } = await entryFor(t, w)
    const late = await addException(t, entry.id, 'LATE_IN')
    const results = await Promise.all([1, 2, 3].map(() => post(`/v1/timesheet-exceptions/${late.id}/resolve`, w.admin.token)))

    expect(results.map(r => r.statusCode).sort()).toEqual([200, 409, 409])
    expect(await audits(entry.id, 'exception_resolved')).toHaveLength(1)
  })

  it('guards: sign-in, role, organization, site scope, ids, strict body', async () => {
    const { entry } = await entryFor(t, w)
    const late = await addException(t, entry.id, 'LATE_IN')
    const url = `/v1/timesheet-exceptions/${late.id}/resolve`

    expect((await api().post(url, {})).statusCode).toBe(401)
    expect((await post(url, w.worker.token)).statusCode).toBe(403)
    expect((await post(url, w.clientUser.token)).statusCode).toBe(403)
    expect((await post(url, (await otherOrgAdmin(t)).token)).statusCode).toBe(404)
    expect((await post(url, (await outsideSupervisor(t)).token)).statusCode).toBe(404)
    expect((await post('/v1/timesheet-exceptions/nope/resolve', w.admin.token)).statusCode).toBe(400)
    expect((await post(url, w.admin.token, { resolved: false })).statusCode).toBe(400)
    expect((await post(url, w.admin.token, { note: 'x'.repeat(1001) })).statusCode).toBe(400)
    expect((await t.prisma.timesheetException.findUniqueOrThrow({ where: { id: late.id } })).resolved).toBe(false)
  })
})

describe('exceptions are one row per type per entry', () => {
  it('recomputing repeatedly never duplicates a row and keeps resolved history', async () => {
    const { entry } = await entryFor(t, w, { clockInAt: at(START, 30), actualMinutes: 450 })

    for (const minutes of [5, 6, 7]) {
      await post(`/v1/timesheets/${entry.id}/adjust`, w.admin.token, { breakMinutes: minutes, reason: 'tweak' })
    }

    const rows = await t.prisma.timesheetException.findMany({ where: { timesheetEntryId: entry.id, type: 'LATE_IN' } })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.detail).toMatchObject({ minutesLate: 30 })
  })
})
