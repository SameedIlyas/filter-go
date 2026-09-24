import type { AppContext } from '../../context.js'
import type { InvoiceStatus, Prisma } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import { pageArgs, pageMeta } from '../../lib/pagination.js'
import type { PageQuery } from '../../lib/pagination.js'
import type { Db } from '../../lib/prisma.js'
import { toDateOnly } from '../../lib/time.js'
import { CLIENT_VISIBLE_STATUSES } from './invoice-state.js'
import { groupLinesBySite, serializeInvoice, serializePayment } from './serializers.js'
import { loadSyncStates } from './sync-state.js'

/**
 * Who sees which invoices (docs/ARCHITECTURE.md 7.2):
 *   ADMIN         every invoice of their organization
 *   CLIENT_USER   only their own client's invoices, and only APPROVED..PAID (never DRAFT or VOID)
 * Anything outside that is indistinguishable from a missing invoice (404). Other roles never reach here (route guard).
 */
export const visibilityWhere = (actor: Actor): Prisma.InvoiceWhereInput => {
  if (actor.role === 'ADMIN') return { orgId: actor.orgId }

  if (actor.role === 'CLIENT_USER' && actor.clientId) {
    return { orgId: actor.orgId, clientId: actor.clientId, status: { in: CLIENT_VISIBLE_STATUSES } }
  }

  // No client, no invoices. Matches nothing rather than everything.
  return { orgId: actor.orgId, id: { in: [] } }
}

const HEADER_INCLUDE = {
  client: { select: { id: true, legalName: true } },
  contract: { select: { id: true, contractNumber: true, version: true } }
} satisfies Prisma.InvoiceInclude

export interface InvoiceListQuery extends PageQuery {
  status?: InvoiceStatus
  clientId?: string
  contractId?: string
  from?: string
  to?: string
  q?: string
}

const filtersOf = (query: InvoiceListQuery): Prisma.InvoiceWhereInput => ({
  ...(query.status ? { status: query.status } : {}),
  ...(query.clientId ? { clientId: query.clientId } : {}),
  ...(query.contractId ? { contractId: query.contractId } : {}),
  ...(query.from || query.to
    ? { issueDate: { ...(query.from ? { gte: toDateOnly(query.from) } : {}), ...(query.to ? { lte: toDateOnly(query.to) } : {}) } }
    : {}),
  ...(query.q ? { invoiceNumber: { contains: query.q, mode: 'insensitive' as const } } : {})
})

export const listInvoices = async (ctx: AppContext, actor: Actor, query: InvoiceListQuery) => {
  const where: Prisma.InvoiceWhereInput = { AND: [visibilityWhere(actor), filtersOf(query)] }
  const [total, rows] = await Promise.all([
    ctx.prisma.invoice.count({ where }),
    ctx.prisma.invoice.findMany({
      where,
      include: HEADER_INCLUDE,
      orderBy: [{ issueDate: 'desc' }, { invoiceNumber: 'desc' }],
      ...pageArgs(query)
    })
  ])
  const syncs = actor.role === 'ADMIN' ? await loadSyncStates(ctx.prisma, actor.orgId, rows.map(row => row.id)) : new Map()

  return { items: rows.map(row => serializeInvoice(row, actor, syncs.get(row.id))), meta: pageMeta(query, total) }
}

/** The invoice with everything the detail view needs, or 404. */
export const findVisibleInvoice = async (db: Db, actor: Actor, id: string) => {
  const invoice = await db.invoice.findFirst({
    where: { AND: [{ id }, visibilityWhere(actor)] },
    include: { ...HEADER_INCLUDE, lines: { include: { site: { select: { name: true } } } }, payments: { orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }] } }
  })

  if (!invoice) throw Errors.notFound('invoice')

  return invoice
}

export const getInvoiceDetail = async (ctx: AppContext, actor: Actor, id: string) => {
  const { lines, payments, ...header } = await findVisibleInvoice(ctx.prisma, actor, id)
  const sync = actor.role === 'ADMIN' ? (await loadSyncStates(ctx.prisma, actor.orgId, [id])).get(id) : undefined

  return { ...serializeInvoice(header, actor, sync), sites: groupLinesBySite(lines, actor), payments: payments.map(payment => serializePayment(payment, actor)) }
}
