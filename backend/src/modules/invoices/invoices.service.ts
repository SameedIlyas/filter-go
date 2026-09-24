import type { AppContext, ClientMeta } from '../../context.js'
import type { Invoice, Prisma } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import type { Decimal } from '../../lib/money.js'
import { fromDateOnly, toDateOnly } from '../../lib/time.js'
import { enqueue } from '../../jobs/outbox.js'
import { recordAudit } from '../audit/record.js'
import { findTaxRates, lockInvoice, recomputeInvoiceTotals, releaseEntryOfRemovedLine, releaseInvoiceEntries } from './invoice-db.js'
import { assertTotalsFit, fitsColumn, priceLine, totalsOf } from './invoice-math.js'
import { assertEditable, assertTransition } from './invoice-state.js'
import { JOB_TYPES, keyPrefix, syncKeys } from './sync-state.js'

type Tx = Prisma.TransactionClient

const audit = (tx: Tx, actor: Actor, invoice: Pick<Invoice, 'id'>, action: string, diff: Prisma.InputJsonValue, meta?: ClientMeta) =>
  recordAudit(tx, actor, { entity: 'invoice', entityId: invoice.id, action, diff, meta })

// ---------------------------------------------------------------------------
// Draft edits (money is immutable after approval)
// ---------------------------------------------------------------------------

export interface DraftPatch {
  dueDate?: string
  notes?: string | null
}

export const updateDraft = async (ctx: AppContext, actor: Actor, id: string, patch: DraftPatch, meta?: ClientMeta): Promise<void> => {
  await ctx.prisma.$transaction(async tx => {
    const invoice = await lockInvoice(tx, actor.orgId, id)

    assertEditable(invoice.status)

    if (patch.dueDate !== undefined && toDateOnly(patch.dueDate) < invoice.issueDate) {
      throw Errors.invalidField('dueDate', 'before_issue_date', 'The due date cannot be before the issue date.')
    }

    await tx.invoice.update({
      where: { id },
      data: { ...(patch.dueDate !== undefined ? { dueDate: toDateOnly(patch.dueDate) } : {}), ...(patch.notes !== undefined ? { notes: patch.notes } : {}) }
    })
    await audit(
      tx,
      actor,
      invoice,
      'updated',
      {
        before: { dueDate: fromDateOnly(invoice.dueDate), notes: invoice.notes },
        after: { dueDate: patch.dueDate ?? fromDateOnly(invoice.dueDate), notes: patch.notes === undefined ? invoice.notes : patch.notes }
      },
      meta
    )
  })
}

export interface ManualLineInput {
  description: string
  qty: Decimal
  unitRate: Decimal
  siteId?: string
  taxCode?: string
}

/** The site of a manual line must be one of the invoice's client (never trust an id from a body). */
const assertClientSite = async (tx: Tx, invoice: Invoice, siteId: string | undefined): Promise<void> => {
  if (siteId === undefined) return

  const site = await tx.site.findFirst({ where: { id: siteId, orgId: invoice.orgId, clientId: invoice.clientId }, select: { id: true } })

  if (!site) throw Errors.invalidField('siteId', 'site_not_found', 'That site does not belong to the invoice\'s client.')
}

export const addManualLine = async (ctx: AppContext, actor: Actor, id: string, input: ManualLineInput, meta?: ClientMeta): Promise<void> => {
  await ctx.prisma.$transaction(async tx => {
    const invoice = await lockInvoice(tx, actor.orgId, id)

    assertEditable(invoice.status)
    await assertClientSite(tx, invoice, input.siteId)

    const rates = await findTaxRates(tx, actor.orgId, [input.taxCode ?? null])
    const ratePercent = input.taxCode === undefined ? null : (rates.get(input.taxCode) ?? null)

    if (input.taxCode !== undefined && ratePercent === null) throw Errors.invalidField('taxCode', 'tax_code_not_found', 'That tax code does not exist.')

    const priced = priceLine(input.qty, input.unitRate, ratePercent)

    if (!fitsColumn(priced.amount)) throw Errors.invalidField('qty', 'amount_too_large', 'This line amount is too large.')

    const line = await tx.invoiceLine.create({
      data: {
        invoiceId: id,
        siteId: input.siteId ?? null,
        sourceType: 'MANUAL',
        description: input.description,
        qty: input.qty,
        unitRate: input.unitRate,
        amount: priced.amount,
        taxCode: input.taxCode ?? null,
        taxAmount: priced.taxAmount
      }
    })
    const totals = await recomputeInvoiceTotals(tx, id)

    await audit(
      tx,
      actor,
      invoice,
      'line_added',
      { lineId: line.id, description: line.description, qty: line.qty.toFixed(4), unitRate: line.unitRate.toFixed(2), amount: priced.amount.toFixed(2), taxAmount: priced.taxAmount.toFixed(2), total: totals.total.toFixed(2) },
      meta
    )
  })
}

export const removeLine = async (ctx: AppContext, actor: Actor, id: string, lineId: string, meta?: ClientMeta): Promise<void> => {
  await ctx.prisma.$transaction(async tx => {
    const invoice = await lockInvoice(tx, actor.orgId, id)

    assertEditable(invoice.status)

    const line = await tx.invoiceLine.findFirst({ where: { id: lineId, invoiceId: id } })

    if (!line) throw Errors.notFound('invoice line')

    await tx.invoiceLine.delete({ where: { id: lineId } })
    await releaseEntryOfRemovedLine(tx, invoice, line)

    const totals = await recomputeInvoiceTotals(tx, id)

    await audit(
      tx,
      actor,
      invoice,
      'line_removed',
      { lineId, sourceType: line.sourceType, sourceId: line.sourceId, description: line.description, amount: line.amount.toFixed(2), total: totals.total.toFixed(2) },
      meta
    )
  })
}

export const deleteDraft = async (ctx: AppContext, actor: Actor, id: string, meta?: ClientMeta): Promise<void> => {
  await ctx.prisma.$transaction(async tx => {
    const invoice = await lockInvoice(tx, actor.orgId, id)

    assertEditable(invoice.status)

    const released = await releaseInvoiceEntries(tx, invoice)

    await tx.invoice.delete({ where: { id } })
    await audit(tx, actor, invoice, 'deleted', { invoiceNumber: invoice.invoiceNumber, total: invoice.total.toFixed(2), releasedTimesheets: released }, meta)
  })
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** DRAFT -> APPROVED. The accounting sync is enqueued in the same transaction, so an approval can never lose its sync. */
export const approveInvoice = async (ctx: AppContext, actor: Actor, id: string, meta?: ClientMeta): Promise<void> => {
  await ctx.prisma.$transaction(async tx => {
    const invoice = await lockInvoice(tx, actor.orgId, id)

    assertTransition(invoice.status, 'APPROVED')

    const lines = await tx.invoiceLine.findMany({ where: { invoiceId: id }, select: { amount: true, taxAmount: true } })
    const totals = totalsOf(lines)

    if (lines.length === 0) throw Errors.unprocessable('An invoice needs at least one line before it can be approved.')
    assertTotalsFit(totals)
    if (totals.total.lte(0)) throw Errors.unprocessable('An invoice must have a total greater than zero to be approved.')

    // The lines are the truth: the header is re-derived from them at the moment the money is frozen
    const updated = await tx.invoice.updateMany({
      where: { id, orgId: actor.orgId, status: 'DRAFT' },
      data: { status: 'APPROVED', subtotal: totals.subtotal, tax: totals.tax, total: totals.total, approvedById: actor.id, approvedAt: new Date() }
    })

    if (updated.count !== 1) throw Errors.conflict('The invoice changed while it was being approved. Reload and try again.')

    await enqueue(tx, { orgId: actor.orgId, type: JOB_TYPES.syncInvoice, payload: { invoiceId: id }, dedupeKey: syncKeys.sync(id) })
    await audit(tx, actor, invoice, 'approved', { invoiceNumber: invoice.invoiceNumber, subtotal: totals.subtotal.toFixed(2), tax: totals.tax.toFixed(2), total: totals.total.toFixed(2), lines: lines.length }, meta)
  })
}

/** VOID from DRAFT/APPROVED/SYNCED/SENT with no payments. Entries return to APPROVED; provider objects are voided by the outbox. */
export const voidInvoice = async (ctx: AppContext, actor: Actor, id: string, reason: string, meta?: ClientMeta): Promise<void> => {
  await ctx.prisma.$transaction(async tx => {
    const invoice = await lockInvoice(tx, actor.orgId, id)

    assertTransition(invoice.status, 'VOID')

    const payments = await tx.payment.count({ where: { invoiceId: id } })

    if (payments > 0 || invoice.amountPaid.gt(0)) throw Errors.conflict('An invoice that has received a payment cannot be voided.')

    const updated = await tx.invoice.updateMany({ where: { id, orgId: actor.orgId, status: invoice.status }, data: { status: 'VOID' } })

    if (updated.count !== 1) throw Errors.conflict('The invoice changed while it was being voided. Reload and try again.')

    const released = await releaseInvoiceEntries(tx, invoice)

    if (invoice.accountingRef) {
      await enqueue(tx, { orgId: actor.orgId, type: JOB_TYPES.voidInvoice, payload: { invoiceId: id }, dedupeKey: syncKeys.void(id) })
    }

    if (invoice.stripeInvoiceId) {
      await enqueue(tx, { orgId: actor.orgId, type: JOB_TYPES.voidHostedInvoice, payload: { invoiceId: id }, dedupeKey: syncKeys.voidHosted(id) })
    }

    await audit(tx, actor, invoice, 'voided', { from: invoice.status, reason, releasedTimesheets: released }, meta)
  })
}

/** Only a SYNCED invoice can be sent. The status flips to SENT when the handler has created the pay link and emailed it. */
export const requestSend = async (ctx: AppContext, actor: Actor, id: string, meta?: ClientMeta): Promise<void> => {
  await ctx.prisma.$transaction(async tx => {
    const invoice = await lockInvoice(tx, actor.orgId, id)

    assertTransition(invoice.status, 'SENT')

    await enqueue(tx, { orgId: actor.orgId, type: JOB_TYPES.createHostedInvoice, payload: { invoiceId: id }, dedupeKey: syncKeys.send(id) })
    await audit(tx, actor, invoice, 'send_requested', { invoiceNumber: invoice.invoiceNumber }, meta)
  })
}

/** Puts the invoice's dead outbox jobs back in the queue with a fresh attempt budget. */
export const retrySync = async (ctx: AppContext, actor: Actor, id: string, meta?: ClientMeta): Promise<void> => {
  await ctx.prisma.$transaction(async tx => {
    const invoice = await lockInvoice(tx, actor.orgId, id)
    const rearmed = await tx.outboxJob.updateMany({
      where: { orgId: actor.orgId, status: 'DEAD', dedupeKey: { startsWith: keyPrefix(id) } },
      data: { status: 'PENDING', attempts: 0, runAt: new Date(), lockedUntil: null }
    })

    if (rearmed.count === 0) throw Errors.conflict('There is no failed sync for this invoice to retry.')

    await audit(tx, actor, invoice, 'sync_retried', { rearmed: rearmed.count }, meta)
  })
}
