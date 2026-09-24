import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { toDateOnly } from '../src/lib/time.js'
import { body, createTestApp, createUser, resetDb, signIn } from './helpers.js'
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

/** Mon 2026-03-02 18:00-02:00 in Chicago (UTC-6 until 2026-03-08). */
const MONDAY_NIGHT = { start: '2026-03-03T00:00:00.000Z', end: '2026-03-03T08:00:00.000Z' }

const validate = (shiftId: string, userId: string, token = w.admin.token) => w.api.post(`/v1/shifts/${shiftId}/validate-assignment`, { token, body: { userId } })
const assign = (shiftId: string, payload: Record<string, unknown>, token = w.admin.token) => w.api.post(`/v1/shifts/${shiftId}/assign`, { token, body: payload })
const codes = (list: Array<{ code: string }>) => list.map(item => item.code)

const openShift = async (input: Parameters<typeof shiftAt>[2] = {}) => shiftAt(w, await publishedSchedule(w), input)

describe('POST /v1/shifts/:id/validate-assignment', () => {
  it('reports nothing for a person with site access and no other constraints', async () => {
    const shift = await openShift()
    const response = await validate(shift.id, w.field.user.id)

    expect(response.statusCode).toBe(200)
    expect(body(response).data).toEqual({ blocking: [], warnings: [] })
  })

  it('is a dry run: nothing is saved', async () => {
    const shift = await openShift()

    await validate(shift.id, w.field.user.id)

    expect(await t.prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })).toMatchObject({ status: 'OPEN', assignedUserId: null })
    expect(await t.prisma.auditEvent.count({ where: { entity: 'shift' } })).toBe(0)
  })

  it('enforces roles, scope, tenancy and input rules', async () => {
    const shift = await openShift()
    const outsider = await buildOutsider(t)
    const strangerSupervisor = await signIn(t, 'SUPERVISOR')
    const path = `/v1/shifts/${shift.id}/validate-assignment`

    expect((await w.api.post(path, { body: { userId: w.field.user.id } })).statusCode).toBe(401)
    expect((await validate(shift.id, w.field.user.id, w.field.token)).statusCode).toBe(403)
    expect((await validate(shift.id, w.field.user.id, w.clientUser.token)).statusCode).toBe(403)
    expect((await validate(shift.id, w.field.user.id, outsider.admin.token)).statusCode).toBe(404)
    expect((await validate(shift.id, w.field.user.id, strangerSupervisor.token)).statusCode).toBe(404)
    expect((await validate(shift.id, w.field.user.id, w.supervisor.token)).statusCode).toBe(200)
    expect((await validate('nope', w.field.user.id)).statusCode).toBe(400)
    expect((await w.api.post(path, { token: w.admin.token, body: { userId: 'nope' } })).statusCode).toBe(400)
    expect((await w.api.post(path, { token: w.admin.token, body: { userId: w.field.user.id, extra: 1 } })).statusCode).toBe(400)
    expect((await w.api.post(path, { token: w.admin.token, body: {} })).statusCode).toBe(400)
  })

  describe('blocking rules', () => {
    it('an overlapping non-cancelled shift blocks, naming it, on any schedule', async () => {
      const other = await draftSchedule(w, { periodStart: '2026-04-01', periodEnd: '2026-04-07' })
      const clash = await shiftAt(w, other, { assignedUserId: w.field.user.id, start: '2026-03-03T06:00:00.000Z', end: '2026-03-03T10:00:00.000Z' })
      const shift = await openShift(MONDAY_NIGHT)
      const data = body(await validate(shift.id, w.field.user.id)).data

      expect(codes(data?.blocking)).toEqual(['SHIFT_OVERLAP'])
      expect(data?.blocking[0]).toMatchObject({ data: { shiftId: clash.id, scheduledStart: '2026-03-03T06:00:00.000Z' } })
    })

    it('back-to-back shifts do not overlap; a cancelled shift does not block; other people do not block', async () => {
      const schedule = await publishedSchedule(w)

      await shiftAt(w, schedule, { assignedUserId: w.field.user.id, start: '2026-03-02T16:00:00.000Z', end: '2026-03-03T00:00:00.000Z' })
      await shiftAt(w, schedule, { assignedUserId: w.field.user.id, status: 'CANCELLED', start: '2026-03-03T02:00:00.000Z', end: '2026-03-03T04:00:00.000Z' })

      const someoneElse = await addFieldUser(w)

      await shiftAt(w, schedule, { assignedUserId: someoneElse.user.id, start: '2026-03-03T00:00:00.000Z', end: '2026-03-03T08:00:00.000Z' })

      const shift = await shiftAt(w, schedule, MONDAY_NIGHT)

      expect(body(await validate(shift.id, w.field.user.id)).data?.blocking).toEqual([])
    })

    it('a shift in progress or completed still counts as time spent', async () => {
      const schedule = await publishedSchedule(w)

      await shiftAt(w, schedule, { assignedUserId: w.field.user.id, status: 'COMPLETED', start: '2026-03-03T00:00:00.000Z', end: '2026-03-03T04:00:00.000Z' })

      const shift = await shiftAt(w, schedule, { start: '2026-03-03T03:00:00.000Z', end: '2026-03-03T09:00:00.000Z' })

      expect(codes(body(await validate(shift.id, w.field.user.id)).data?.blocking)).toEqual(['SHIFT_OVERLAP'])
    })

    it.each([
      ['a disabled user', { status: 'DISABLED' as const }],
      ['an invited user', { status: 'INVITED' as const, password: null }],
      ['an admin', { role: 'ADMIN' as const }],
      ['a client user', { role: 'CLIENT_USER' as const }]
    ])('%s is not eligible', async (_label, input) => {
      const shift = await openShift()
      const user = await createUser(t, input)

      expect(codes(body(await validate(shift.id, user.id)).data?.blocking)).toEqual(['USER_NOT_ELIGIBLE'])
    })

    it('a user of another organization, or a random id, is not eligible (and nothing else is revealed)', async () => {
      const shift = await openShift()
      const outsider = await buildOutsider(t)

      for (const userId of [outsider.admin.user.id, '00000000-0000-4000-8000-000000000000']) {
        const data = body(await validate(shift.id, userId)).data

        expect(codes(data?.blocking)).toEqual(['USER_NOT_ELIGIBLE'])
        expect(data?.warnings).toEqual([])
      }
    })

    it('a supervisor can be assigned like anyone else', async () => {
      const shift = await openShift()

      expect(body(await validate(shift.id, w.supervisor.user.id)).data?.blocking).toEqual([])
    })

    it.each([
      ['LOCKED', 'SCHEDULE_LOCKED'],
      ['CLOSED', 'SCHEDULE_LOCKED']
    ] as const)('a %s schedule blocks with %s', async (status, code) => {
      const shift = await shiftAt(w, await publishedSchedule(w, { status }))

      expect(codes(body(await validate(shift.id, w.field.user.id)).data?.blocking)).toEqual([code])
    })

    it.each(['IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED'] as const)('a %s shift cannot be assigned', async status => {
      const shift = await openShift({ status })
      const data = body(await validate(shift.id, w.field.user.id)).data

      expect(codes(data?.blocking)).toEqual(['INVALID_STATE'])
      expect(data?.blocking[0].data).toMatchObject({ from: status, to: 'ASSIGNED' })
    })
  })

  describe('warnings', () => {
    it('NO_SITE_ACCESS when the person has no access row for the site', async () => {
      const shift = await openShift()
      const stranger = await addFieldUser(w, { siteAccess: false })
      const data = body(await validate(shift.id, stranger.user.id)).data

      expect(data?.blocking).toEqual([])
      expect(codes(data?.warnings)).toEqual(['NO_SITE_ACCESS'])
    })

    describe('OUTSIDE_AVAILABILITY (windows are org-timezone wall clock)', () => {
      const windows = (rows: Array<[number, string, string]>) =>
        t.prisma.userAvailability.createMany({ data: rows.map(([weekday, startTime, endTime]) => ({ userId: w.field.user.id, weekday, startTime, endTime })) })
      const warned = async (shiftId: string) => codes(body(await validate(shiftId, w.field.user.id)).data?.warnings).includes('OUTSIDE_AVAILABILITY')

      it('a person with no windows at all is never flagged', async () => {
        expect(await warned((await openShift(MONDAY_NIGHT)).id)).toBe(false)
      })

      it('flags a shift on a weekday with no window, or outside the window', async () => {
        await windows([[2, '09:00', '17:00']])

        expect(await warned((await openShift(MONDAY_NIGHT)).id)).toBe(true)
      })

      it('accepts a shift exactly filling a window and flags one minute over', async () => {
        const schedule = await publishedSchedule(w)
        const fits = await shiftAt(w, schedule, { start: '2026-03-02T16:00:00.000Z', end: '2026-03-02T20:00:00.000Z' }) // Mon 10:00-14:00 local

        await windows([[1, '10:00', '14:00']])

        expect(await warned(fits.id)).toBe(false)

        const over = await shiftAt(w, schedule, { start: '2026-03-04T16:00:00.000Z', end: '2026-03-04T20:01:00.000Z' })

        await windows([[3, '10:00', '14:00']])

        expect(await warned(over.id)).toBe(true)
      })

      it('a shift past midnight needs a window on both days (23:59 counts as end of day)', async () => {
        const shift = await openShift(MONDAY_NIGHT)

        await windows([[1, '18:00', '23:59']])

        expect(await warned(shift.id)).toBe(true)

        await windows([[2, '00:00', '02:00']])

        expect(await warned(shift.id)).toBe(false)
      })

      it('interprets the windows in the organization zone, not the site zone', async () => {
        await t.prisma.organization.update({ where: { id: w.fixture.contract.orgId }, data: { timezone: 'America/New_York' } })

        const shift = await openShift({ start: '2026-03-02T16:00:00.000Z', end: '2026-03-02T20:00:00.000Z' }) // 10:00-14:00 Chicago = 11:00-15:00 New York

        await windows([[1, '10:00', '14:00']])

        expect(await warned(shift.id)).toBe(true)

        await t.prisma.userAvailability.deleteMany()
        await windows([[1, '11:00', '15:00']])

        expect(await warned(shift.id)).toBe(false)
      })
    })

    describe('documents', () => {
      const document = (expiresAt: string, type = 'license') =>
        t.prisma.userDocument.create({ data: { orgId: w.fixture.contract.orgId, userId: w.field.user.id, type, expiresAt: toDateOnly(expiresAt) } })

      // the shift's local date (site zone) is 2026-03-02
      it.each([
        ['2026-03-01', 'DOCUMENT_EXPIRED'],
        ['2026-03-02', 'DOCUMENT_EXPIRING'],
        ['2026-03-16', 'DOCUMENT_EXPIRING'],
        ['2026-03-17', null]
      ] as const)('a document expiring %s gives %s', async (expiresAt, expected) => {
        const shift = await openShift(MONDAY_NIGHT)

        await document(expiresAt)

        const warnings = body(await validate(shift.id, w.field.user.id)).data?.warnings

        expect(codes(warnings)).toEqual(expected ? [expected] : [])

        if (expected) expect(warnings[0].data).toEqual({ type: 'license', expiresAt })
      })

      it('uses the SITE local date: a late-evening shift belongs to its local day, not the UTC day', async () => {
        // 2026-03-03T00:00Z is still Mar 2 in Chicago: a document expiring Mar 2 is valid on that day
        const shift = await openShift(MONDAY_NIGHT)

        await document('2026-03-02')

        expect(codes(body(await validate(shift.id, w.field.user.id)).data?.warnings)).toEqual(['DOCUMENT_EXPIRING'])
      })

      it('reports every relevant document, ignores documents without an expiry, and other people', async () => {
        const shift = await openShift(MONDAY_NIGHT)

        await document('2026-01-01', 'insurance')
        await document('2026-03-10', 'training')
        await t.prisma.userDocument.create({ data: { orgId: w.fixture.contract.orgId, userId: w.field.user.id, type: 'notes' } })

        const other = await addFieldUser(w)

        await t.prisma.userDocument.create({ data: { orgId: w.fixture.contract.orgId, userId: other.user.id, type: 'license', expiresAt: toDateOnly('2025-01-01') } })

        const warnings = body(await validate(shift.id, w.field.user.id)).data?.warnings

        expect(warnings.map((warning: { code: string; data: { type: string } }) => `${warning.code}:${warning.data.type}`)).toEqual(['DOCUMENT_EXPIRED:insurance', 'DOCUMENT_EXPIRING:training'])
      })
    })

    describe('OVERTIME (Monday-start week in the site zone, threshold 2400 minutes)', () => {
      let schedule: Awaited<ReturnType<typeof publishedSchedule>>
      const shiftAtSchedule = (start: string, end: string, status: 'ASSIGNED' | 'CANCELLED' = 'ASSIGNED') => shiftAt(w, schedule, { assignedUserId: w.field.user.id, start, end, status })

      beforeEach(async () => {
        schedule = await publishedSchedule(w)
      })

      const buildWeek = async (fridayMinutes: number) => {
        // Tue/Wed/Thu 08:00-18:00 local (600 min each) + a Friday block, all in the week of Mon 2026-03-02
        await shiftAtSchedule('2026-03-03T14:00:00.000Z', '2026-03-04T00:00:00.000Z')
        await shiftAtSchedule('2026-03-04T14:00:00.000Z', '2026-03-05T00:00:00.000Z')
        await shiftAtSchedule('2026-03-05T14:00:00.000Z', '2026-03-06T00:00:00.000Z')
        await shiftAtSchedule('2026-03-06T14:00:00.000Z', new Date(Date.parse('2026-03-06T14:00:00.000Z') + fridayMinutes * 60_000).toISOString())
      }

      it('exactly at the threshold is fine; one minute over warns, with the numbers', async () => {
        await buildWeek(120) // 1800 + 120 + this 480 = 2400

        const shift = await shiftAt(w, schedule, MONDAY_NIGHT)

        expect(codes(body(await validate(shift.id, w.field.user.id)).data?.warnings)).toEqual([])

        await t.prisma.shift.deleteMany({ where: { assignedUserId: w.field.user.id } })
        await buildWeek(121)

        const warnings = body(await validate(shift.id, w.field.user.id)).data?.warnings

        expect(codes(warnings)).toEqual(['OVERTIME'])
        expect(warnings[0].data).toEqual({ weeklyMinutes: 2401, thresholdMinutes: 2400 })
      })

      it('ignores cancelled shifts and shifts in neighbouring weeks (including across the DST change)', async () => {
        await buildWeek(0) // 1800 in the week
        await shiftAtSchedule('2026-03-07T00:00:00.000Z', '2026-03-07T06:00:00.000Z', 'CANCELLED') // Fri evening, cancelled
        await shiftAtSchedule('2026-03-08T03:00:00.000Z', '2026-03-08T04:00:00.000Z') // Sat 21:00 local: counted (60)
        await shiftAtSchedule('2026-03-09T05:30:00.000Z', '2026-03-09T20:00:00.000Z') // Mon Mar 9 00:30 CDT: next week
        await shiftAtSchedule('2026-03-02T04:00:00.000Z', '2026-03-02T15:00:00.000Z') // Sun Mar 1 22:00 CST: previous week

        const shift = await shiftAt(w, schedule, MONDAY_NIGHT) // 1800 + 60 + 480 = 2340

        expect(codes(body(await validate(shift.id, w.field.user.id)).data?.warnings)).toEqual([])
      })

      it('other people\'s shifts do not count', async () => {
        const colleague = await addFieldUser(w)

        await shiftAt(w, schedule, { assignedUserId: colleague.user.id, start: '2026-03-04T00:00:00.000Z', end: '2026-03-05T00:00:00.000Z' })
        await shiftAt(w, schedule, { assignedUserId: colleague.user.id, start: '2026-03-05T00:00:00.000Z', end: '2026-03-06T00:00:00.000Z' })

        const shift = await shiftAt(w, schedule, MONDAY_NIGHT)

        expect(codes(body(await validate(shift.id, w.field.user.id)).data?.warnings)).toEqual([])
      })

    })
  })
})

describe('POST /v1/shifts/:id/assign', () => {
  it('assigns an OPEN shift: ASSIGNED, the person shown, a normal audit row, nothing emailed on a DRAFT schedule', async () => {
    const shift = await shiftAt(w, await draftSchedule(w))
    const response = await assign(shift.id, { userId: w.field.user.id })

    expect(response.statusCode).toBe(200)
    expect(body(response).data?.shift).toMatchObject({ id: shift.id, status: 'ASSIGNED', assignedUser: { id: w.field.user.id, name: w.field.user.name } })
    expect(await t.prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })).toMatchObject({ status: 'ASSIGNED', assignedUserId: w.field.user.id })

    const audit = await t.prisma.auditEvent.findMany({ where: { entity: 'shift', entityId: shift.id } })

    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ action: 'assigned', actorId: w.admin.user.id, type: 'shift.assigned', orgId: w.fixture.contract.orgId })
    expect(audit[0]?.diff).toEqual({ userId: w.field.user.id, previousUserId: null })
    expect(await t.prisma.notification.count()).toBe(0)
  })

  it('after publish the assignee gets an in-app notification and an email', async () => {
    const shift = await openShift()

    await assign(shift.id, { userId: w.field.user.id })
    await t.ctx.background.flush()

    const notice = await t.prisma.notification.findFirstOrThrow({ where: { userId: w.field.user.id, type: 'shift.assigned' } })

    expect(notice.body).toContain('Mon, Mar 2, 6:00')
    expect(notice.data).toMatchObject({ shiftId: shift.id })
    expect(t.mailer.sent.map(mail => mail.to)).toEqual([w.field.user.email])
  })

  it('a supervisor of the site may assign', async () => {
    const shift = await openShift()

    expect((await assign(shift.id, { userId: w.field.user.id }, w.supervisor.token)).statusCode).toBe(200)
  })

  describe('warnings are not walls', () => {
    const withWarning = async () => {
      const shift = await openShift()
      const stranger = await addFieldUser(w, { siteAccess: false })

      return { shift, user: stranger.user }
    }

    it('refuses with 422 ASSIGNMENT_WARNINGS and saves nothing', async () => {
      const { shift, user } = await withWarning()
      const response = await assign(shift.id, { userId: user.id })

      expect(response.statusCode).toBe(422)
      expect(body(response).error?.code).toBe('ASSIGNMENT_WARNINGS')
      expect(codes(body(response).error?.details?.warnings)).toEqual(['NO_SITE_ACCESS'])
      expect(await t.prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })).toMatchObject({ status: 'OPEN', assignedUserId: null })
      expect(await t.prisma.auditEvent.count({ where: { entity: 'shift' } })).toBe(0)
      expect(await t.prisma.notification.count()).toBe(0)
    })

    it('an explicit overrideWarnings: false behaves like leaving it out', async () => {
      const { shift, user } = await withWarning()

      expect((await assign(shift.id, { userId: user.id, overrideWarnings: false })).statusCode).toBe(422)
    })

    it('saves with overrideWarnings and audits assign_override with the warnings, the reason and the person', async () => {
      const { shift, user } = await withWarning()
      const response = await assign(shift.id, { userId: user.id, overrideWarnings: true, reason: 'Covering a sick call' })

      expect(response.statusCode).toBe(200)
      expect(body(response).data?.shift).toMatchObject({ status: 'ASSIGNED', assignedUser: { id: user.id } })

      const audit = await t.prisma.auditEvent.findMany({ where: { entity: 'shift', entityId: shift.id } })

      expect(audit).toHaveLength(1)
      expect(audit[0]).toMatchObject({ action: 'assign_override', type: 'shift.assign_override', actorId: w.admin.user.id })
      expect(audit[0]?.diff).toEqual({
        warnings: [{ code: 'NO_SITE_ACCESS', message: 'This person has not been given access to this site.' }],
        reason: 'Covering a sick call',
        userId: user.id
      })
    })

    it('records a null reason when none was given', async () => {
      const { shift, user } = await withWarning()

      await assign(shift.id, { userId: user.id, overrideWarnings: true })

      expect((await t.prisma.auditEvent.findFirstOrThrow({ where: { entityId: shift.id } })).diff).toMatchObject({ reason: null })
    })

    it('overrideWarnings with nothing to override is an ordinary assignment', async () => {
      const shift = await openShift()

      await assign(shift.id, { userId: w.field.user.id, overrideWarnings: true, reason: 'not needed' })

      expect((await t.prisma.auditEvent.findFirstOrThrow({ where: { entityId: shift.id } })).action).toBe('assigned')
    })

    it('reports every warning at once', async () => {
      const shift = await openShift(MONDAY_NIGHT)
      const stranger = await addFieldUser(w, { siteAccess: false })

      await t.prisma.userAvailability.create({ data: { userId: stranger.user.id, weekday: 3, startTime: '09:00', endTime: '17:00' } })
      await t.prisma.userDocument.create({ data: { orgId: w.fixture.contract.orgId, userId: stranger.user.id, type: 'license', expiresAt: toDateOnly('2026-01-01') } })

      const response = await assign(shift.id, { userId: stranger.user.id })

      expect(codes(body(response).error?.details?.warnings)).toEqual(['NO_SITE_ACCESS', 'OUTSIDE_AVAILABILITY', 'DOCUMENT_EXPIRED'])
    })
  })

  describe('blocking rules are never overridable', () => {
    it('an overlap is 409 SHIFT_OVERLAP naming the other shift, even with overrideWarnings', async () => {
      const schedule = await publishedSchedule(w)
      const clash = await shiftAt(w, schedule, { assignedUserId: w.field.user.id, ...MONDAY_NIGHT })
      const shift = await shiftAt(w, schedule, { start: '2026-03-03T04:00:00.000Z', end: '2026-03-03T12:00:00.000Z' })
      const response = await assign(shift.id, { userId: w.field.user.id, overrideWarnings: true, reason: 'please' })

      expect(response.statusCode).toBe(409)
      expect(body(response).error).toMatchObject({ code: 'SHIFT_OVERLAP', details: { context: { shiftId: clash.id } } })
      expect((await t.prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })).assignedUserId).toBeNull()
    })

    it('an ineligible person is 422 UNPROCESSABLE', async () => {
      const shift = await openShift()
      const disabled = await createUser(t, { status: 'DISABLED' })
      const outsider = await buildOutsider(t)

      for (const userId of [disabled.id, outsider.admin.user.id, '00000000-0000-4000-8000-000000000000']) {
        const response = await assign(shift.id, { userId, overrideWarnings: true })

        expect(response.statusCode).toBe(422)
        expect(body(response).error?.code).toBe('UNPROCESSABLE')
      }
    })

    it('a locked schedule is 409 SCHEDULE_LOCKED', async () => {
      const shift = await shiftAt(w, await publishedSchedule(w, { status: 'LOCKED' }))
      const response = await assign(shift.id, { userId: w.field.user.id })

      expect(response.statusCode).toBe(409)
      expect(body(response).error?.code).toBe('SCHEDULE_LOCKED')
    })

    it.each(['IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED'] as const)('a %s shift is 409 INVALID_STATE', async status => {
      const shift = await openShift({ status })
      const response = await assign(shift.id, { userId: w.field.user.id })

      expect(response.statusCode).toBe(409)
      expect(body(response).error).toMatchObject({ code: 'INVALID_STATE', details: { entity: 'shift', from: status, to: 'ASSIGNED' } })
    })
  })

  describe('reassignment', () => {
    it('moves the shift to someone else, tells both people, and resets a confirmation', async () => {
      const second = await addFieldUser(w)
      const shift = await openShift({ assignedUserId: w.field.user.id, status: 'CONFIRMED' })
      const response = await assign(shift.id, { userId: second.user.id })

      expect(body(response).data?.shift).toMatchObject({ status: 'ASSIGNED', assignedUser: { id: second.user.id } })
      expect((await t.prisma.notification.findFirstOrThrow({ where: { userId: w.field.user.id } })).type).toBe('shift.unassigned')
      expect((await t.prisma.notification.findFirstOrThrow({ where: { userId: second.user.id } })).type).toBe('shift.assigned')
      expect((await t.prisma.auditEvent.findFirstOrThrow({ where: { entityId: shift.id } })).diff).toEqual({ userId: second.user.id, previousUserId: w.field.user.id })
    })

    it('assigning the person who already has it is a no-op', async () => {
      const shift = await openShift({ assignedUserId: w.field.user.id, status: 'CONFIRMED' })
      const response = await assign(shift.id, { userId: w.field.user.id })

      expect(body(response).data?.shift.status).toBe('CONFIRMED')
      expect(await t.prisma.auditEvent.count({ where: { entity: 'shift' } })).toBe(0)
      expect(await t.prisma.notification.count()).toBe(0)
    })

    it('withdraws pending offers on the shift', async () => {
      const shift = await openShift()

      await t.prisma.shiftOffer.create({ data: { shiftId: shift.id, userId: w.field.user.id } })
      await assign(shift.id, { userId: w.supervisor.user.id })

      expect((await t.prisma.shiftOffer.findFirstOrThrow({ where: { shiftId: shift.id } })).status).toBe('WITHDRAWN')
    })
  })

  it('enforces roles, scope, tenancy and input rules', async () => {
    const shift = await openShift()
    const outsider = await buildOutsider(t)
    const strangerSupervisor = await signIn(t, 'SUPERVISOR')
    const path = `/v1/shifts/${shift.id}/assign`

    expect((await w.api.post(path, { body: { userId: w.field.user.id } })).statusCode).toBe(401)
    expect((await assign(shift.id, { userId: w.field.user.id }, w.field.token)).statusCode).toBe(403)
    expect((await assign(shift.id, { userId: w.field.user.id }, w.clientUser.token)).statusCode).toBe(403)
    expect((await assign(shift.id, { userId: w.field.user.id }, outsider.admin.token)).statusCode).toBe(404)
    expect((await assign(shift.id, { userId: w.field.user.id }, strangerSupervisor.token)).statusCode).toBe(404)
    expect((await assign('nope', { userId: w.field.user.id })).statusCode).toBe(400)
    expect((await assign(shift.id, { userId: 'nope' })).statusCode).toBe(400)
    expect((await assign(shift.id, { userId: w.field.user.id, role: 'ADMIN' })).statusCode).toBe(400)
    expect((await assign(shift.id, { userId: w.field.user.id, overrideWarnings: 'yes' })).statusCode).toBe(400)
    expect((await assign(shift.id, { userId: w.field.user.id, reason: 'x'.repeat(501), overrideWarnings: true })).statusCode).toBe(400)
    expect(await t.prisma.auditEvent.count({ where: { entity: 'shift' } })).toBe(0)
  })
})

describe('assignment races', () => {
  it('two supervisors assigning one person to overlapping shifts at the same time: exactly one succeeds', async () => {
    for (let round = 0; round < 6; round += 1) {
      const schedule = await publishedSchedule(w, { periodStart: `2026-0${(round % 5) + 4}-01`, periodEnd: `2026-0${(round % 5) + 4}-07` })
      const day = 10 + round * 2
      const first = await shiftAt(w, schedule, { start: `2026-03-${day}T09:00:00.000Z`, end: `2026-03-${day}T17:00:00.000Z` })
      const second = await shiftAt(w, schedule, { start: `2026-03-${day}T13:00:00.000Z`, end: `2026-03-${day}T21:00:00.000Z` })
      const person = await addFieldUser(w)

      const responses = await Promise.all([assign(first.id, { userId: person.user.id }, w.admin.token), assign(second.id, { userId: person.user.id }, w.supervisor.token)])
      const statuses = responses.map(response => response.statusCode).sort()

      expect(statuses).toEqual([200, 409])
      expect(body(responses.find(response => response.statusCode === 409) as never).error?.code).toBe('SHIFT_OVERLAP')
      expect(await t.prisma.shift.count({ where: { assignedUserId: person.user.id } })).toBe(1)
    }
  })

  it('many concurrent assignments of one person to the same window still leave exactly one', async () => {
    const schedule = await publishedSchedule(w)
    const shifts = await Promise.all([0, 1, 2, 3].map(() => shiftAt(w, schedule, { start: '2026-03-12T09:00:00.000Z', end: '2026-03-12T17:00:00.000Z' })))
    const responses = await Promise.all(shifts.map(shift => assign(shift.id, { userId: w.field.user.id })))

    expect(responses.filter(response => response.statusCode === 200)).toHaveLength(1)
    expect(await t.prisma.shift.count({ where: { assignedUserId: w.field.user.id } })).toBe(1)
  })

  it('non-overlapping concurrent assignments all succeed', async () => {
    const schedule = await publishedSchedule(w)
    const shifts = await Promise.all([9, 10, 11].map(day => shiftAt(w, schedule, { start: at(day, 9), end: at(day, 17) })))
    const responses = await Promise.all(shifts.map(shift => assign(shift.id, { userId: w.field.user.id })))

    expect(responses.map(response => response.statusCode)).toEqual([200, 200, 200])
  })

  it('validate-assignment and assign agree on the blocking result', async () => {
    const schedule = await publishedSchedule(w)

    await shiftAt(w, schedule, { assignedUserId: w.field.user.id, start: '2026-03-12T09:00:00.000Z', end: '2026-03-12T17:00:00.000Z' })

    const shift = await shiftAt(w, schedule, { start: '2026-03-12T16:00:00.000Z', end: '2026-03-12T20:00:00.000Z' })
    const dryRun = body(await validate(shift.id, w.field.user.id)).data
    const real = await assign(shift.id, { userId: w.field.user.id })

    expect(codes(dryRun?.blocking)).toEqual([body(real).error?.code])
  })
})
