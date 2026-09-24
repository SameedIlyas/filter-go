import { body, client, createUser, ensureOrg, grantSiteAccess, loginAs, makeContract, makeShift, makeSchedule, signIn } from './helpers.js'
import type { ContractFixture, TestApp } from './helpers.js'
import type { Schedule, Shift, ShiftStatus, User } from '../src/generated/prisma/client.js'

export interface Person {
  user: User
  token: string
}

export interface World {
  t: TestApp
  api: ReturnType<typeof client>
  fixture: ContractFixture
  admin: Person
  supervisor: Person
  field: Person
  clientUser: Person
}

/**
 * Org A with an ADMIN, a SUPERVISOR and a FIELD_USER who both have access to one site, and a CLIENT_USER of that
 * site's client. The site is in America/Chicago; the contract is ACTIVE with Mon/Wed/Fri 18:00-02:00 coverage.
 */
export const buildWorld = async (t: TestApp, contract: Parameters<typeof makeContract>[1] = {}): Promise<World> => {
  const fixture = await makeContract(t, contract)
  const admin = await signIn(t, 'ADMIN')
  const supervisor = await signIn(t, 'SUPERVISOR')
  const field = await signIn(t, 'FIELD_USER')
  const clientUser = await signIn(t, 'CLIENT_USER', { clientId: fixture.client.id })

  await grantSiteAccess(t, supervisor.user.id, fixture.site.id)
  await grantSiteAccess(t, field.user.id, fixture.site.id)

  return { t, api: client(t.app), fixture, admin, supervisor, field, clientUser }
}

/** An ADMIN of a different organization, with their own contract fixture (for cross-tenant 404 checks). */
export const buildOutsider = async (t: TestApp) => {
  const org = await ensureOrg(t, 'Other Co')
  const admin = await signIn(t, 'ADMIN', { orgId: org.id })
  const fixture = await makeContract(t, { orgId: org.id })

  return { org, admin, fixture }
}

export const addFieldUser = async (world: World, input: { siteAccess?: boolean; defaultPayRate?: string } = {}): Promise<Person> => {
  const user = await createUser(world.t, { role: 'FIELD_USER', defaultPayRate: input.defaultPayRate })

  if (input.siteAccess !== false) await grantSiteAccess(world.t, user.id, world.fixture.site.id)

  return { user, token: await loginAs(world.t, user.email) }
}

export const draftSchedule = (world: World, input: Parameters<typeof makeSchedule>[2] = {}): Promise<Schedule> =>
  makeSchedule(world.t, world.fixture, { status: 'DRAFT', ...input })

export const publishedSchedule = (world: World, input: Parameters<typeof makeSchedule>[2] = {}): Promise<Schedule> =>
  makeSchedule(world.t, world.fixture, { status: 'PUBLISHED', ...input })

/** A shift on 2026-03-03 00:00Z - 08:00Z (Mon 18:00-02:00 Chicago) by default. */
export const shiftAt = (world: World, schedule: Schedule, input: Parameters<typeof makeShift>[2] = {}): Promise<Shift> => makeShift(world.t, schedule, input)

export const withStatus = (status: ShiftStatus) => ({ status })

export { body }

/** Concrete, round instants for hand-built shifts: day N of March 2026 at hour H UTC. */
export const at = (day: number, hour: number): string => `2026-03-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`
