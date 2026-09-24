import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { runJobNow, runDueJobs } from '../src/jobs/scheduler.js'
import type { JobDefinition } from '../src/jobs/scheduler.js'
import { backoffSeconds, enqueue, processOutbox } from '../src/jobs/outbox.js'
import { accessibleSiteIds, assertSiteAccess, canSeeBillRate, canSeePayRate, actorOf } from '../src/lib/access.js'
import type { Actor } from '../src/lib/access.js'
import { D, money, moneyField, round2, sum } from '../src/lib/money.js'
import { buildTermsSnapshot, parseTermsSnapshot, redactSnapshot } from '../src/lib/terms-snapshot.js'
import { addDays, dateOnlyField, daysBetween, eachDay, instantField, isoWeekday, startOfWeek, timeOfDayField, zonedInstant } from '../src/lib/time.js'
import { recordAudit } from '../src/modules/audit/record.js'
import { formatNumber, nextSequence } from '../src/modules/audit/sequence.js'
import { notify } from '../src/modules/notifications/notify.js'
import { assertFilesInOrg } from '../src/lib/file-refs.js'
import { createContractDraftRecord } from '../src/modules/contracts/draft-record.js'
import {
  body,
  client,
  createTestApp,
  createUser,
  ensureOrg,
  grantSiteAccess,
  makeClient,
  makeContract,
  makeFile,
  makeSchedule,
  makeShift,
  makeSite,
  resetDb,
  signIn
} from './helpers.js'
import type { TestApp } from './helpers.js'

let t: TestApp

beforeAll(async () => {
  t = await createTestApp()
})

afterAll(() => t.close())
beforeEach(async () => {
  await resetDb(t.prisma)
  t.mailer.clear()
})

describe('money', () => {
  it('rounds half up to cents, never through floating point', () => {
    expect(round2('1.005').toFixed(2)).toBe('1.01')
    expect(round2('2.675').toFixed(2)).toBe('2.68')
    expect(round2('0.1').plus('0.2').toFixed(2)).toBe('0.30')
    expect(sum([D('0.10'), D('0.20'), D('0.30')]).toFixed(2)).toBe('0.60')
  })

  it('serialises as a two-decimal string, null stays null', () => {
    expect(money(D(145))).toBe('145.00')
    expect(money(D('7.6667'))).toBe('7.67')
    expect(money(null)).toBeNull()
  })

  it('moneyField accepts strings and numbers with at most 2 decimals and rejects the rest', () => {
    expect(moneyField.parse('145.5').toFixed(2)).toBe('145.50')
    expect(moneyField.parse(22).toFixed(2)).toBe('22.00')
    for (const bad of ['-1', '1.234', 'abc', '', '12345678901', 1.234]) expect(moneyField.safeParse(bad).success).toBe(false)
  })
})

describe('time (DST-safe, site-local)', () => {
  it('converts wall-clock time in a zone to the right UTC instant', () => {
    expect(zonedInstant('2026-03-02', '18:00', 'America/Chicago').toISOString()).toBe('2026-03-03T00:00:00.000Z')
  })

  it('handles the spring-forward day: 18:00 on Mar 8 2026 in Chicago is UTC-5', () => {
    expect(zonedInstant('2026-03-08', '18:00', 'America/Chicago').toISOString()).toBe('2026-03-08T23:00:00.000Z')
  })

  it('a midnight-crossing shift over the DST change is 7 hours, not 8', () => {
    const start = zonedInstant('2026-03-07', '22:00', 'America/Chicago')
    const end = zonedInstant('2026-03-08', '06:00', 'America/Chicago')

    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(7)
  })

  it('calendar helpers', () => {
    expect(eachDay('2026-03-01', '2026-03-03')).toEqual(['2026-03-01', '2026-03-02', '2026-03-03'])
    expect(isoWeekday('2026-03-02')).toBe(1)
    expect(isoWeekday('2026-03-08')).toBe(7)
    expect(addDays('2026-02-28', 2)).toBe('2026-03-02')
    expect(daysBetween('2026-01-01', '2026-04-01')).toBe(90)
    expect(startOfWeek(new Date('2026-03-04T15:00:00Z'), 'America/Chicago').toISOString()).toBe('2026-03-02T06:00:00.000Z')
  })

  it('field validators', () => {
    expect(dateOnlyField.safeParse('2026-02-30').success).toBe(false)
    expect(dateOnlyField.safeParse('2026-03-02').success).toBe(true)
    expect(timeOfDayField.safeParse('24:00').success).toBe(false)
    expect(timeOfDayField.safeParse('18:00').success).toBe(true)
    expect(instantField.safeParse('2026-03-02T18:00:00').success).toBe(false)
    expect(instantField.parse('2026-03-02T18:00:00-06:00').toISOString()).toBe('2026-03-03T00:00:00.000Z')
  })
})

describe('terms snapshot', () => {
  it('freezes the contract terms for one site as strings and round-trips', async () => {
    const fixture = await makeContract(t, { lines: [{ billRate: '145.00', payRate: '22.50', qty: '2' }] })
    const snapshot = buildTermsSnapshot(fixture.contract, fixture.lines, fixture.coverage, fixture.site.id, 'America/Chicago')
    const parsed = parseTermsSnapshot(JSON.parse(JSON.stringify(snapshot)))

    expect(parsed.serviceItems[0]).toMatchObject({ billRate: '145.00', payRate: '22.50', qty: '2.00' })
    expect(parsed.contractVersion).toBe(1)
  })

  it('a later contract change cannot alter an existing snapshot', async () => {
    const fixture = await makeContract(t)
    const schedule = await makeSchedule(t, fixture)

    await t.prisma.contractLine.updateMany({ data: { billRate: D('999.00') } })

    const stored = parseTermsSnapshot((await t.prisma.schedule.findUniqueOrThrow({ where: { id: schedule.id } })).termsSnapshot)

    expect(stored.serviceItems[0]?.billRate).toBe('145.00')
  })

  it('redacts rates per viewer', async () => {
    const fixture = await makeContract(t)
    const snapshot = buildTermsSnapshot(fixture.contract, fixture.lines, fixture.coverage, fixture.site.id, 'UTC')
    const admin = redactSnapshot(snapshot, { canSeeBillRate: true, canSeePayRate: true }).serviceItems[0]
    const supervisor = redactSnapshot(snapshot, { canSeeBillRate: false, canSeePayRate: true }).serviceItems[0]
    const field = redactSnapshot(snapshot, { canSeeBillRate: false, canSeePayRate: false }).serviceItems[0]

    expect(admin).toHaveProperty('billRate')
    expect(admin).toHaveProperty('payRate')
    expect(supervisor).not.toHaveProperty('billRate')
    expect(supervisor).toHaveProperty('payRate')
    expect(field).not.toHaveProperty('billRate')
    expect(field).not.toHaveProperty('payRate')
  })
})

describe('sequences', () => {
  it('increments per organization and key, atomically under concurrency', async () => {
    const org = await ensureOrg(t)
    const other = await ensureOrg(t, 'Other Co')
    const values = await Promise.all(Array.from({ length: 25 }, () => nextSequence(t.prisma, org.id, 'invoice-2026')))

    expect([...values].sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1))
    expect(await nextSequence(t.prisma, other.id, 'invoice-2026')).toBe(1)
    expect(await nextSequence(t.prisma, org.id, 'contract')).toBe(1)
    expect(formatNumber('INV', 2026, 42)).toBe('INV-2026-000042')
    expect(formatNumber('C', null, 7)).toBe('C-000007')
  })
})

describe('outbox', () => {
  it('runs a due job once and marks it done', async () => {
    const handler = vi.fn(async () => undefined)

    await enqueue(t.prisma, { type: 'demo', payload: { a: 1 } })

    expect(await processOutbox(t.ctx, { demo: handler })).toBe(1)
    expect(await processOutbox(t.ctx, { demo: handler })).toBe(0)
    expect(handler).toHaveBeenCalledTimes(1)
    expect((await t.prisma.outboxJob.findFirstOrThrow()).status).toBe('DONE')
  })

  it('a failing job is retried later with backoff, then goes DEAD after max attempts', async () => {
    await enqueue(t.prisma, { type: 'demo', payload: {}, maxAttempts: 2 })
    const failing = async () => {
      throw new Error('accounting is down')
    }

    await processOutbox(t.ctx, { demo: failing })

    const first = await t.prisma.outboxJob.findFirstOrThrow()

    expect(first).toMatchObject({ status: 'PENDING', attempts: 1, lastError: 'accounting is down' })
    expect(first.runAt.getTime()).toBeGreaterThan(Date.now() + 20_000)

    // not due yet
    expect(await processOutbox(t.ctx, { demo: failing })).toBe(0)

    await t.prisma.outboxJob.update({ where: { id: first.id }, data: { runAt: new Date(Date.now() - 1000) } })
    await processOutbox(t.ctx, { demo: failing })

    expect(await t.prisma.outboxJob.findFirstOrThrow()).toMatchObject({ status: 'DEAD', attempts: 2 })
  })

  it('a job with no handler goes straight to DEAD instead of retrying forever', async () => {
    await enqueue(t.prisma, { type: 'mystery', payload: {} })
    await processOutbox(t.ctx, {})

    expect(await t.prisma.outboxJob.findFirstOrThrow()).toMatchObject({ status: 'DEAD' })
  })

  it('enqueueing the same dedupeKey twice creates one job', async () => {
    await enqueue(t.prisma, { type: 'demo', payload: {}, dedupeKey: 'invoice:1:sync' })
    await enqueue(t.prisma, { type: 'demo', payload: {}, dedupeKey: 'invoice:1:sync' })

    expect(await t.prisma.outboxJob.count()).toBe(1)
  })

  it('two workers never run the same job', async () => {
    const handler = vi.fn(async () => new Promise<void>(resolve => setTimeout(resolve, 50)))

    for (let i = 0; i < 6; i++) await enqueue(t.prisma, { type: 'demo', payload: { i } })

    await Promise.all([processOutbox(t.ctx, { demo: handler }, 6), processOutbox(t.ctx, { demo: handler }, 6)])

    expect(handler).toHaveBeenCalledTimes(6)
  })

  it('backoff grows and is capped', () => {
    expect([1, 2, 3, 4].map(backoffSeconds)).toEqual([30, 60, 120, 240])
    expect(backoffSeconds(50)).toBe(3600)
  })

  it('enqueue inside a transaction rolls back with it', async () => {
    await expect(
      t.prisma.$transaction(async tx => {
        await enqueue(tx, { type: 'demo', payload: {} })
        throw new Error('business logic failed')
      })
    ).rejects.toThrow()

    expect(await t.prisma.outboxJob.count()).toBe(0)
  })
})

describe('scheduler', () => {
  const job = (run: () => Promise<void>): JobDefinition => ({ name: 'demo.job', everySeconds: 3600, run })

  it('runs a due job once per interval', async () => {
    const run = vi.fn(async () => undefined)
    const demo = job(run)

    expect(await runDueJobs(t.ctx, [demo])).toEqual(['demo.job'])
    expect(await runDueJobs(t.ctx, [demo])).toEqual([])
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('two instances ticking at once run it exactly once', async () => {
    const run = vi.fn(async () => undefined)
    const demo = job(run)

    await Promise.all([runDueJobs(t.ctx, [demo]), runDueJobs(t.ctx, [demo]), runDueJobs(t.ctx, [demo])])

    expect(run).toHaveBeenCalledTimes(1)
  })

  it('a throwing job is recorded, not propagated', async () => {
    await runJobNow(t.ctx, job(async () => Promise.reject(new Error('boom'))))

    expect((await t.prisma.jobLease.findUniqueOrThrow({ where: { name: 'demo.job' } })).lastError).toContain('boom')
  })
})

describe('notify', () => {
  it('notifies active users of the organization only, and dedupes ids', async () => {
    const org = await ensureOrg(t)
    const other = await ensureOrg(t, 'Other Co')
    const active = await createUser(t, { orgId: org.id })
    const disabled = await createUser(t, { orgId: org.id, status: 'DISABLED' })
    const stranger = await createUser(t, { orgId: other.id })

    const count = await notify(t.ctx, {
      orgId: org.id,
      userIds: [active.id, active.id, disabled.id, stranger.id, 'not-a-real-id'],
      type: 'shift.assigned',
      title: 'Assigned',
      body: 'You have a shift'
    })

    expect(count).toBe(1)
    expect(await t.prisma.notification.count()).toBe(1)
    expect((await t.prisma.notification.findFirstOrThrow()).userId).toBe(active.id)
  })

  it('emails in the background when asked, and escapes content', async () => {
    const user = await createUser(t, { name: '<b>Bob</b>' })

    await notify(t.ctx, { orgId: user.orgId, userIds: [user.id], type: 'lead.new', title: 'New lead', body: 'Call <script>x</script>', email: true })
    await t.ctx.background.flush()

    expect(t.mailer.sent).toHaveLength(1)
    expect(t.mailer.sent[0]?.html).not.toContain('<script>')
  })
})

describe('recordAudit', () => {
  it('writes entity/action/diff, and rolls back with the transaction', async () => {
    const org = await ensureOrg(t)
    const actor = { id: 'u1', orgId: org.id }

    await recordAudit(t.prisma, actor, { entity: 'shift', entityId: 's1', action: 'assign_override', diff: { warnings: ['OVERTIME'] } })
    await expect(
      t.prisma.$transaction(async tx => {
        await recordAudit(tx, actor, { entity: 'shift', entityId: 's2', action: 'assigned' })
        throw new Error('nope')
      })
    ).rejects.toThrow()

    const rows = await t.prisma.auditEvent.findMany()

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ orgId: org.id, actorId: 'u1', type: 'shift.assign_override', entity: 'shift', entityId: 's1', action: 'assign_override' })
  })
})

describe('file references', () => {
  it('accepts files of the organization and rejects foreign or missing ones', async () => {
    const org = await ensureOrg(t)
    const other = await ensureOrg(t, 'Other Co')
    const mine = await makeFile(t, { orgId: org.id })
    const theirs = await makeFile(t, { orgId: other.id })

    await expect(assertFilesInOrg(t.prisma, org.id, [mine.id])).resolves.toBeUndefined()
    await expect(assertFilesInOrg(t.prisma, org.id, [mine.id, theirs.id])).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    await expect(assertFilesInOrg(t.prisma, org.id, ['00000000-0000-4000-8000-000000000000'])).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })
})

describe('access scope', () => {
  const actorFor = (user: { id: string; orgId: string; role: Actor['role']; clientId: string | null }): Actor => actorOf({ user, session: {} } as never)

  it('admin: all; supervisor/field: only granted sites; client user: their client sites', async () => {
    const org = await ensureOrg(t)
    const clientA = await makeClient(t, { orgId: org.id })
    const clientB = await makeClient(t, { orgId: org.id })
    const siteA = await makeSite(t, { orgId: org.id, clientId: clientA.id })
    const siteB = await makeSite(t, { orgId: org.id, clientId: clientB.id })
    const admin = await createUser(t, { role: 'ADMIN' })
    const supervisor = await createUser(t, { role: 'SUPERVISOR' })
    const clientUser = await createUser(t, { role: 'CLIENT_USER', clientId: clientA.id })

    await grantSiteAccess(t, supervisor.id, siteA.id)

    expect(await accessibleSiteIds(t.ctx, actorFor(admin))).toBe('all')
    expect(await accessibleSiteIds(t.ctx, actorFor(supervisor))).toEqual([siteA.id])
    expect(await accessibleSiteIds(t.ctx, actorFor(clientUser))).toEqual([siteA.id])
    await expect(assertSiteAccess(t.ctx, actorFor(supervisor), siteB.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(assertSiteAccess(t.ctx, actorFor(admin), siteB.id)).resolves.toBeUndefined()
  })

  it('a site of another organization is not accessible even to an admin', async () => {
    const other = await ensureOrg(t, 'Other Co')
    const foreignSite = await makeSite(t, { orgId: other.id })
    const admin = await createUser(t, { role: 'ADMIN' })

    await expect(assertSiteAccess(t.ctx, actorFor(admin), foreignSite.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rate visibility rules', () => {
    expect([canSeeBillRate({ role: 'ADMIN' }), canSeeBillRate({ role: 'SUPERVISOR' }), canSeeBillRate({ role: 'FIELD_USER' }), canSeeBillRate({ role: 'CLIENT_USER' })]).toEqual([true, false, false, false])
    expect([canSeePayRate({ role: 'ADMIN' }), canSeePayRate({ role: 'SUPERVISOR' }), canSeePayRate({ role: 'FIELD_USER' }), canSeePayRate({ role: 'CLIENT_USER' })]).toEqual([true, true, false, false])
  })
})

describe('contract draft record (used by lead conversion)', () => {
  it('creates a numbered DRAFT v1 with lines and coverage, enforcing tenancy', async () => {
    const org = await ensureOrg(t)
    const admin = await createUser(t, { role: 'ADMIN' })
    const cl = await makeClient(t, { orgId: org.id })
    const site = await makeSite(t, { orgId: org.id, clientId: cl.id })
    const contract = await createContractDraftRecord(t.ctx, t.prisma, { id: admin.id, orgId: org.id }, {
      clientId: cl.id,
      startDate: '2026-04-01',
      billingType: 'PER_VISIT',
      billingCycle: 'MONTHLY',
      lines: [{ siteId: site.id, description: 'Filter change', qty: D(3), billRate: D(0) }],
      coverage: [{ siteId: site.id, patternType: 'INTERVAL', intervalDays: 90 }]
    })

    expect(contract).toMatchObject({ status: 'DRAFT', version: 1, contractNumber: 'C-000001' })
    expect(contract.lines).toHaveLength(1)

    const foreign = await makeSite(t, { orgId: (await ensureOrg(t, 'Other Co')).id })

    await expect(
      createContractDraftRecord(t.ctx, t.prisma, { id: admin.id, orgId: org.id }, { clientId: cl.id, startDate: '2026-04-01', billingType: 'PER_VISIT', billingCycle: 'MONTHLY', lines: [{ siteId: foreign.id, description: 'x', qty: D(1), billRate: D(0) }] })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    await expect(
      createContractDraftRecord(t.ctx, t.prisma, { id: admin.id, orgId: (await ensureOrg(t, 'Other Co')).id }, { clientId: cl.id, startDate: '2026-04-01', billingType: 'PER_VISIT', billingCycle: 'MONTHLY', lines: [] })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('factories produce coherent fixtures', () => {
  it('schedule + shift + timesheet defaults line up', async () => {
    const fixture = await makeContract(t)
    const schedule = await makeSchedule(t, fixture)
    const worker = await createUser(t)
    const shift = await makeShift(t, schedule, { assignedUserId: worker.id })

    expect(shift.status).toBe('ASSIGNED')
    expect((shift.scheduledEnd.getTime() - shift.scheduledStart.getTime()) / 3_600_000).toBe(8)
  })
})

describe('organizations and roles in the user admin API', () => {
  it('an admin of one organization can neither see nor edit users of another', async () => {
    const other = await ensureOrg(t, 'Other Co')
    const foreign = await createUser(t, { orgId: other.id })
    const { token } = await signIn(t, 'ADMIN')
    const api = client(t.app)

    expect(body(await api.get('/v1/admin/users', { token })).meta?.total).toBe(1)
    expect((await api.get(`/v1/admin/users/${foreign.id}`, { token })).statusCode).toBe(404)
    expect((await api.patch(`/v1/admin/users/${foreign.id}`, { token, body: { name: 'Hacked' } })).statusCode).toBe(404)
    expect((await api.post(`/v1/admin/users/${foreign.id}/revoke-sessions`, { token })).statusCode).toBe(404)
  })

  it('cannot invite an email that belongs to another organization', async () => {
    const other = await ensureOrg(t, 'Other Co')
    const foreign = await createUser(t, { orgId: other.id, password: null })
    const { token } = await signIn(t, 'ADMIN')

    const response = await client(t.app).post('/v1/admin/users/invite', { token, body: { email: foreign.email, name: 'X' } })

    expect(response.statusCode).toBe(409)
    expect(body(response).error?.code).toBe('EMAIL_TAKEN')
  })

  it('CLIENT_USER needs a client of the same organization; other roles must not have one', async () => {
    const org = await ensureOrg(t)
    const own = await makeClient(t, { orgId: org.id })
    const foreign = await makeClient(t, { orgId: (await ensureOrg(t, 'Other Co')).id })
    const { token } = await signIn(t, 'ADMIN')
    const api = client(t.app)
    const invite = (payload: Record<string, unknown>) => api.post('/v1/admin/users/invite', { token, body: { name: 'N', ...payload } })

    expect((await invite({ email: 'a@x.test', role: 'CLIENT_USER' })).statusCode).toBe(400)
    expect((await invite({ email: 'b@x.test', role: 'CLIENT_USER', clientId: foreign.id })).statusCode).toBe(400)
    expect((await invite({ email: 'c@x.test', role: 'FIELD_USER', clientId: own.id })).statusCode).toBe(400)

    const ok = await invite({ email: 'd@x.test', role: 'CLIENT_USER', clientId: own.id })

    expect(ok.statusCode).toBe(201)
    expect(body(ok).data?.user).toMatchObject({ role: 'CLIENT_USER', clientId: own.id })
  })

  it('supports all four roles and the new profile fields on invite', async () => {
    const { token } = await signIn(t, 'ADMIN')
    const response = await client(t.app).post('/v1/admin/users/invite', {
      token,
      body: { email: 'sup@x.test', name: 'Sue', role: 'SUPERVISOR', phone: '555-0100', employmentType: 'CONTRACTOR', defaultPayRate: '31.50', hiredAt: '2026-01-15' }
    })

    expect(body(response).data?.user).toMatchObject({ role: 'SUPERVISOR', phone: '555-0100', employmentType: 'CONTRACTOR', defaultPayRate: '31.50', hiredAt: '2026-01-15' })
  })

  it('defaultPayRate is visible to admin and supervisor viewers only', async () => {
    const worker = await createUser(t, { defaultPayRate: '22.00' })
    const admin = await signIn(t, 'ADMIN')
    const api = client(t.app)

    expect(body(await api.get(`/v1/admin/users/${worker.id}`, { token: admin.token })).data?.user.defaultPayRate).toBe('22.00')

    // the worker viewing themselves never sees pay data
    const self = await signIn(t, 'FIELD_USER', { defaultPayRate: '22.00' })

    expect(body(await api.get('/v1/auth/me', { token: self.token })).data?.user).not.toHaveProperty('defaultPayRate')
  })

  it('changing a role away from CLIENT_USER clears the client link; changing to it requires one', async () => {
    const org = await ensureOrg(t)
    const cl = await makeClient(t, { orgId: org.id })
    const clientUser = await createUser(t, { role: 'CLIENT_USER', clientId: cl.id })
    const staff = await createUser(t, { role: 'FIELD_USER' })
    const { token } = await signIn(t, 'ADMIN')
    const api = client(t.app)

    const promoted = await api.patch(`/v1/admin/users/${clientUser.id}`, { token, body: { role: 'SUPERVISOR' } })

    expect(body(promoted).data?.user).toMatchObject({ role: 'SUPERVISOR', clientId: null })
    expect((await api.patch(`/v1/admin/users/${staff.id}`, { token, body: { role: 'CLIENT_USER' } })).statusCode).toBe(400)
    expect(body(await api.patch(`/v1/admin/users/${staff.id}`, { token, body: { role: 'CLIENT_USER', clientId: cl.id } })).data?.user).toMatchObject({ role: 'CLIENT_USER', clientId: cl.id })
  })
})
