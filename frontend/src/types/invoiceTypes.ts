/**
 * FilterGO portal: invoices (`/v1/invoices`). Mirrors backend/src/modules/invoices/serializers.ts.
 *
 * Money is a string with two decimals ("279.00"), `qty` a string with four ("7.5000"), dates "YYYY-MM-DD" and instants
 * ISO strings. Fields marked ADMIN-only are left out entirely for a CLIENT_USER, never sent as null.
 */

export type InvoiceStatus = 'DRAFT' | 'APPROVED' | 'SYNCED' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'VOID'

export type InvoiceLineSource = 'TIMESHEET' | 'SHIFT' | 'CONTRACT_LINE' | 'MANUAL'

/** How far an integration got, from the invoice's outbox jobs. DEAD means it gave up and needs a retry. */
export type SyncState = 'NONE' | 'PENDING' | 'DONE' | 'DEAD'

export type SyncChannel = { state: SyncState; lastError: string | null }

export type InvoiceSync = { accounting: SyncChannel; payment: SyncChannel }

export type InvoiceFlags = { unapprovedTimesheets: number; noShows: number }

export type InvoiceSummary = {
  id: string
  invoiceNumber: string
  status: InvoiceStatus
  client: { id: string; legalName: string }
  contract: { id: string; contractNumber: string; version: number }
  periodStart: string
  periodEnd: string
  issueDate: string
  dueDate: string
  subtotal: string
  tax: string
  total: string
  amountPaid: string
  balance: string
  paymentUrl: string | null
  sentAt: string | null
  paidAt: string | null
  createdAt: string
  updatedAt: string

  // ADMIN only
  flags?: InvoiceFlags
  notes?: string | null
  accountingRef?: string | null
  accountingSyncedAt?: string | null
  stripeInvoiceId?: string | null
  approvedById?: string | null
  approvedAt?: string | null
  createdById?: string
  sync?: InvoiceSync
}

export type InvoiceLine = {
  id: string
  siteId: string | null
  siteName: string | null
  description: string
  qty: string
  amount: string
  taxCode: string | null
  taxAmount: string

  // ADMIN only
  sourceType?: InvoiceLineSource
  sourceId?: string | null
  unitRate?: string
}

/** Lines of one site with its subtotal; the group without a site comes last. */
export type InvoiceSiteGroup = {
  siteId: string | null
  siteName: string | null
  subtotal: string
  tax: string
  lines: InvoiceLine[]
}

export type InvoicePayment = {
  id: string
  amount: string
  method: string
  receivedAt: string

  // ADMIN only
  externalRef?: string | null

  /** Null when the payment came through Stripe or the system. */
  recordedById?: string | null
  accountingSyncedAt?: string | null
  createdAt?: string
}

export type InvoiceDetail = InvoiceSummary & {
  sites: InvoiceSiteGroup[]
  payments: InvoicePayment[]
}

export type InvoiceFilters = {
  page?: number
  limit?: number
  status?: InvoiceStatus
  clientId?: string
  contractId?: string

  /** Issue date range, inclusive. */
  from?: string
  to?: string

  /** Part of an invoice number. */
  q?: string
}

// ---- inputs -----------------------------------------------------------------------

export type RunInput = { contractId: string; periodStart: string; periodEnd: string }

export type InvoicePatch = { dueDate?: string; notes?: string | null }

export type ManualLineInput = {
  description: string
  qty: string
  unitRate: string
  siteId?: string
  taxCode?: string
}

export type PaymentInput = {
  amount: string
  method: string

  /** ISO instant; the server uses now when it is left out. */
  receivedAt?: string
  externalRef?: string
}

// ---- trace (ADMIN) ----------------------------------------------------------------

export type TracePoint = { at: string | null; lat: number | null; lng: number | null }

export type TraceLine = {
  lineId: string
  sourceType: InvoiceLineSource
  sourceId: string | null
  description: string
  qty: string
  unitRate: string
  amount: string
  taxAmount: string
  timesheet: {
    id: string
    status: string
    worker: { id: string; name: string | null }
    clockIn: TracePoint | null
    clockOut: TracePoint | null
    breakMinutes: number
    scheduledMinutes: number
    actualMinutes: number | null
    billable: boolean
    autoClosed: boolean
    billRateSnapshot: string | null
    approvedById: string | null
    approvedAt: string | null
  } | null
  shift: {
    id: string
    siteId: string
    siteName: string
    scheduledStart: string
    scheduledEnd: string
    status: string
    isExtra: boolean
    notes: string | null
  } | null
  schedule: { id: string; periodStart: string; periodEnd: string; status: string; contractVersion: number } | null
  contract: { id: string; number: string; version: number } | null
  lead: { id: string; companyName: string; contactName: string | null; source: string; status: string } | null
  workLogPhotos: Array<{ workLogId: string; fileId: string; at: string }>
}

export type InvoiceTrace = {
  invoice: { id: string; invoiceNumber: string; status: InvoiceStatus; contractId: string }
  lines: TraceLine[]
}
