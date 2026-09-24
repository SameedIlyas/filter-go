import { z } from 'zod'

import type { Invoice, InvoiceLine, Payment } from '../../generated/prisma/client.js'
import { canSeeBillRate } from '../../lib/access.js'
import type { Actor } from '../../lib/access.js'
import { moneyRequired, qty4, sum } from '../../lib/money.js'
import { fromDateOnly } from '../../lib/time.js'
import type { InvoiceSync } from './sync-state.js'

/**
 * Explicit whitelists. What a viewer may see is decided here and nowhere else (docs/ARCHITECTURE.md 2.3):
 *   ADMIN         everything, including flags, internal notes, integration ids and sync state
 *   CLIENT_USER   amounts only: no unit rates (a bill rate), no flags, no notes, no integration ids, no sync
 * The keys are omitted for viewers who may not see them, never sent as null.
 */

type Viewer = Pick<Actor, 'role'>

export type InvoiceRow = Invoice & {
  client: { id: string; legalName: string }
  contract: { id: string; contractNumber: string; version: number }
}

export type LineRow = InvoiceLine & { site: { name: string } | null }

const flagsSchema = z.object({ unapprovedTimesheets: z.number().int().default(0), noShows: z.number().int().default(0) })

const flagsOf = (value: unknown) => {
  const parsed = flagsSchema.safeParse(value ?? {})

  return parsed.success ? parsed.data : { unapprovedTimesheets: 0, noShows: 0 }
}

export const serializeInvoice = (invoice: InvoiceRow, viewer: Viewer, sync?: InvoiceSync) => ({
  id: invoice.id,
  invoiceNumber: invoice.invoiceNumber,
  status: invoice.status,
  client: { id: invoice.client.id, legalName: invoice.client.legalName },
  contract: { id: invoice.contract.id, contractNumber: invoice.contract.contractNumber, version: invoice.contract.version },
  periodStart: fromDateOnly(invoice.periodStart),
  periodEnd: fromDateOnly(invoice.periodEnd),
  issueDate: fromDateOnly(invoice.issueDate),
  dueDate: fromDateOnly(invoice.dueDate),
  subtotal: moneyRequired(invoice.subtotal),
  tax: moneyRequired(invoice.tax),
  total: moneyRequired(invoice.total),
  amountPaid: moneyRequired(invoice.amountPaid),
  balance: moneyRequired(invoice.total.minus(invoice.amountPaid)),
  paymentUrl: invoice.paymentUrl,
  sentAt: invoice.sentAt,
  paidAt: invoice.paidAt,
  createdAt: invoice.createdAt,
  updatedAt: invoice.updatedAt,
  ...(canSeeBillRate(viewer)
    ? {
        flags: flagsOf(invoice.flags),
        notes: invoice.notes,
        accountingRef: invoice.accountingRef,
        accountingSyncedAt: invoice.accountingSyncedAt,
        stripeInvoiceId: invoice.stripeInvoiceId,
        approvedById: invoice.approvedById,
        approvedAt: invoice.approvedAt,
        createdById: invoice.createdById,
        ...(sync ? { sync } : {})
      }
    : {})
})

export const serializeLine = (line: LineRow, viewer: Viewer) => ({
  id: line.id,
  siteId: line.siteId,
  siteName: line.site?.name ?? null,
  description: line.description,
  qty: qty4(line.qty),
  amount: moneyRequired(line.amount),
  taxCode: line.taxCode,
  taxAmount: moneyRequired(line.taxAmount),
  ...(canSeeBillRate(viewer) ? { sourceType: line.sourceType, sourceId: line.sourceId, unitRate: moneyRequired(line.unitRate) } : {})
})

export const serializePayment = (payment: Payment, viewer: Viewer) => ({
  id: payment.id,
  amount: moneyRequired(payment.amount),
  method: payment.method,
  receivedAt: payment.receivedAt,
  ...(canSeeBillRate(viewer)
    ? { externalRef: payment.externalRef, recordedById: payment.recordedById, accountingSyncedAt: payment.accountingSyncedAt, createdAt: payment.createdAt }
    : {})
})

const SOURCE_RANK: Record<string, number> = { TIMESHEET: 0, SHIFT: 0, CONTRACT_LINE: 1, MANUAL: 2 }

const dateInDescription = (description: string): string => /(\d{4}-\d{2}-\d{2})$/.exec(description)?.[1] ?? '9999-99-99'

const text = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** Visits by local date, then fixed fees, then manual lines. Lines have no stored order, so this one is deterministic. */
export const compareLines = (a: Pick<LineRow, 'sourceType' | 'description' | 'id'>, b: Pick<LineRow, 'sourceType' | 'description' | 'id'>): number =>
  (SOURCE_RANK[a.sourceType] ?? 3) - (SOURCE_RANK[b.sourceType] ?? 3) ||
  text(dateInDescription(a.description), dateInDescription(b.description)) ||
  text(a.description, b.description) ||
  text(a.id, b.id)

/** Lines grouped by site (site name order, lines without a site last) with an exact per-site subtotal. */
export const groupLinesBySite = (lines: LineRow[], viewer: Viewer) => {
  const groups = new Map<string, LineRow[]>()

  for (const line of lines) groups.set(line.siteId ?? '', [...(groups.get(line.siteId ?? '') ?? []), line])

  return [...groups]
    .map(([siteId, rows]) => ({ siteId, rows: [...rows].sort(compareLines), name: rows[0]?.site?.name ?? null }))
    .sort((a, b) => (a.siteId === '' ? 1 : b.siteId === '' ? -1 : text(a.name ?? '', b.name ?? '') || text(a.siteId, b.siteId)))
    .map(group => ({
      siteId: group.siteId === '' ? null : group.siteId,
      siteName: group.name,
      subtotal: moneyRequired(sum(group.rows.map(line => line.amount))),
      tax: moneyRequired(sum(group.rows.map(line => line.taxAmount))),
      lines: group.rows.map(line => serializeLine(line, viewer))
    }))
}
