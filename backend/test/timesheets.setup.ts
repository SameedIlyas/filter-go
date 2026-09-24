import type { Actor } from '../src/lib/access.js'
import type { ExceptionType, Shift, ShiftStatus, TimesheetEntry, TimesheetStatus, User } from '../src/generated/prisma/client.js'
import { makeContract, makeSchedule, makeShift, makeSite, makeTimesheet, grantSiteAccess, ensureOrg, signIn } from './helpers.js'
import type { ContractFixture, LineInput, TestApp } from './helpers.js'

/** 18:00 -> 02:00 Chicago on Mon 2026-03-02 (UTC-6). Matches the `makeShift` defaults. */
export const START = new Date('2026-03-03T00:00:00.000Z')
export const END = new Date('2026-03-03T08:00:00.000Z')

export const at = (base: Date, minutes: number): Date => new Date(base.getTime() + minutes * 60_000)

export const asActor = (user: User): Actor => ({ id: user.id, orgId: user.orgId, role: user.role, clientId: user.clientId })

export interface Member {
  user: User
  token: string
  actor: Actor
}

const member = (signed: { user: User; token: string }): Member => ({ ...signed, actor: asActor(signed.user) })

export interface World {
  fixture: ContractFixture
  schedule: Awaited<ReturnType<typeof makeSchedule>>
  admin: Member
  supervisor: Member
  worker: Member
  clientUser: Member
}

/**
 * One org with a published schedule at a Chicago site, an admin, a site supervisor, a worker (default pay 18.00)
 * with access to the site, and a client user of the site's client. The contract line is bill 145.00 / pay 22.00.
 */
export const buildWorld = async (t: TestApp, options: { siteCoordinates?: boolean; lines?: LineInput[] } = {}): Promise<World> => {
  const fixture = await makeContract(t, options.lines ? { lines: options.lines } : {})

  if (options.siteCoordinates === false) {
    await t.prisma.site.update({ where: { id: fixture.site.id }, data: { lat: null, lng: null } })
  }

  const schedule = await makeSchedule(t, fixture)
  const admin = member(await signIn(t, 'ADMIN'))
  const supervisor = member(await signIn(t, 'SUPERVISOR'))
  const worker = member(await signIn(t, 'FIELD_USER', { defaultPayRate: '18.00' }))
  const clientUser = member(await signIn(t, 'CLIENT_USER', { clientId: fixture.client.id }))

  await grantSiteAccess(t, supervisor.user.id, fixture.site.id)
  await grantSiteAccess(t, worker.user.id, fixture.site.id)

  return { fixture, schedule, admin, supervisor, worker, clientUser }
}

/** A second, unrelated organization with its own admin. */
export const otherOrgAdmin = async (t: TestApp): Promise<Member> => {
  const org = await ensureOrg(t, 'Other Co', 'America/New_York')

  return member(await signIn(t, 'ADMIN', { orgId: org.id }))
}

/** A supervisor of the same org with NO access to the world's site. */
export const outsideSupervisor = async (t: TestApp): Promise<Member> => {
  const other = await makeSite(t)

  const signed = member(await signIn(t, 'SUPERVISOR'))

  await grantSiteAccess(t, signed.user.id, other.id)

  return signed
}

export const shiftFor = (t: TestApp, w: World, input: { start?: Date; end?: Date; status?: ShiftStatus; serviceRef?: string; worker?: User } = {}): Promise<Shift> =>
  makeShift(t, w.schedule, {
    start: (input.start ?? START).toISOString(),
    end: (input.end ?? END).toISOString(),
    assignedUserId: (input.worker ?? w.worker.user).id,
    status: input.status ?? 'ASSIGNED',
    serviceRef: input.serviceRef
  })

/** A shift plus a SUBMITTED (or other status) entry for the world's worker, as if they had worked it on time. */
export const entryFor = async (
  t: TestApp,
  w: World,
  input: { status?: TimesheetStatus; start?: Date; end?: Date; serviceRef?: string; worker?: User; clockInAt?: Date | null; clockOutAt?: Date | null; actualMinutes?: number | null; billable?: boolean; payable?: boolean } = {}
): Promise<{ shift: Shift; entry: TimesheetEntry }> => {
  const start = input.start ?? START
  const end = input.end ?? END
  const shift = await shiftFor(t, w, { start, end, serviceRef: input.serviceRef, worker: input.worker, status: 'COMPLETED' })
  const entry = await makeTimesheet(t, shift, input.worker ?? w.worker.user, {
    status: input.status ?? 'SUBMITTED',
    clockInAt: input.clockInAt,
    clockOutAt: input.clockOutAt,
    actualMinutes: input.actualMinutes,
    billable: input.billable,
    payable: input.payable
  })

  return { shift, entry }
}

export const addException = (t: TestApp, entryId: string, type: ExceptionType, resolved = false) =>
  t.prisma.timesheetException.create({ data: { timesheetEntryId: entryId, type, detail: {}, resolved, resolvedAt: resolved ? new Date() : null } })
