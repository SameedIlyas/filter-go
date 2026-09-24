import type { JobStatus } from '../../generated/prisma/client.js'
import type { Db } from '../../lib/prisma.js'

/**
 * How far the integrations got for an invoice, derived from its outbox jobs. Every job of an invoice has a dedupe key
 * starting with `invoice:<invoiceId>:` (see `syncKeys`), which is what ties the jobs back to the invoice.
 */

export type SyncState = 'NONE' | 'PENDING' | 'DONE' | 'DEAD'

export interface SyncChannel {
  state: SyncState
  /** The last error message of the jobs that are pending a retry or dead. Null when nothing failed. */
  lastError: string | null
}

export interface InvoiceSync {
  accounting: SyncChannel
  payment: SyncChannel
}

export const JOB_TYPES = {
  syncInvoice: 'accounting.sync_invoice',
  voidInvoice: 'accounting.void_invoice',
  postPayment: 'accounting.post_payment',
  createHostedInvoice: 'payments.create_invoice',
  voidHostedInvoice: 'payments.void_invoice'
} as const

const ACCOUNTING_TYPES: string[] = [JOB_TYPES.syncInvoice, JOB_TYPES.voidInvoice, JOB_TYPES.postPayment]
const PAYMENT_TYPES: string[] = [JOB_TYPES.createHostedInvoice, JOB_TYPES.voidHostedInvoice]

export const keyPrefix = (invoiceId: string): string => `invoice:${invoiceId}:`

export const syncKeys = {
  sync: (invoiceId: string) => `${keyPrefix(invoiceId)}sync`,
  void: (invoiceId: string) => `${keyPrefix(invoiceId)}void`,
  send: (invoiceId: string) => `${keyPrefix(invoiceId)}send`,
  voidHosted: (invoiceId: string) => `${keyPrefix(invoiceId)}void-hosted`,
  payment: (invoiceId: string, paymentId: string) => `${keyPrefix(invoiceId)}payment:${paymentId}`
}

const SEVERITY: Record<JobStatus, number> = { DEAD: 3, PENDING: 2, DONE: 1 }

interface JobView {
  type: string
  status: JobStatus
  lastError: string | null
}

const channel = (jobs: JobView[]): SyncChannel => {
  if (jobs.length === 0) return { state: 'NONE', lastError: null }

  const worst = jobs.reduce((current, job) => (SEVERITY[job.status] > SEVERITY[current.status] ? job : current))
  const failing = jobs.filter(job => job.status === worst.status && job.lastError !== null)

  return { state: worst.status, lastError: worst.status === 'DONE' ? null : (failing[0]?.lastError ?? null) }
}

/** Sync state of many invoices with one query. Every requested id gets an entry. */
export const loadSyncStates = async (db: Db, orgId: string, invoiceIds: string[]): Promise<Map<string, InvoiceSync>> => {
  if (invoiceIds.length === 0) return new Map()

  const jobs = await db.outboxJob.findMany({
    where: { orgId, OR: invoiceIds.map(id => ({ dedupeKey: { startsWith: keyPrefix(id) } })) },
    select: { type: true, status: true, lastError: true, dedupeKey: true }
  })

  return new Map(
    invoiceIds.map(id => {
      const own = jobs.filter(job => job.dedupeKey?.startsWith(keyPrefix(id)))

      return [
        id,
        {
          accounting: channel(own.filter(job => ACCOUNTING_TYPES.includes(job.type))),
          payment: channel(own.filter(job => PAYMENT_TYPES.includes(job.type)))
        }
      ]
    })
  )
}
