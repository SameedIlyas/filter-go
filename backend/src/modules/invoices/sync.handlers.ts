import { z } from 'zod'

import type { AppContext } from '../../context.js'
import type { Client, InvoiceLine, Invoice, OutboxJob } from '../../generated/prisma/client.js'
import { enqueue } from '../../jobs/outbox.js'
import type { OutboxHandler } from '../../jobs/outbox.js'
import { moneyRequired, qty4 } from '../../lib/money.js'
import { fromDateOnly } from '../../lib/time.js'
import { recordAudit } from '../audit/record.js'
import { invoiceEmail } from './invoice-email.js'
import { getIntegrations } from './integrations/index.js'
import type { ClientRecord, InvoiceLineRecord, InvoiceRecord } from './integrations/types.js'
import { JOB_TYPES, syncKeys } from './sync-state.js'

/**
 * Outbox handlers. Each one is idempotent on the external reference it produces (`accountingRef`, `stripeInvoiceId`,
 * `payment.accountingSyncedAt`): a job re-run after a partial success continues where it stopped and never creates a second
 * external object. Handlers throw to retry (exponential backoff, DEAD after 8 attempts, re-armed by `retry-sync`).
 */

const invoicePayload = z.object({ invoiceId: z.string().min(1) })
const paymentPayload = z.object({ invoiceId: z.string().min(1), paymentId: z.string().min(1) })

type InvoiceWithParts = Invoice & { client: Client; lines: InvoiceLine[] }

const requireOrg = (job: OutboxJob): string => {
  if (!job.orgId) throw new Error(`Outbox job ${job.id} has no organization`)

  return job.orgId
}

const loadInvoice = (ctx: AppContext, orgId: string, invoiceId: string): Promise<InvoiceWithParts | null> =>
  ctx.prisma.invoice.findFirst({ where: { id: invoiceId, orgId }, include: { client: true, lines: true } })

const toClientRecord = (client: Client): ClientRecord => ({
  id: client.id,
  legalName: client.legalName,
  billingEmail: client.billingEmail,
  billingAddress: client.billingAddress,
  accountingRef: client.accountingRef,
  stripeCustomerId: client.stripeCustomerId
})

const toInvoiceRecord = (invoice: Invoice): InvoiceRecord => ({
  id: invoice.id,
  invoiceNumber: invoice.invoiceNumber,
  issueDate: fromDateOnly(invoice.issueDate),
  dueDate: fromDateOnly(invoice.dueDate),
  subtotal: moneyRequired(invoice.subtotal),
  tax: moneyRequired(invoice.tax),
  total: moneyRequired(invoice.total)
})

const toLineRecords = (lines: InvoiceLine[]): InvoiceLineRecord[] =>
  lines.map(line => ({
    description: line.description,
    qty: qty4(line.qty),
    unitRate: moneyRequired(line.unitRate),
    amount: moneyRequired(line.amount),
    taxCode: line.taxCode,
    taxAmount: moneyRequired(line.taxAmount)
  }))

const systemAudit = (ctx: AppContext, invoice: Pick<Invoice, 'id' | 'orgId'>, action: string, diff: Record<string, string | number | boolean | null>) =>
  recordAudit(ctx.prisma, null, { orgId: invoice.orgId, entity: 'invoice', entityId: invoice.id, action, diff })

// ---------------------------------------------------------------------------
// accounting.sync_invoice
// ---------------------------------------------------------------------------

/** The accounting customer is created once per client and remembered on the client row. */
const ensureAccountingCustomer = async (ctx: AppContext, client: Client): Promise<Client> => {
  if (client.accountingRef) return client

  const { accountingRef } = await getIntegrations(ctx).accounting.upsertCustomer(toClientRecord(client))

  await ctx.prisma.client.updateMany({ where: { id: client.id, orgId: client.orgId, accountingRef: null }, data: { accountingRef } })

  return { ...client, accountingRef }
}

/** APPROVED -> SYNCED. If the invoice was voided while the provider call was in flight, the provider copy is voided too. */
const markSynced = async (ctx: AppContext, invoice: Invoice, accountingRef: string): Promise<void> => {
  await ctx.prisma.$transaction(async tx => {
    const updated = await tx.invoice.updateMany({
      where: { id: invoice.id, orgId: invoice.orgId, status: 'APPROVED' },
      data: { status: 'SYNCED', accountingRef, accountingSyncedAt: new Date() }
    })

    if (updated.count === 1) {
      await recordAudit(tx, null, { orgId: invoice.orgId, entity: 'invoice', entityId: invoice.id, action: 'synced', diff: { accountingRef } })

      return
    }

    const current = await tx.invoice.findUnique({ where: { id: invoice.id }, select: { status: true } })

    if (current?.status === 'VOID') {
      await tx.invoice.updateMany({ where: { id: invoice.id, accountingRef: null }, data: { accountingRef } })
      await enqueue(tx, { orgId: invoice.orgId, type: JOB_TYPES.voidInvoice, payload: { invoiceId: invoice.id }, dedupeKey: syncKeys.void(invoice.id) })
    }
  })
}

const syncInvoice: OutboxHandler = async (ctx, job) => {
  const { invoiceId } = invoicePayload.parse(job.payload)
  const invoice = await loadInvoice(ctx, requireOrg(job), invoiceId)

  // Gone, voided before the sync ran, or synced by an earlier attempt of this job: nothing left to do
  if (!invoice || invoice.status !== 'APPROVED') return

  const client = await ensureAccountingCustomer(ctx, invoice.client)
  const accountingRef =
    invoice.accountingRef ?? (await getIntegrations(ctx).accounting.createInvoice(toInvoiceRecord(invoice), toLineRecords(invoice.lines), toClientRecord(client))).accountingRef

  await markSynced(ctx, invoice, accountingRef)
}

// ---------------------------------------------------------------------------
// accounting.void_invoice, accounting.post_payment
// ---------------------------------------------------------------------------

const voidAccountingInvoice: OutboxHandler = async (ctx, job) => {
  const { invoiceId } = invoicePayload.parse(job.payload)
  const invoice = await ctx.prisma.invoice.findFirst({ where: { id: invoiceId, orgId: requireOrg(job) }, select: { accountingRef: true } })

  if (!invoice?.accountingRef) return

  await getIntegrations(ctx).accounting.voidInvoice(invoice.accountingRef)
}

const postPayment: OutboxHandler = async (ctx, job) => {
  const { invoiceId, paymentId } = paymentPayload.parse(job.payload)
  const payment = await ctx.prisma.payment.findFirst({
    where: { id: paymentId, invoiceId, orgId: requireOrg(job) },
    include: { invoice: { select: { accountingRef: true } } }
  })

  if (!payment || payment.accountingSyncedAt) return

  // The payment can only exist on a synced invoice, but stay defensive: retry until the reference is there
  if (!payment.invoice.accountingRef) throw new Error(`Invoice ${invoiceId} has no accounting reference yet`)

  await getIntegrations(ctx).accounting.recordPayment(payment.invoice.accountingRef, {
    id: payment.id,
    amount: moneyRequired(payment.amount),
    method: payment.method,
    receivedAt: payment.receivedAt
  })
  await ctx.prisma.payment.updateMany({ where: { id: payment.id, accountingSyncedAt: null }, data: { accountingSyncedAt: new Date() } })
}

// ---------------------------------------------------------------------------
// payments.create_invoice (send), payments.void_invoice
// ---------------------------------------------------------------------------

const ensureStripeCustomer = async (ctx: AppContext, client: Client): Promise<Client> => {
  if (client.stripeCustomerId) return client

  const { stripeCustomerId } = await getIntegrations(ctx).payments.upsertCustomer(toClientRecord(client))

  await ctx.prisma.client.updateMany({ where: { id: client.id, orgId: client.orgId, stripeCustomerId: null }, data: { stripeCustomerId } })

  return { ...client, stripeCustomerId }
}

/** SYNCED -> SENT with sentAt. A voided invoice gets its hosted copy voided instead (the void ran before it was stored). */
const markSent = async (ctx: AppContext, invoice: Invoice): Promise<void> => {
  await ctx.prisma.$transaction(async tx => {
    const updated = await tx.invoice.updateMany({ where: { id: invoice.id, orgId: invoice.orgId, status: 'SYNCED' }, data: { status: 'SENT', sentAt: new Date() } })

    if (updated.count === 1) {
      await recordAudit(tx, null, { orgId: invoice.orgId, entity: 'invoice', entityId: invoice.id, action: 'sent', diff: { invoiceNumber: invoice.invoiceNumber } })

      return
    }

    const current = await tx.invoice.findUnique({ where: { id: invoice.id }, select: { status: true } })

    if (current?.status === 'VOID') {
      await enqueue(tx, { orgId: invoice.orgId, type: JOB_TYPES.voidHostedInvoice, payload: { invoiceId: invoice.id }, dedupeKey: syncKeys.voidHosted(invoice.id) })

      return
    }

    // Paid (in part) before the email went out: still record that it was sent
    await tx.invoice.updateMany({ where: { id: invoice.id, sentAt: null }, data: { sentAt: new Date() } })
  })
}

/** Creates the hosted invoice once (its ids are stored the moment they exist, so a retry never creates a second one). */
const ensureHostedInvoice = async (ctx: AppContext, invoice: InvoiceWithParts): Promise<{ stripeInvoiceId: string; paymentUrl: string }> => {
  if (invoice.stripeInvoiceId && invoice.paymentUrl) return { stripeInvoiceId: invoice.stripeInvoiceId, paymentUrl: invoice.paymentUrl }

  const client = await ensureStripeCustomer(ctx, invoice.client)
  const hosted = await getIntegrations(ctx).payments.createHostedInvoice(toInvoiceRecord(invoice), toLineRecords(invoice.lines), toClientRecord(client))

  await ctx.prisma.invoice.updateMany({ where: { id: invoice.id, stripeInvoiceId: null }, data: { stripeInvoiceId: hosted.stripeInvoiceId, paymentUrl: hosted.paymentUrl } })

  return hosted
}

const createHostedInvoice: OutboxHandler = async (ctx, job) => {
  const { invoiceId } = invoicePayload.parse(job.payload)
  const orgId = requireOrg(job)
  const invoice = await loadInvoice(ctx, orgId, invoiceId)

  // Already sent (or paid), or voided: the void handler deals with a hosted copy
  if (!invoice || invoice.status !== 'SYNCED') return

  const hosted = await ensureHostedInvoice(ctx, invoice)

  // Voided while the hosted invoice was being created: hand it to the void path instead of emailing a dead pay link
  const fresh = await ctx.prisma.invoice.findUnique({ where: { id: invoice.id }, select: { status: true } })

  if (fresh?.status === 'VOID') return markSent(ctx, invoice)

  const org = await ctx.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { name: true } })

  // Email before the status flips: a retry after a failure in between may email twice, but "SENT and never emailed" cannot happen
  await ctx.mailer.send(
    invoiceEmail({
      to: invoice.client.billingEmail,
      orgName: org.name,
      clientName: invoice.client.legalName,
      invoiceNumber: invoice.invoiceNumber,
      total: moneyRequired(invoice.total),
      dueDate: fromDateOnly(invoice.dueDate),
      paymentUrl: hosted.paymentUrl
    })
  )
  await markSent(ctx, invoice)
}

const voidHostedInvoice: OutboxHandler = async (ctx, job) => {
  const { invoiceId } = invoicePayload.parse(job.payload)
  const invoice = await ctx.prisma.invoice.findFirst({ where: { id: invoiceId, orgId: requireOrg(job) }, select: { stripeInvoiceId: true } })

  if (!invoice?.stripeInvoiceId) return

  await getIntegrations(ctx).payments.voidHostedInvoice(invoice.stripeInvoiceId)
}

// ---------------------------------------------------------------------------

/** Every failed attempt leaves an audit row (job type and attempt only: provider messages stay in the outbox row). */
const withFailureAudit =
  (handler: OutboxHandler): OutboxHandler =>
  async (ctx, job) => {
    try {
      await handler(ctx, job)
    } catch (error) {
      const target = invoicePayload.safeParse(job.payload)

      if (target.success && job.orgId) {
        await systemAudit(ctx, { id: target.data.invoiceId, orgId: job.orgId }, 'sync_failed', {
          jobType: job.type,
          attempt: job.attempts,
          maxAttempts: job.maxAttempts,
          exhausted: job.attempts >= job.maxAttempts,
          error: error instanceof Error ? error.name : 'Error'
        }).catch(auditError => ctx.log.error({ err: auditError }, 'could not audit a failed sync'))
      }

      throw error
    }
  }

export const invoiceOutboxHandlers: Record<string, OutboxHandler> = {
  [JOB_TYPES.syncInvoice]: withFailureAudit(syncInvoice),
  [JOB_TYPES.voidInvoice]: withFailureAudit(voidAccountingInvoice),
  [JOB_TYPES.postPayment]: withFailureAudit(postPayment),
  [JOB_TYPES.createHostedInvoice]: withFailureAudit(createHostedInvoice),
  [JOB_TYPES.voidHostedInvoice]: withFailureAudit(voidHostedInvoice)
}
