import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Shift } from '../src/generated/prisma/client.js'
import { createWorkLog } from '../src/modules/timesheets/worklogs.js'
import { body, client, createTestApp, ensureOrg, grantSiteAccess, makeFile, makeSite, resetDb, signIn } from './helpers.js'
import type { TestApp } from './helpers.js'
import { at, buildWorld, END, entryFor, otherOrgAdmin, outsideSupervisor, shiftFor, START } from './timesheets.setup.js'
import type { World } from './timesheets.setup.js'

let t: TestApp
let w: World
let shift: Shift
const api = () => client(t.app)

beforeAll(async () => {
  t = await createTestApp()
})
afterAll(() => t.close())
beforeEach(async () => {
  await resetDb(t.prisma)
  w = await buildWorld(t)
  shift = await shiftFor(t, w, { status: 'IN_PROGRESS' })
})

const url = () => `/v1/shifts/${shift.id}/work-logs`
const post = (token: string | undefined, payload: object, path = url()) => api().post(path, { token, body: payload })
const get = (token: string | undefined, path = url(), query?: Record<string, string>) => api().get(path, { token, query })

describe('POST /v1/shifts/:id/work-logs', () => {
  it('records a NOTE and audits it', async () => {
    const res = await post(w.worker.token, { kind: 'NOTE', body: 'Front door sticks' })

    expect(res.statusCode).toBe(201)
    expect(body(res).data?.workLog).toMatchObject({ kind: 'NOTE', body: 'Front door sticks', shiftId: shift.id, fileId: null, userId: w.worker.user.id, user: { name: w.worker.user.name } })

    const log = await t.prisma.workLog.findFirstOrThrow()
    const audit = await t.prisma.auditEvent.findFirstOrThrow({ where: { entity: 'work_log', action: 'created' } })

    expect(audit).toMatchObject({ entityId: log.id, actorId: w.worker.user.id })
    expect(audit.diff).toMatchObject({ shiftId: shift.id, kind: 'NOTE' })
  })

  it('records a PHOTO that points at a file of the organization (optional caption)', async () => {
    const file = await makeFile(t)
    const res = await post(w.worker.token, { kind: 'PHOTO', fileId: file.id, body: 'Before' })

    expect(res.statusCode).toBe(201)
    expect(body(res).data?.workLog).toMatchObject({ kind: 'PHOTO', fileId: file.id, body: 'Before' })
  })

  it('refuses a PHOTO whose file does not exist or belongs to another organization', async () => {
    const other = await ensureOrg(t, 'Other Co')
    const foreign = await makeFile(t, { orgId: other.id })

    for (const fileId of [foreign.id, '11111111-1111-4111-8111-111111111111']) {
      const res = await post(w.worker.token, { kind: 'PHOTO', fileId })

      expect(res.statusCode).toBe(400)
      expect(body(res).error?.details?.issues[0]).toMatchObject({ field: 'fileId', code: 'file_not_found' })
    }

    expect(await t.prisma.workLog.count()).toBe(0)
  })

  it('records a CHECKLIST with its items', async () => {
    const items = [
      { label: 'Vacuum', done: true },
      { label: 'Restock', done: false }
    ]
    const res = await post(w.worker.token, { kind: 'CHECKLIST', data: { items } })

    expect(body(res).data?.workLog).toMatchObject({ kind: 'CHECKLIST', body: null, data: { items } })
  })

  it('an ISSUE notifies the site supervisors and nobody else', async () => {
    const otherSupervisor = await signIn(t, 'SUPERVISOR')
    const elsewhere = await makeSite(t)
    const disabled = await signIn(t, 'SUPERVISOR', { status: 'DISABLED' })
    const peerWorker = await signIn(t, 'FIELD_USER')

    await grantSiteAccess(t, otherSupervisor.user.id, elsewhere.id)
    await grantSiteAccess(t, disabled.user.id, w.fixture.site.id)
    await grantSiteAccess(t, peerWorker.user.id, w.fixture.site.id)

    const res = await post(w.worker.token, { kind: 'ISSUE', body: 'Water leak in the storeroom' })

    expect(res.statusCode).toBe(201)

    const notes = await t.prisma.notification.findMany({ where: { type: 'work_log.issue' } })

    expect(notes.map(note => note.userId)).toEqual([w.supervisor.user.id])
    expect(notes[0]).toMatchObject({ orgId: w.supervisor.user.orgId })
    expect(notes[0]?.body).toContain('Water leak')
    expect(notes[0]?.data).toMatchObject({ shiftId: shift.id })
  })

  it('other kinds do not notify, and a supervisor raising an issue is not told about their own', async () => {
    await post(w.worker.token, { kind: 'NOTE', body: 'fine' })
    await post(w.supervisor.token, { kind: 'ISSUE', body: 'I saw damage' })

    expect(await t.prisma.notification.count()).toBe(0)
  })

  it('validates each kind strictly', async () => {
    const file = await makeFile(t)
    const bad = [
      { kind: 'PHOTO' },
      { kind: 'PHOTO', fileId: 'nope' },
      { kind: 'PHOTO', fileId: file.id, data: { items: [] } },
      { kind: 'NOTE' },
      { kind: 'NOTE', body: '   ' },
      { kind: 'NOTE', body: 'x'.repeat(4001) },
      { kind: 'NOTE', body: 'ok', fileId: file.id },
      { kind: 'ISSUE' },
      { kind: 'ISSUE', body: 'x'.repeat(4001) },
      { kind: 'CHECKLIST' },
      { kind: 'CHECKLIST', data: {} },
      { kind: 'CHECKLIST', data: { items: [] } },
      { kind: 'CHECKLIST', data: { items: [{ label: 'a' }] } },
      { kind: 'CHECKLIST', data: { items: [{ label: '', done: true }] } },
      { kind: 'CHECKLIST', data: { items: [{ label: 'a', done: 'yes' }] } },
      { kind: 'CHECKLIST', data: { items: [{ label: 'a', done: true, extra: 1 }] } },
      { kind: 'CHECKLIST', data: { items: [{ label: 'a', done: true }], extra: 1 } },
      { kind: 'CHECKLIST', body: 'x', data: { items: [{ label: 'a', done: true }] } },
      { kind: 'VIDEO', body: 'x' },
      { body: 'no kind' },
      { kind: 'NOTE', body: 'ok', userId: w.admin.user.id },
      { kind: 'NOTE', body: 'ok', at: START.toISOString() }
    ]

    for (const payload of bad) expect((await post(w.worker.token, payload)).statusCode, JSON.stringify(payload)).toBe(400)

    expect((await post(w.worker.token, { kind: 'NOTE', body: 'x'.repeat(4000) })).statusCode).toBe(201)
    expect(await t.prisma.workLog.count()).toBe(1)
  })

  it('needs sign-in and one of FIELD_USER, ADMIN, SUPERVISOR; clients cannot write', async () => {
    const payload = { kind: 'NOTE', body: 'hi' }

    expect((await post(undefined, payload)).statusCode).toBe(401)
    expect((await post(w.clientUser.token, payload)).statusCode).toBe(403)
    expect((await post(w.admin.token, payload)).statusCode).toBe(201)
    expect((await post(w.supervisor.token, payload)).statusCode).toBe(201)
    expect((await post(w.worker.token, payload, '/v1/shifts/not-a-uuid/work-logs')).statusCode).toBe(400)
  })

  it('is 404 for another worker, another organization, or a supervisor without the site', async () => {
    const payload = { kind: 'NOTE', body: 'hi' }
    const peer = await signIn(t, 'FIELD_USER')

    expect((await post(peer.token, payload)).statusCode).toBe(404)
    expect((await post((await otherOrgAdmin(t)).token, payload)).statusCode).toBe(404)
    expect((await post((await outsideSupervisor(t)).token, payload)).statusCode).toBe(404)
    expect((await post(w.worker.token, payload, '/v1/shifts/11111111-1111-4111-8111-111111111111/work-logs')).statusCode).toBe(404)
    expect(await t.prisma.workLog.count()).toBe(0)
  })

  it('a worker may log while IN_PROGRESS, or up to 24 hours after completion, never before or otherwise', async () => {
    const note = { kind: 'NOTE', body: 'hi' } as const
    const attempt = async (status: Shift['status'], clockOutAt: Date | null, now: Date) => {
      const made = await entryFor(t, w, { clockOutAt, ...{ start: at(START, 3000), end: at(END, 3000) } })

      await t.prisma.shift.update({ where: { id: made.shift.id }, data: { status } })

      return createWorkLog(t.ctx, w.worker.actor, made.shift.id, note, undefined, now)
    }

    const out = at(END, 3000)

    await expect(attempt('COMPLETED', out, at(out, 24 * 60))).resolves.toMatchObject({ kind: 'NOTE' })
    await expect(attempt('COMPLETED', out, at(out, 24 * 60 + 1))).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 })
    await expect(attempt('ASSIGNED', out, out)).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(attempt('NO_SHOW', out, out)).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(attempt('IN_PROGRESS', null, at(out, 99999))).resolves.toMatchObject({ kind: 'NOTE' })
  })

  it('a worker cannot see or write to a shift of an unpublished schedule', async () => {
    await t.prisma.schedule.update({ where: { id: w.schedule.id }, data: { status: 'DRAFT' } })

    expect((await post(w.worker.token, { kind: 'NOTE', body: 'x' })).statusCode).toBe(404)
    expect((await get(w.worker.token)).statusCode).toBe(404)
  })

  it('supervisors and admins may log at any shift status', async () => {
    const done = await shiftFor(t, w, { status: 'NO_SHOW', start: at(START, 9000), end: at(END, 9000) })

    expect((await post(w.supervisor.token, { kind: 'NOTE', body: 'late entry' }, `/v1/shifts/${done.id}/work-logs`)).statusCode).toBe(201)
  })
})

describe('GET /v1/shifts/:id/work-logs', () => {
  const seed = async () => {
    const file = await makeFile(t)

    for (const payload of [
      { kind: 'PHOTO', fileId: file.id },
      { kind: 'NOTE', body: 'a note' },
      { kind: 'ISSUE', body: 'an issue' },
      { kind: 'CHECKLIST', data: { items: [{ label: 'x', done: true }] } }
    ]) {
      await post(w.worker.token, payload)
    }
  }

  it('staff and the assigned worker see everything, oldest first', async () => {
    await seed()

    for (const who of [w.admin, w.supervisor, w.worker]) {
      const res = await get(who.token)

      expect(res.statusCode).toBe(200)
      expect(body(res).data?.workLogs.map((log: { kind: string }) => log.kind)).toEqual(['PHOTO', 'NOTE', 'ISSUE', 'CHECKLIST'])
      expect(body(res).meta).toMatchObject({ total: 4 })
    }
  })

  it('a client sees only photos and notes, without who wrote them', async () => {
    await seed()

    const logs = body(await get(w.clientUser.token)).data?.workLogs

    expect(logs.map((log: { kind: string }) => log.kind)).toEqual(['PHOTO', 'NOTE'])
    expect(logs.every((log: object) => !('userId' in log) && !('user' in log))).toBe(true)
  })

  it('pages', async () => {
    await seed()

    const page = body(await get(w.admin.token, url(), { limit: '3', page: '2' }))

    expect(page.data?.workLogs).toHaveLength(1)
    expect(page.meta).toMatchObject({ page: 2, limit: 3, total: 4, totalPages: 2 })
    expect((await get(w.admin.token, url(), { limit: '500' })).statusCode).toBe(400)
    expect((await get(w.admin.token, url(), { kind: 'NOTE' })).statusCode).toBe(400)
  })

  it('is 404 outside the caller scope and 401/400 on bad calls', async () => {
    await seed()

    const peer = await signIn(t, 'FIELD_USER')
    const otherClient = await signIn(t, 'CLIENT_USER', { clientId: (await makeSite(t)).clientId })

    expect((await get(undefined)).statusCode).toBe(401)
    expect((await get(peer.token)).statusCode).toBe(404)
    expect((await get(otherClient.token)).statusCode).toBe(404)
    expect((await get((await outsideSupervisor(t)).token)).statusCode).toBe(404)
    expect((await get((await otherOrgAdmin(t)).token)).statusCode).toBe(404)
    expect((await get(w.admin.token, '/v1/shifts/nope/work-logs')).statusCode).toBe(400)
  })
})
