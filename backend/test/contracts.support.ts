import { orderedIds } from '../src/modules/contracts/contract.rows.js'
import { body, client, createUser, ensureOrg, grantSiteAccess, loginAs, makeClient, makeContract, makeSite, signIn } from './helpers.js'
import type { ContractFixture, TestApp } from './helpers.js'

export const NIL_ID = '00000000-0000-4000-8000-000000000000'

export const validLine = (siteId: string, over: Record<string, unknown> = {}) => ({
  siteId,
  description: 'Nightly clean',
  qty: '1',
  billRate: '145.00',
  payRate: '22.00',
  estMinutes: 480,
  ...over
})

export const weekly = (siteId: string, over: Record<string, unknown> = {}) => ({
  siteId,
  patternType: 'WEEKLY',
  weekdays: [1, 3, 5],
  timeStart: '18:00',
  timeEnd: '02:00',
  ...over
})

export const draftBody = (clientId: string, siteId: string, over: Record<string, unknown> = {}) => ({
  clientId,
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  billingType: 'PER_VISIT',
  billingCycle: 'MONTHLY',
  lines: [validLine(siteId)],
  coverage: [weekly(siteId)],
  ...over
})

export interface World {
  admin: { token: string; id: string }
  supervisor: { token: string; id: string }
  field: { token: string; id: string }
  clientUser: { token: string; id: string }
  otherAdmin: { token: string; id: string }
  clientId: string
  siteId: string
  otherSiteId: string
  api: ReturnType<typeof client>
}

/** One organization with all four roles, one client with two sites (the supervisor manages only the first), and a second organization. */
export const buildWorld = async (t: TestApp): Promise<World> => {
  const org = await ensureOrg(t)
  const other = await ensureOrg(t, 'Other Org')
  const clientRow = await makeClient(t, { orgId: org.id })
  const site = await makeSite(t, { orgId: org.id, clientId: clientRow.id, name: 'Main Office' })
  const otherSite = await makeSite(t, { orgId: org.id, clientId: clientRow.id, name: 'Warehouse' })
  const admin = await signIn(t, 'ADMIN')
  const supervisor = await signIn(t, 'SUPERVISOR')
  const field = await signIn(t, 'FIELD_USER')
  const clientUser = await createUser(t, { role: 'CLIENT_USER', clientId: clientRow.id })
  const otherAdmin = await signIn(t, 'ADMIN', { orgId: other.id })

  await grantSiteAccess(t, supervisor.user.id, site.id)

  return {
    admin: { token: admin.token, id: admin.user.id },
    supervisor: { token: supervisor.token, id: supervisor.user.id },
    field: { token: field.token, id: field.user.id },
    clientUser: { token: await loginAs(t, clientUser.email), id: clientUser.id },
    otherAdmin: { token: otherAdmin.token, id: otherAdmin.user.id },
    clientId: clientRow.id,
    siteId: site.id,
    otherSiteId: otherSite.id,
    api: client(t.app)
  }
}

/** Creates a valid DRAFT through the API and returns the serialized contract. */
export const createDraft = async (world: World, over: Record<string, unknown> = {}): Promise<Record<string, any>> => {
  const response = await world.api.post('/v1/contracts', { token: world.admin.token, body: draftBody(world.clientId, world.siteId, over) })

  if (response.statusCode !== 201) throw new Error(`createDraft failed: ${response.body}`)

  return body(response).data?.contract
}

/** A contract row that already sits in `status`, made straight in the database. */
export const contractIn = async (t: TestApp, world: World, status: ContractFixture['contract']['status'], over: Parameters<typeof makeContract>[1] = {}) => {
  const org = await ensureOrg(t)
  const clientRow = await t.prisma.client.findFirstOrThrow({ where: { id: world.clientId } })
  const site = await t.prisma.site.findFirstOrThrow({ where: { id: world.siteId } })

  const fixture = await makeContract(t, { orgId: org.id, client: clientRow, site, status, ...over })

  await pinRowOrder(t, fixture.contract.id)

  return fixture
}

/**
 * The factory inserts rows with random ids, but the API orders rows by id. Re-key them (keeping the order the
 * database returns them in, which is insertion order) so `lines[0]`, `lines[1]` mean what the test wrote.
 */
const pinRowOrder = async (t: TestApp, contractId: string): Promise<void> => {
  const lines = await t.prisma.contractLine.findMany({ where: { contractId } })
  const coverage = await t.prisma.contractCoverage.findMany({ where: { contractId } })
  const lineIds = orderedIds(lines.length)
  const coverageIds = orderedIds(coverage.length)

  for (const [index, line] of lines.entries()) await t.prisma.contractLine.update({ where: { id: line.id }, data: { id: lineIds[index] } })

  for (const [index, row] of coverage.entries()) await t.prisma.contractCoverage.update({ where: { id: row.id }, data: { id: coverageIds[index] } })
}
