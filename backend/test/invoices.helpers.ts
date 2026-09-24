import { createHmac } from 'node:crypto'

import type { LightMyRequestResponse } from 'fastify'

import type { BillingType, Schedule, Shift, TimesheetEntry, TimesheetStatus, User } from '../src/generated/prisma/client.js'
import { processOutbox } from '../src/jobs/outbox.js'
import { zonedInstant } from '../src/lib/time.js'
import { getFakeIntegrations } from '../src/modules/invoices/integrations/index.js'
import { outboxHandlers } from '../src/modules/invoices/invoices.jobs.js'
import { body, client, createUser, makeContract, makeSchedule, makeShift, makeTimesheet, signIn } from './helpers.js'
import type { ContractFixture, LineInput, TestApp } from './helpers.js'

export const ZONE = 'America/Chicago'

export interface World {
  admin: { user: User; token: string }
  worker: User
  fixture: ContractFixture
  schedule: Schedule
}

/** An admin, a field worker and an ACTIVE contract with a March 2026 schedule whose snapshot is frozen. */
export const makeWorld = async (
  t: TestApp,
  input: { billingType?: BillingType; lines?: LineInput[]; contractStatus?: 'ACTIVE' | 'EXPIRED' | 'DRAFT' | 'PENDING_SIGNATURE' | 'CANCELLED' } = {}
): Promise<World> => {
  const admin = await signIn(t, 'ADMIN')
  const worker = await createUser(t, { role: 'FIELD_USER' })
  const fixture = await makeContract(t, { billingType: input.billingType ?? 'PER_VISIT', lines: input.lines, status: input.contractStatus ?? 'ACTIVE' })
  const schedule = await makeSchedule(t, fixture, { periodStart: '2026-03-01', periodEnd: '2026-03-31' })

  return { admin, worker, fixture, schedule }
}

export interface VisitInput {
  /** Local calendar date at the site, "YYYY-MM-DD". */
  day: string
  time?: string
  /** Scheduled length. */
  scheduledMinutes?: number
  actualMinutes?: number
  status?: TimesheetStatus
  billRate?: string
  billable?: boolean
  shiftStatus?: Shift['status']
  serviceRef?: string
  billableQty?: string
  worker?: Pick<User, 'id'>
  schedule?: Schedule
}

/** A completed shift with a timesheet entry (approved by default, with the bill rate stamped like the Timesheets module does). */
export const addVisit = async (t: TestApp, world: Pick<World, 'schedule' | 'worker'>, input: VisitInput): Promise<{ shift: Shift; entry: TimesheetEntry }> => {
  const start = zonedInstant(input.day, input.time ?? '18:00', ZONE)
  const end = new Date(start.getTime() + (input.scheduledMinutes ?? 480) * 60_000)
  const worker = input.worker ?? world.worker
  const shift = await makeShift(t, input.schedule ?? world.schedule, {
    start: start.toISOString(),
    end: end.toISOString(),
    assignedUserId: worker.id,
    status: input.shiftStatus ?? 'COMPLETED',
    serviceRef: input.serviceRef,
    billableQty: input.billableQty
  })
  const status = input.status ?? 'APPROVED'
  const stamped = status === 'APPROVED' || status === 'INVOICED'
  const entry = await makeTimesheet(t, shift, worker, {
    status,
    actualMinutes: input.actualMinutes,
    billable: input.billable,
    billRateSnapshot: stamped ? (input.billRate ?? '145.00') : undefined,
    payRateSnapshot: stamped ? '22.00' : undefined
  })

  return { shift, entry }
}

export const postRun = (t: TestApp, token: string, contractId: string, period: { start?: string; end?: string } = {}): Promise<LightMyRequestResponse> =>
  client(t.app).post('/v1/invoices/runs', { token, body: { contractId, periodStart: period.start ?? '2026-03-01', periodEnd: period.end ?? '2026-03-31' } })

/** Runs the invoice for the world's contract and returns the created invoice's detail. */
export const runInvoice = async (t: TestApp, world: Pick<World, 'admin' | 'fixture'>, period?: { start?: string; end?: string }) => {
  const response = await postRun(t, world.admin.token, world.fixture.contract.id, period)

  if (response.statusCode !== 201) throw new Error(`invoice run failed: ${response.statusCode} ${response.body}`)

  return body(response).data?.invoice as InvoiceJson
}

/** Every job whose retry time is in the future becomes due now, then the outbox worker runs once. */
export const drainOutbox = async (t: TestApp): Promise<number> => {
  await t.prisma.outboxJob.updateMany({ where: { status: 'PENDING' }, data: { runAt: new Date(0), lockedUntil: null } })

  return processOutbox(t.ctx, outboxHandlers)
}

/** The fake providers keep state for the life of the app: start every test from a clean slate. */
export const resetFakes = (t: TestApp): void => {
  const fakes = getFakeIntegrations(t.ctx)

  fakes.accounting.reset()
  fakes.payments.reset()
}

export const approve = (t: TestApp, token: string, id: string) => client(t.app).post(`/v1/invoices/${id}/approve`, { token })

/** Approves, syncs and (when `send`) sends an invoice through the real endpoints and the outbox worker. */
export const advanceTo = async (t: TestApp, token: string, id: string, target: 'APPROVED' | 'SYNCED' | 'SENT'): Promise<void> => {
  const approved = await approve(t, token, id)

  if (approved.statusCode !== 200) throw new Error(`approve failed: ${approved.statusCode} ${approved.body}`)
  if (target === 'APPROVED') return

  await drainOutbox(t)

  if (target === 'SYNCED') return

  const sent = await client(t.app).post(`/v1/invoices/${id}/send`, { token })

  if (sent.statusCode !== 202) throw new Error(`send failed: ${sent.statusCode} ${sent.body}`)

  await drainOutbox(t)
}

export interface InvoiceJson {
  id: string
  invoiceNumber: string
  status: string
  subtotal: string
  tax: string
  total: string
  amountPaid: string
  balance: string
  dueDate: string
  issueDate: string
  flags: { unapprovedTimesheets: number; noShows: number }
  sites: Array<{ siteId: string | null; siteName: string | null; subtotal: string; tax: string; lines: Array<Record<string, string | null>> }>
  payments: Array<Record<string, string | null>>
  sync: { accounting: { state: string; lastError: string | null }; payment: { state: string; lastError: string | null } }
  [key: string]: unknown
}

export const flatLines = (invoice: InvoiceJson): Array<Record<string, string | null>> => invoice.sites.flatMap(site => site.lines)

export const cents = (value: string): bigint => BigInt(value.replace('.', ''))

// ---------------------------------------------------------------------------
// Stripe: signed payloads built here, independently of the code under test
// ---------------------------------------------------------------------------

export const STRIPE_SECRET = 'whsec_test_secret_0123456789abcdef'

export const stripeSignature = (payload: string, secret = STRIPE_SECRET, timestamp = Math.floor(Date.now() / 1000)): string =>
  `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')}`

export interface StripeInvoicePaid {
  eventId: string
  type?: string
  stripeInvoiceId: string
  amountCents?: number
  paymentIntent?: string
}

export const stripePaidEvent = (input: StripeInvoicePaid): string =>
  JSON.stringify({
    id: input.eventId,
    object: 'event',
    type: input.type ?? 'invoice.paid',
    data: {
      object: {
        id: input.stripeInvoiceId,
        object: 'invoice',
        ...(input.amountCents === undefined ? {} : { amount_paid: input.amountCents }),
        payment_intent: input.paymentIntent ?? `pi_${input.eventId}`,
        status_transitions: { paid_at: Math.floor(Date.now() / 1000) }
      }
    }
  })

export const postWebhook = (t: TestApp, payload: string, signature?: string): Promise<LightMyRequestResponse> =>
  t.app.inject({
    method: 'POST',
    url: '/webhooks/stripe',
    payload,
    headers: { 'content-type': 'application/json', ...(signature === undefined ? {} : { 'stripe-signature': signature }) }
  })
