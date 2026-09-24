import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { assertScheduleTransition, assertShiftTransition, SCHEDULE_TRANSITIONS, SHIFT_TRANSITIONS } from '../src/modules/scheduling/constants.js'
import { body, createTestApp, resetDb, signIn } from './helpers.js'
import type { TestApp } from './helpers.js'
import { addFieldUser, at, buildOutsider, buildWorld, draftSchedule, publishedSchedule, shiftAt } from './scheduling.helpers.js'
import type { World } from './scheduling.helpers.js'

let t: TestApp
let w: World

beforeAll(async () => {
  t = await createTestApp()
})

afterAll(() => t.close())

beforeEach(async () => {
  await resetDb(t.prisma)
  t.mailer.clear()
  w = await buildWorld(t)
})

const MONDAY_NIGHT = { start: '2026-03-03T00:00:00.000Z', end: '2026-03-03T08:00:00.000Z' }

const addShift = (scheduleId: string, payload: Record<string, unknown>, token = w.admin.token) => w.api.post(`/v1/schedules/${scheduleId}/shifts`, { token, body: payload })
const patch = (shiftId: string, payload: Record<string, unknown>, token = w.admin.token) => w.api.patch(`/v1/shifts/${shiftId}`, { token, body: payload })
const act = (shiftId: string, action: string, payload?: Record<string, unknown>, token = w.admin.token) => w.api.post(`/v1/shifts/${shiftId}/${action}`, { token, body: payload })
const shiftAudit = (shiftId: string) => t.prisma.auditEvent.findMany({ where: { entity: 'shift', entityId: shiftId }, orderBy: { createdAt: 'asc' } })
const noticesOfType = (type: string) => t.prisma.notification.findMany({ where: { type } })

describe('state tables', () => {
  it('schedule: every edge is either allowed or throws INVALID_STATE listing the allowed targets', () => {
    for (const from of Object.keys(SCHEDULE_TRANSITIONS) as Array<keyof typeof SCHEDULE_TRANSITIONS>) {
      for (const to of Object.keys(SCHEDULE_TRANSITIONS) as Array<keyof typeof SCHEDULE_TRANSITIONS>) {
        if (SCHEDULE_TRANSITIONS[from].includes(to)) {
          expect(() => assertScheduleTransition(from, to)).not.toThrow()
        } else {
          expect(() => assertScheduleTransition(from, to)).toThrowError(expect.objectContaining({ code: 'INVALID_STATE', details: { entity: 'schedule', from, to, allowed: SCHEDULE_TRANSITIONS[from] } }))
        }
      }
    }
  })

  it('shift: Scheduling owns OPEN/ASSIGNED/CONFIRMED/CANCELLED, everything else is a dead end for it', () => {
    expect(SHIFT_TRANSITIONS.OPEN).toEqual(['ASSIGNED', 'CANCELLED'])
    expect(SHIFT_TRANSITIONS.IN_PROGRESS).toEqual([])
    expect(SHIFT_TRANSITIONS.COMPLETED).toEqual([])
    expect(SHIFT_TRANSITIONS.NO_SHOW).toEqual([])
    expect(SHIFT_TRANSITIONS.CANCELLED).toEqual([])
    expect(() => assertShiftTransition('ASSIGNED', 'CONFIRMED')).not.toThrow()
    expect(() => assertShiftTransition('CONFIRMED', 'CONFIRMED')).toThrowError(expect.objectContaining({ code: 'INVALID_STATE' }))
    expect(() => assertShiftTransition('OPEN', 'CONFIRMED')).toThrowError(expect.objectContaining({ code: 'INVALID_STATE' }))
  })
})

describe('POST /v1/schedules/:id/shifts', () => {
  it('adds an OPEN shift, inheriting the service line and quantity from the snapshot, and audits it', async () => {
    const schedule = await draftSchedule(w)
    const response = await addShift(schedule.id, { start: at(4, 14), end: at(4, 22), notes: 'Bring keys' })

    expect(response.statusCode).toBe(201)
    expect(body(response).data?.shift).toMatchObject({
      scheduleId: schedule.id,
      status: 'OPEN',
      assignedUser: null,
      isExtra: false,
      notes: 'Bring keys',
      serviceRef: w.fixture.lines[0]?.id,
      billableQty: '1.00',
      scheduledStart: at(4, 14),
      scheduledEnd: at(4, 22)
    })

    const audit = await shiftAudit(body(response).data?.shift.id)

    expect(audit.map(row => row.action)).toEqual(['created'])
    expect(audit[0]?.diff).toMatchObject({ scheduleId: schedule.id, assignedUserId: null })
  })

  it('accepts an explicit billable quantity and the extra flag', async () => {
    const schedule = await draftSchedule(w)
    const response = await addShift(schedule.id, { start: at(4, 14), end: at(4, 22), billableQty: '2.50', isExtra: true })

    expect(body(response).data?.shift).toMatchObject({ billableQty: '2.50', isExtra: true })
  })

  it('can assign in the same step: ASSIGNED, audited, and the assignee is told once the schedule is published', async () => {
    const draft = await draftSchedule(w)
    const onDraft = await addShift(draft.id, { start: at(4, 14), end: at(4, 22), assignedUserId: w.field.user.id })

    expect(body(onDraft).data?.shift).toMatchObject({ status: 'ASSIGNED', assignedUser: { id: w.field.user.id } })
    expect((await shiftAudit(body(onDraft).data?.shift.id)).map(row => row.action)).toEqual(['created', 'assigned'])
    expect(await t.prisma.notification.count()).toBe(0)

    const published = await publishedSchedule(w, { periodStart: '2026-04-06', periodEnd: '2026-04-12' })

    await addShift(published.id, { start: '2026-04-07T14:00:00.000Z', end: '2026-04-07T22:00:00.000Z', assignedUserId: w.field.user.id })
    await t.ctx.background.flush()

    expect(await noticesOfType('shift.assigned')).toHaveLength(1)
    expect(t.mailer.sent).toHaveLength(1)
  })

  it('runs the same validation as assign: warnings need an override, overlaps never pass', async () => {
    const schedule = await draftSchedule(w)
    const stranger = await addFieldUser(w, { siteAccess: false })
    const refused = await addShift(schedule.id, { start: at(4, 14), end: at(4, 22), assignedUserId: stranger.user.id })

    expect(refused.statusCode).toBe(422)
    expect(body(refused).error?.code).toBe('ASSIGNMENT_WARNINGS')
    expect(await t.prisma.shift.count()).toBe(0)

    const overridden = await addShift(schedule.id, { start: at(4, 14), end: at(4, 22), assignedUserId: stranger.user.id, overrideWarnings: true, reason: 'Trusted temp' })

    expect(overridden.statusCode).toBe(201)

    const audit = await shiftAudit(body(overridden).data?.shift.id)

    expect(audit.map(row => row.action)).toEqual(['created', 'assign_override'])
    expect(audit[1]?.diff).toMatchObject({ reason: 'Trusted temp', userId: stranger.user.id })

    const overlap = await addShift(schedule.id, { start: at(4, 20), end: at(5, 4), assignedUserId: stranger.user.id, overrideWarnings: true })

    expect(overlap.statusCode).toBe(409)
    expect(body(overlap).error?.code).toBe('SHIFT_OVERLAP')
    expect(await t.prisma.shift.count()).toBe(1)
  })

  it.each(['LOCKED', 'CLOSED'] as const)('is refused on a %s schedule with SCHEDULE_LOCKED', async status => {
    const schedule = await publishedSchedule(w, { status })
    const response = await addShift(schedule.id, { start: at(4, 14), end: at(4, 22) })

    expect(response.statusCode).toBe(409)
    expect(body(response).error?.code).toBe('SCHEDULE_LOCKED')
  })

  it('accepts a shift of exactly 24 hours and refuses more, or a non-positive length', async () => {
    const schedule = await draftSchedule(w)

    expect((await addShift(schedule.id, { start: at(4, 0), end: at(5, 0) })).statusCode).toBe(201)
    expect((await addShift(schedule.id, { start: at(6, 0), end: at(7, 1) })).statusCode).toBe(400)
    expect((await addShift(schedule.id, { start: at(6, 8), end: at(6, 8) })).statusCode).toBe(400)
    expect((await addShift(schedule.id, { start: at(6, 9), end: at(6, 8) })).statusCode).toBe(400)
  })

  it.each([
    ['an unknown field', { extra: 1 }],
    ['a start without an offset', { start: '2026-03-04T14:00:00' }],
    ['a non-date start', { start: 'tomorrow' }],
    ['a quantity with 3 decimals', { billableQty: '1.234' }],
    ['a negative quantity', { billableQty: '-1' }],
    ['a bad assignee id', { assignedUserId: 'nope' }],
    ['an over-long note', { notes: 'x'.repeat(1001) }],
    ['a non-boolean isExtra', { isExtra: 'yes' }]
  ])('rejects %s with 400', async (_label, over) => {
    const schedule = await draftSchedule(w)
    const response = await addShift(schedule.id, { start: at(4, 14), end: at(4, 22), ...over })

    expect(response.statusCode).toBe(400)
    expect(body(response).error?.code).toBe('VALIDATION_ERROR')
  })

  it('enforces roles, scope and tenancy', async () => {
    const schedule = await draftSchedule(w)
    const outsider = await buildOutsider(t)
    const strangerSupervisor = await signIn(t, 'SUPERVISOR')
    const payload = { start: at(4, 14), end: at(4, 22) }

    expect((await w.api.post(`/v1/schedules/${schedule.id}/shifts`, { body: payload })).statusCode).toBe(401)
    expect((await addShift(schedule.id, payload, w.field.token)).statusCode).toBe(403)
    expect((await addShift(schedule.id, payload, w.clientUser.token)).statusCode).toBe(403)
    expect((await addShift(schedule.id, payload, outsider.admin.token)).statusCode).toBe(404)
    expect((await addShift(schedule.id, payload, strangerSupervisor.token)).statusCode).toBe(404)
    expect((await addShift('nope', payload)).statusCode).toBe(400)
    expect((await addShift(schedule.id, payload, w.supervisor.token)).statusCode).toBe(201)
  })
})

describe('PATCH /v1/shifts/:id', () => {
  it('edits notes, quantity and times, audits before/after, and returns the shift', async () => {
    const shift = await shiftAt(w, await draftSchedule(w), { ...MONDAY_NIGHT })
    const response = await patch(shift.id, { start: at(3, 1), end: at(3, 9), notes: 'Gate code 42', billableQty: '3' })

    expect(response.statusCode).toBe(200)
    expect(body(response).data?.shift).toMatchObject({ scheduledStart: at(3, 1), scheduledEnd: at(3, 9), notes: 'Gate code 42', billableQty: '3.00' })

    const audit = (await shiftAudit(shift.id))[0]

    expect(audit).toMatchObject({ action: 'updated', actorId: w.admin.user.id })
    expect(audit?.diff).toEqual({
      before: { start: at(3, 0), end: at(3, 8), notes: null, billableQty: null },
      after: { start: at(3, 1), end: at(3, 9), notes: 'Gate code 42', billableQty: '3.00' }
    })
  })

  it('records only what changed and can clear notes and quantity with null', async () => {
    const shift = await shiftAt(w, await draftSchedule(w), { billableQty: '2' })

    await patch(shift.id, { notes: 'x' })

    const cleared = await patch(shift.id, { notes: null, billableQty: null })

    expect(body(cleared).data?.shift).toMatchObject({ notes: null, billableQty: null })

    const audits = await shiftAudit(shift.id)

    expect(audits[0]?.diff).toEqual({ before: { notes: null }, after: { notes: 'x' } })
    expect(audits[1]?.diff).toEqual({ before: { notes: 'x', billableQty: '2.00' }, after: { notes: null, billableQty: null } })
  })

  it.each(['IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED'] as const)('refuses a %s shift with INVALID_STATE', async status => {
    const shift = await shiftAt(w, await publishedSchedule(w), { status })
    const response = await patch(shift.id, { notes: 'late edit' })

    expect(response.statusCode).toBe(409)
    expect(body(response).error).toMatchObject({ code: 'INVALID_STATE', details: { entity: 'shift', from: status } })
  })

  it.each(['LOCKED', 'CLOSED'] as const)('refuses any edit on a %s schedule with SCHEDULE_LOCKED', async status => {
    const shift = await shiftAt(w, await publishedSchedule(w, { status }))
    const response = await patch(shift.id, { notes: 'late edit' })

    expect(response.statusCode).toBe(409)
    expect(body(response).error?.code).toBe('SCHEDULE_LOCKED')
  })

  it('moving an assigned shift into another of their shifts is a 409 SHIFT_OVERLAP; moving it clear is fine', async () => {
    const schedule = await publishedSchedule(w)
    const clash = await shiftAt(w, schedule, { assignedUserId: w.field.user.id, start: at(4, 0), end: at(4, 8) })
    const shift = await shiftAt(w, schedule, { assignedUserId: w.field.user.id, start: at(3, 0), end: at(3, 8) })
    const refused = await patch(shift.id, { start: at(3, 20), end: at(4, 4) })

    expect(refused.statusCode).toBe(409)
    expect(body(refused).error).toMatchObject({ code: 'SHIFT_OVERLAP', details: { context: { shiftId: clash.id } } })
    expect((await patch(shift.id, { start: at(3, 10), end: at(3, 18) })).statusCode).toBe(200)
  })

  it('a time change resets a CONFIRMED shift to ASSIGNED and tells the assignee (published schedules only)', async () => {
    const published = await shiftAt(w, await publishedSchedule(w), { assignedUserId: w.field.user.id, status: 'CONFIRMED' })
    const moved = await patch(published.id, { start: at(3, 1), end: at(3, 9) })

    expect(body(moved).data?.shift.status).toBe('ASSIGNED')
    expect(await noticesOfType('shift.updated')).toMatchObject([{ userId: w.field.user.id }])

    const other = await addFieldUser(w)
    const draftShift = await shiftAt(w, await draftSchedule(w, { periodStart: '2026-04-06', periodEnd: '2026-04-12' }), { assignedUserId: other.user.id, start: at(3, 0), end: at(3, 8) })

    await patch(draftShift.id, { start: at(3, 1), end: at(3, 9) })

    expect(await noticesOfType('shift.updated')).toHaveLength(1)
  })

  it('a notes-only edit keeps CONFIRMED and sends nothing', async () => {
    const shift = await shiftAt(w, await publishedSchedule(w), { assignedUserId: w.field.user.id, status: 'CONFIRMED' })
    const response = await patch(shift.id, { notes: 'still on' })

    expect(body(response).data?.shift.status).toBe('CONFIRMED')
    expect(await t.prisma.notification.count()).toBe(0)
  })

  it.each([
    ['nothing to update', {}],
    ['an unknown field', { status: 'COMPLETED' }],
    ['assigning through PATCH', { assignedUserId: 'x' }],
    ['end before start', { start: at(3, 9), end: at(3, 8) }],
    ['a non-date', { end: 'later' }]
  ])('rejects %s with 400', async (_label, payload) => {
    const shift = await shiftAt(w, await draftSchedule(w))

    expect((await patch(shift.id, payload)).statusCode).toBe(400)
  })

  it('an end before the existing start is refused even when only end is sent', async () => {
    const shift = await shiftAt(w, await draftSchedule(w), MONDAY_NIGHT)

    expect((await patch(shift.id, { end: at(2, 20) })).statusCode).toBe(400)
  })

  it('enforces roles, scope and tenancy', async () => {
    const shift = await shiftAt(w, await draftSchedule(w))
    const outsider = await buildOutsider(t)
    const strangerSupervisor = await signIn(t, 'SUPERVISOR')

    expect((await w.api.patch(`/v1/shifts/${shift.id}`, { body: { notes: 'x' } })).statusCode).toBe(401)
    expect((await patch(shift.id, { notes: 'x' }, w.field.token)).statusCode).toBe(403)
    expect((await patch(shift.id, { notes: 'x' }, w.clientUser.token)).statusCode).toBe(403)
    expect((await patch(shift.id, { notes: 'x' }, outsider.admin.token)).statusCode).toBe(404)
    expect((await patch(shift.id, { notes: 'x' }, strangerSupervisor.token)).statusCode).toBe(404)
    expect((await patch('nope', { notes: 'x' })).statusCode).toBe(400)
    expect((await patch(shift.id, { notes: 'x' }, w.supervisor.token)).statusCode).toBe(200)
  })
})

describe('POST /v1/shifts/:id/unassign', () => {
  it.each(['ASSIGNED', 'CONFIRMED'] as const)('%s -> OPEN, audited with who was removed', async status => {
    const shift = await shiftAt(w, await draftSchedule(w), { assignedUserId: w.field.user.id, status })
    const response = await act(shift.id, 'unassign')

    expect(response.statusCode).toBe(200)
    expect(body(response).data?.shift).toMatchObject({ status: 'OPEN', assignedUser: null })
    expect((await shiftAudit(shift.id))[0]).toMatchObject({ action: 'unassigned' })
    expect((await shiftAudit(shift.id))[0]?.diff).toEqual({ userId: w.field.user.id, fromStatus: status })
  })

  it('tells the previous assignee only when the schedule is PUBLISHED', async () => {
    const draftShift = await shiftAt(w, await draftSchedule(w), { assignedUserId: w.field.user.id })

    await act(draftShift.id, 'unassign')

    expect(await t.prisma.notification.count()).toBe(0)

    const shift = await shiftAt(w, await publishedSchedule(w, { periodStart: '2026-04-06', periodEnd: '2026-04-12' }), { assignedUserId: w.field.user.id })

    await act(shift.id, 'unassign')

    expect(await noticesOfType('shift.unassigned')).toMatchObject([{ userId: w.field.user.id }])
  })

  it.each(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED'] as const)('a %s shift cannot be unassigned', async status => {
    const shift = await shiftAt(w, await publishedSchedule(w), { status })
    const response = await act(shift.id, 'unassign')

    expect(response.statusCode).toBe(409)
    expect(body(response).error).toMatchObject({ code: 'INVALID_STATE', details: { entity: 'shift', from: status, to: 'OPEN' } })
  })

  it('a locked schedule refuses with SCHEDULE_LOCKED', async () => {
    const shift = await shiftAt(w, await publishedSchedule(w, { status: 'LOCKED' }), { assignedUserId: w.field.user.id })

    expect(body(await act(shift.id, 'unassign')).error?.code).toBe('SCHEDULE_LOCKED')
  })

  it('enforces roles, scope, tenancy and strict bodies', async () => {
    const shift = await shiftAt(w, await draftSchedule(w), { assignedUserId: w.field.user.id })
    const outsider = await buildOutsider(t)
    const strangerSupervisor = await signIn(t, 'SUPERVISOR')

    expect((await w.api.post(`/v1/shifts/${shift.id}/unassign`)).statusCode).toBe(401)
    expect((await act(shift.id, 'unassign', undefined, w.field.token)).statusCode).toBe(403)
    expect((await act(shift.id, 'unassign', undefined, outsider.admin.token)).statusCode).toBe(404)
    expect((await act(shift.id, 'unassign', undefined, strangerSupervisor.token)).statusCode).toBe(404)
    expect((await act('nope', 'unassign')).statusCode).toBe(400)
    expect((await act(shift.id, 'unassign', { userId: 'x' })).statusCode).toBe(400)
    expect((await act(shift.id, 'unassign', undefined, w.supervisor.token)).statusCode).toBe(200)
  })
})

describe('POST /v1/shifts/:id/cancel', () => {
  it.each(['OPEN', 'ASSIGNED', 'CONFIRMED'] as const)('%s -> CANCELLED with the reason kept', async status => {
    const shift = await shiftAt(w, await draftSchedule(w), { status, assignedUserId: status === 'OPEN' ? undefined : w.field.user.id })
    const response = await act(shift.id, 'cancel', { reason: 'Client closed the site' })

    expect(response.statusCode).toBe(200)
    expect(body(response).data?.shift).toMatchObject({ status: 'CANCELLED', cancelledReason: 'Client closed the site' })
    expect((await shiftAudit(shift.id))[0]?.diff).toEqual({ reason: 'Client closed the site', fromStatus: status, userId: status === 'OPEN' ? null : w.field.user.id })
  })

  it('notifies the assignee on a PUBLISHED schedule and withdraws open offers', async () => {
    const shift = await shiftAt(w, await publishedSchedule(w), { assignedUserId: w.field.user.id })
    const open = await shiftAt(w, await publishedSchedule(w, { periodStart: '2026-04-06', periodEnd: '2026-04-12' }))

    await t.prisma.shiftOffer.create({ data: { shiftId: open.id, userId: w.field.user.id } })
    await act(shift.id, 'cancel', { reason: 'no work' })
    await act(open.id, 'cancel', { reason: 'no work' })

    expect(await noticesOfType('shift.cancelled')).toMatchObject([{ userId: w.field.user.id }])
    expect((await t.prisma.shiftOffer.findFirstOrThrow({ where: { shiftId: open.id } })).status).toBe('WITHDRAWN')
  })

  it('is still allowed on a LOCKED schedule (so leftovers can be cleaned up and it can be closed), never on CLOSED', async () => {
    const locked = await shiftAt(w, await publishedSchedule(w, { status: 'LOCKED' }))

    expect((await act(locked.id, 'cancel', { reason: 'cleanup' })).statusCode).toBe(200)

    const closed = await shiftAt(w, await publishedSchedule(w, { status: 'CLOSED', periodStart: '2026-04-06', periodEnd: '2026-04-12' }))
    const response = await act(closed.id, 'cancel', { reason: 'cleanup' })

    expect(response.statusCode).toBe(409)
    expect(body(response).error?.code).toBe('SCHEDULE_LOCKED')
  })

  it.each(['IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED'] as const)('a %s shift cannot be cancelled', async status => {
    const shift = await shiftAt(w, await publishedSchedule(w), { status })
    const response = await act(shift.id, 'cancel', { reason: 'x' })

    expect(response.statusCode).toBe(409)
    expect(body(response).error).toMatchObject({ code: 'INVALID_STATE', details: { from: status, to: 'CANCELLED', allowed: [] } })
  })

  it('needs a reason, and enforces roles, scope and tenancy', async () => {
    const shift = await shiftAt(w, await draftSchedule(w))
    const outsider = await buildOutsider(t)
    const strangerSupervisor = await signIn(t, 'SUPERVISOR')

    expect((await w.api.post(`/v1/shifts/${shift.id}/cancel`, { body: { reason: 'x' } })).statusCode).toBe(401)
    expect((await act(shift.id, 'cancel', { reason: 'x' }, w.field.token)).statusCode).toBe(403)
    expect((await act(shift.id, 'cancel', { reason: 'x' }, outsider.admin.token)).statusCode).toBe(404)
    expect((await act(shift.id, 'cancel', { reason: 'x' }, strangerSupervisor.token)).statusCode).toBe(404)
    expect((await act('nope', 'cancel', { reason: 'x' })).statusCode).toBe(400)
    expect((await act(shift.id, 'cancel', {})).statusCode).toBe(400)
    expect((await act(shift.id, 'cancel', { reason: '   ' })).statusCode).toBe(400)
    expect((await act(shift.id, 'cancel', { reason: 'x', extra: 1 })).statusCode).toBe(400)
    expect((await act(shift.id, 'cancel', { reason: 'x' }, w.supervisor.token)).statusCode).toBe(200)
  })
})

describe('POST /v1/shifts/:id/confirm', () => {
  it('ASSIGNED -> CONFIRMED by the assigned field user, audited', async () => {
    const shift = await shiftAt(w, await publishedSchedule(w), { assignedUserId: w.field.user.id })
    const response = await act(shift.id, 'confirm', undefined, w.field.token)

    expect(response.statusCode).toBe(200)
    expect(body(response).data?.shift).toMatchObject({ status: 'CONFIRMED', assignedUser: { id: w.field.user.id } })
    expect((await shiftAudit(shift.id))[0]).toMatchObject({ action: 'confirmed', actorId: w.field.user.id })
  })

  it('confirming twice is INVALID_STATE with the allowed targets', async () => {
    const shift = await shiftAt(w, await publishedSchedule(w), { assignedUserId: w.field.user.id, status: 'CONFIRMED' })
    const response = await act(shift.id, 'confirm', undefined, w.field.token)

    expect(response.statusCode).toBe(409)
    expect(body(response).error).toMatchObject({ code: 'INVALID_STATE', details: { from: 'CONFIRMED', to: 'CONFIRMED', allowed: ['ASSIGNED', 'OPEN', 'CANCELLED'] } })
  })

  it.each(['IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED'] as const)('a %s shift cannot be confirmed', async status => {
    const shift = await shiftAt(w, await publishedSchedule(w), { assignedUserId: w.field.user.id, status })

    expect(body(await act(shift.id, 'confirm', undefined, w.field.token)).error?.code).toBe('INVALID_STATE')
  })

  it("somebody else's shift, an unpublished schedule and other people are all 404", async () => {
    const other = await addFieldUser(w)
    const shift = await shiftAt(w, await publishedSchedule(w), { assignedUserId: w.field.user.id })
    const hidden = await shiftAt(w, await draftSchedule(w, { periodStart: '2026-04-06', periodEnd: '2026-04-12' }), { assignedUserId: w.field.user.id })
    const outsider = await buildOutsider(t)

    expect((await act(shift.id, 'confirm', undefined, other.token)).statusCode).toBe(404)
    expect((await act(hidden.id, 'confirm', undefined, w.field.token)).statusCode).toBe(404)
    expect((await act(shift.id, 'confirm', undefined, (await signIn(t, 'FIELD_USER', { orgId: outsider.org.id })).token)).statusCode).toBe(404)
  })

  it('a locked schedule refuses with SCHEDULE_LOCKED', async () => {
    const shift = await shiftAt(w, await publishedSchedule(w, { status: 'LOCKED' }), { assignedUserId: w.field.user.id })

    expect(body(await act(shift.id, 'confirm', undefined, w.field.token)).error?.code).toBe('SCHEDULE_LOCKED')
  })

  it('is for field users only', async () => {
    const shift = await shiftAt(w, await publishedSchedule(w), { assignedUserId: w.field.user.id })

    expect((await w.api.post(`/v1/shifts/${shift.id}/confirm`)).statusCode).toBe(401)
    expect((await act(shift.id, 'confirm', undefined, w.admin.token)).statusCode).toBe(403)
    expect((await act(shift.id, 'confirm', undefined, w.supervisor.token)).statusCode).toBe(403)
    expect((await act(shift.id, 'confirm', undefined, w.clientUser.token)).statusCode).toBe(403)
    expect((await act('nope', 'confirm', undefined, w.field.token)).statusCode).toBe(400)
    expect((await act(shift.id, 'confirm', { x: 1 }, w.field.token)).statusCode).toBe(400)
  })
})
