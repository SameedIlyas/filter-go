import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FastifyInstance, LightMyRequestResponse } from 'fastify'

import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config/env.js'
import type { Config } from '../src/config/env.js'
import type { AppContext } from '../src/context.js'
import type {
  BillingCycle,
  BillingType,
  Client,
  Contract,
  ContractCoverage,
  ContractLine,
  ContractStatus,
  CoveragePattern,
  FileObject,
  Organization,
  Role,
  Schedule,
  ScheduleStatus,
  Service,
  Shift,
  ShiftStatus,
  Site,
  TimesheetEntry,
  TimesheetStatus,
  User,
  UserStatus
} from '../src/generated/prisma/client.js'
import { D } from '../src/lib/money.js'
import { createPasswordHasher } from '../src/lib/password.js'
import { createPrisma } from '../src/lib/prisma.js'
import type { PrismaClient } from '../src/lib/prisma.js'
import { buildTermsSnapshot } from '../src/lib/terms-snapshot.js'
import { toDateOnly } from '../src/lib/time.js'
import { createMemoryMailer } from '../src/modules/mail/mailer.js'
import type { MemoryMailer } from '../src/modules/mail/mailer.js'

/**
 * Each parallel builder points TEST_DATABASE_URL at its own database (name must end in `_test`).
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://filter:filter@localhost:5433/filter_portal_test'

export const STRONG_PASSWORD = 'Correct-Horse-Battery-9'
export const OTHER_STRONG_PASSWORD = 'Another-Strong-Passphrase-42'

export const testConfig = (overrides: Record<string, string> = {}): Config =>
  loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    FRONTEND_URL: 'http://localhost:3000',
    MAIL_DRIVER: 'memory',
    RATE_LIMIT_ENABLED: 'false',
    JOBS_ENABLED: 'false',
    STORAGE_DIR: join(tmpdir(), `filter-portal-test-storage-${process.pid}`),
    // Cheapest legal argon2 settings: production values would make the suite crawl
    PASSWORD_HASH_MEMORY_KIB: '8',
    PASSWORD_HASH_TIME_COST: '1',
    LOG_LEVEL: 'silent',
    ...overrides
  })

export interface TestApp {
  app: FastifyInstance
  ctx: AppContext
  prisma: PrismaClient
  mailer: MemoryMailer
  config: Config
  close(): Promise<void>
}

export const createTestApp = async (overrides: Record<string, string> = {}): Promise<TestApp> => {
  const config = testConfig(overrides)
  const prisma = createPrisma(config.databaseUrl)
  const mailer = createMemoryMailer()
  const { app, ctx } = await buildApp({ config, prisma, mailer })

  await app.ready()

  return {
    app,
    ctx,
    prisma,
    mailer,
    config,
    close: async () => {
      await app.close()
      await prisma.$disconnect()
    }
  }
}

/** Empties every table. Refuses to run against anything that isn't obviously a test database. */
export const resetDb = async (prisma: PrismaClient): Promise<void> => {
  if (!/_test(\?|$)/.test(TEST_DATABASE_URL)) {
    throw new Error(`Refusing to truncate ${TEST_DATABASE_URL}: database name must end in _test`)
  }

  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`

  if (tables.length > 0) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map(table => `"${table.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`)
  }
}

// =============================================================================
// Factories. They write straight to the database (no API), so a module's tests never depend on another module.
// Everything defaults to a sensible value; pass only what the test cares about.
// =============================================================================

let counter = 0
const next = () => (counter += 1)

/** The organization most tests live in. Pass a different `name` to get a second tenant for isolation tests. */
export const ensureOrg = async ({ prisma }: Pick<TestApp, 'prisma'>, name = 'Acme Services', timezone = 'America/Chicago'): Promise<Organization> =>
  (await prisma.organization.findFirst({ where: { name } })) ??
  prisma.organization.create({ data: { name, timezone, leadIntakeKey: randomBytes(18).toString('base64url') } })

interface NewUser {
  orgId?: string
  email?: string
  name?: string
  /** null = invited user with no password */
  password?: string | null
  role?: Role
  status?: UserStatus
  clientId?: string | null
  phone?: string
  defaultPayRate?: string
}

export const createUser = async (t: TestApp, input: NewUser = {}): Promise<User> => {
  const password = input.password === undefined ? STRONG_PASSWORD : input.password
  const hasher = createPasswordHasher(t.ctx.config.passwordHash)
  const n = next()

  return t.prisma.user.create({
    data: {
      orgId: input.orgId ?? (await ensureOrg(t)).id,
      email: input.email ?? `user${n}@filter-go.test`,
      name: input.name ?? `Test User ${n}`,
      role: input.role ?? 'FIELD_USER',
      status: input.status ?? (password === null ? 'INVITED' : 'ACTIVE'),
      clientId: input.clientId ?? null,
      phone: input.phone,
      defaultPayRate: input.defaultPayRate ? D(input.defaultPayRate) : undefined,
      passwordHash: password === null ? null : await hasher.hash(password),
      passwordChangedAt: password === null ? null : new Date()
    }
  })
}

export interface Call {
  body?: unknown
  token?: string
  ip?: string
  headers?: Record<string, string>
  query?: Record<string, string>
}

/** Thin wrapper over app.inject so tests read like API calls. */
export const client = (app: FastifyInstance) => {
  const send = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, call: Call = {}) =>
    app.inject({
      method,
      url,
      query: call.query,
      payload: call.body === undefined ? undefined : (call.body as object),
      remoteAddress: call.ip,
      headers: { ...(call.token ? { authorization: `Bearer ${call.token}` } : {}), ...call.headers }
    })

  return {
    get: (url: string, call?: Call) => send('GET', url, call),
    post: (url: string, call?: Call) => send('POST', url, call),
    patch: (url: string, call?: Call) => send('PATCH', url, call),
    put: (url: string, call?: Call) => send('PUT', url, call),
    delete: (url: string, call?: Call) => send('DELETE', url, call)
  }
}

export type Body = {
  success: boolean
  data: Record<string, any> | null
  meta?: Record<string, number>
  error: { code: string; message: string; requestId: string; details?: Record<string, any> } | null
}

export const body = (response: LightMyRequestResponse): Body => response.json() as Body

/** Logs in through the real endpoint and returns the raw session token. */
export const loginAs = async (t: TestApp, email: string, password = STRONG_PASSWORD, ip?: string): Promise<string> => {
  const response = await client(t.app).post('/v1/auth/login', { body: { email, password }, ip })
  const token = body(response).data?.session?.token as string | undefined

  if (response.statusCode !== 200 || !token) {
    throw new Error(`loginAs(${email}) failed: ${response.statusCode} ${response.body}`)
  }

  return token
}

/** Creates a user with the given role and signs them in. The one-liner most tests want. */
export const signIn = async (t: TestApp, role: Role, input: NewUser = {}): Promise<{ user: User; token: string }> => {
  const user = await createUser(t, { ...input, role })

  return { user, token: await loginAs(t, user.email) }
}

/** Pulls the one-time token out of the link in the newest email sent to `to`. */
export const tokenFromMail = (mailer: MemoryMailer, to: string): string => {
  const mail = [...mailer.sent].reverse().find(message => message.to === to)
  const match = mail && /token=([A-Za-z0-9_%-]+)/.exec(mail.text)

  if (!match?.[1]) {
    throw new Error(`No email with a token found for ${to}`)
  }

  return decodeURIComponent(match[1])
}

// ---------------------------------------------------------------------------
// Domain factories
// ---------------------------------------------------------------------------

export const makeClient = async (t: TestApp, input: { orgId?: string; legalName?: string; billingEmail?: string } = {}): Promise<Client> => {
  const n = next()

  return t.prisma.client.create({
    data: {
      orgId: input.orgId ?? (await ensureOrg(t)).id,
      legalName: input.legalName ?? `Client ${n} LLC`,
      billingEmail: input.billingEmail ?? `billing${n}@client.test`,
      billingAddress: '1 Main St'
    }
  })
}

export const makeSite = async (
  t: TestApp,
  input: { orgId?: string; clientId?: string; name?: string; lat?: number | null; lng?: number | null; timezone?: string | null } = {}
): Promise<Site> => {
  const n = next()
  const orgId = input.orgId ?? (await ensureOrg(t)).id
  const clientId = input.clientId ?? (await makeClient(t, { orgId })).id

  return t.prisma.site.create({
    data: {
      orgId,
      clientId,
      name: input.name ?? `Site ${n}`,
      address: `${n} Example Road`,
      // Downtown Chicago by default so geofence tests have a known centre
      lat: input.lat === undefined ? 41.8781 : input.lat,
      lng: input.lng === undefined ? -87.6298 : input.lng,
      timezone: input.timezone === undefined ? 'America/Chicago' : input.timezone
    }
  })
}

export const makeService = async (t: TestApp, input: { orgId?: string; name?: string } = {}): Promise<Service> =>
  t.prisma.service.create({ data: { orgId: input.orgId ?? (await ensureOrg(t)).id, name: input.name ?? `Service ${next()}` } })

export interface LineInput {
  siteId?: string
  serviceId?: string
  description?: string
  qty?: string
  billRate?: string
  payRate?: string | null
  estMinutes?: number
  taxCode?: string
}

export interface CoverageInput {
  siteId?: string
  patternType?: CoveragePattern
  weekdays?: number[]
  timeStart?: string
  timeEnd?: string
  intervalDays?: number
  visitsPerPeriod?: number
}

export interface ContractFixture {
  contract: Contract
  client: Client
  site: Site
  lines: ContractLine[]
  coverage: ContractCoverage[]
}

/**
 * An ACTIVE per-visit contract with one line (bill 145.00 / pay 22.00) and Mon/Wed/Fri 18:00-02:00 coverage
 * at one site. Override anything; pass `coverage: []` for none.
 */
export const makeContract = async (
  t: TestApp,
  input: {
    orgId?: string
    client?: Client
    site?: Site
    status?: ContractStatus
    billingType?: BillingType
    billingCycle?: BillingCycle
    startDate?: string
    endDate?: string | null
    version?: number
    contractNumber?: string
    supersedesContractId?: string
    lines?: LineInput[]
    coverage?: CoverageInput[]
  } = {}
): Promise<ContractFixture> => {
  const orgId = input.orgId ?? input.client?.orgId ?? (await ensureOrg(t)).id
  const client = input.client ?? (await makeClient(t, { orgId }))
  const site = input.site ?? (await makeSite(t, { orgId, clientId: client.id }))
  const n = next()

  const contract = await t.prisma.contract.create({
    data: {
      orgId,
      clientId: client.id,
      contractNumber: input.contractNumber ?? `C-T${String(n).padStart(5, '0')}`,
      version: input.version ?? 1,
      status: input.status ?? 'ACTIVE',
      startDate: toDateOnly(input.startDate ?? '2026-01-01'),
      endDate: input.endDate === undefined || input.endDate === null ? null : toDateOnly(input.endDate),
      billingType: input.billingType ?? 'PER_VISIT',
      billingCycle: input.billingCycle ?? 'MONTHLY',
      supersedesContractId: input.supersedesContractId,
      createdById: 'test',
      lines: {
        create: (input.lines ?? [{}]).map(line => ({
          siteId: line.siteId ?? site.id,
          serviceId: line.serviceId,
          description: line.description ?? 'Standard visit',
          qty: D(line.qty ?? '1'),
          billRate: D(line.billRate ?? '145.00'),
          payRate: line.payRate === null ? null : D(line.payRate ?? '22.00'),
          estMinutes: line.estMinutes ?? 480,
          taxCode: line.taxCode
        }))
      },
      coverage: {
        create: (input.coverage ?? [{}]).map(row => ({
          siteId: row.siteId ?? site.id,
          patternType: row.patternType ?? 'WEEKLY',
          weekdays: row.weekdays ?? (row.patternType && row.patternType !== 'WEEKLY' ? [] : [1, 3, 5]),
          timeStart: row.timeStart ?? (row.patternType === 'AD_HOC' || row.patternType === 'INTERVAL' ? null : '18:00'),
          timeEnd: row.timeEnd ?? (row.patternType === 'AD_HOC' || row.patternType === 'INTERVAL' ? null : '02:00'),
          intervalDays: row.intervalDays,
          visitsPerPeriod: row.visitsPerPeriod
        }))
      }
    },
    include: { lines: true, coverage: true }
  })

  return { contract, client, site, lines: contract.lines, coverage: contract.coverage }
}

/** A schedule for a contract fixture, with a proper frozen terms snapshot. */
export const makeSchedule = async (
  t: TestApp,
  fixture: Pick<ContractFixture, 'contract' | 'site' | 'lines' | 'coverage'>,
  input: { status?: ScheduleStatus; periodStart?: string; periodEnd?: string; supervisorId?: string } = {}
): Promise<Schedule> =>
  t.prisma.schedule.create({
    data: {
      orgId: fixture.contract.orgId,
      contractId: fixture.contract.id,
      siteId: fixture.site.id,
      supervisorId: input.supervisorId,
      periodStart: toDateOnly(input.periodStart ?? '2026-03-02'),
      periodEnd: toDateOnly(input.periodEnd ?? '2026-03-08'),
      status: input.status ?? 'PUBLISHED',
      publishedAt: (input.status ?? 'PUBLISHED') === 'DRAFT' ? null : new Date(),
      contractVersion: fixture.contract.version,
      termsSnapshot: buildTermsSnapshot(fixture.contract, fixture.lines, fixture.coverage, fixture.site.id, fixture.site.timezone ?? 'America/Chicago')
    }
  })

export const makeShift = async (
  t: TestApp,
  schedule: Schedule,
  input: { start?: string; end?: string; assignedUserId?: string; status?: ShiftStatus; isExtra?: boolean; serviceRef?: string; billableQty?: string } = {}
): Promise<Shift> =>
  t.prisma.shift.create({
    data: {
      orgId: schedule.orgId,
      scheduleId: schedule.id,
      siteId: schedule.siteId,
      assignedUserId: input.assignedUserId,
      // 18:00 -> 02:00 Chicago time on Mon 2026-03-02 (UTC-6 in early March, before DST starts on the 8th)
      scheduledStart: new Date(input.start ?? '2026-03-03T00:00:00.000Z'),
      scheduledEnd: new Date(input.end ?? '2026-03-03T08:00:00.000Z'),
      status: input.status ?? (input.assignedUserId ? 'ASSIGNED' : 'OPEN'),
      isExtra: input.isExtra ?? false,
      serviceRef: input.serviceRef,
      billableQty: input.billableQty ? D(input.billableQty) : undefined
    }
  })

export const makeTimesheet = async (
  t: TestApp,
  shift: Shift,
  user: Pick<User, 'id'>,
  input: {
    status?: TimesheetStatus
    clockInAt?: Date | null
    clockOutAt?: Date | null
    actualMinutes?: number | null
    breakMinutes?: number
    billable?: boolean
    payable?: boolean
    payRateSnapshot?: string
    billRateSnapshot?: string
  } = {}
): Promise<TimesheetEntry> => {
  const scheduledMinutes = Math.round((shift.scheduledEnd.getTime() - shift.scheduledStart.getTime()) / 60_000)

  return t.prisma.timesheetEntry.create({
    data: {
      orgId: shift.orgId,
      shiftId: shift.id,
      userId: user.id,
      clockInAt: input.clockInAt === undefined ? shift.scheduledStart : input.clockInAt,
      clockOutAt: input.clockOutAt === undefined ? shift.scheduledEnd : input.clockOutAt,
      breakMinutes: input.breakMinutes ?? 0,
      scheduledMinutes,
      actualMinutes: input.actualMinutes === undefined ? scheduledMinutes - (input.breakMinutes ?? 0) : input.actualMinutes,
      status: input.status ?? 'SUBMITTED',
      billable: input.billable ?? true,
      payable: input.payable ?? true,
      payRateSnapshot: input.payRateSnapshot ? D(input.payRateSnapshot) : undefined,
      billRateSnapshot: input.billRateSnapshot ? D(input.billRateSnapshot) : undefined
    }
  })
}

export const grantSiteAccess = async (t: TestApp, userId: string, siteId: string): Promise<void> => {
  await t.prisma.userSiteAccess.upsert({ where: { userId_siteId: { userId, siteId } }, create: { userId, siteId }, update: {} })
}

export const makeFile = async (t: TestApp, input: { orgId?: string; uploadedById?: string; name?: string; contentType?: string } = {}): Promise<FileObject> =>
  t.prisma.fileObject.create({
    data: {
      orgId: input.orgId ?? (await ensureOrg(t)).id,
      key: `test/${randomBytes(12).toString('hex')}`,
      originalName: input.name ?? 'file.jpg',
      contentType: input.contentType ?? 'image/jpeg',
      size: 1024,
      uploadedById: input.uploadedById ?? 'test'
    }
  })
