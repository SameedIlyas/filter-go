// Third-party Imports
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// Type Imports
import type { PageMeta } from '@/types/api'
import type {
  InvoiceDetail,
  InvoiceFilters,
  InvoicePatch,
  InvoiceSummary,
  InvoiceTrace,
  ManualLineInput,
  PaymentInput,
  RunInput
} from '@/types/invoiceTypes'

// Lib Imports
import { queryKeys } from '@/libs/react-query/query-keys'

import { bff } from '../bff'
import type { Query } from '../bff'

/*
 * Invoices (docs/ARCHITECTURE.md 7): runs from approved timesheets, draft edits, approval, accounting sync, send with a
 * pay link, payments, void, and the trace behind each line. Every write answers with the fresh detail, which goes
 * straight into the detail cache. Runs, deletes, voids and removed lines also move timesheet entries between APPROVED
 * and INVOICED, so those refresh the timesheet caches too.
 */

/** The server's page size cap; exports page through the list with it. */
export const MAX_PAGE_SIZE = 100

const emptyMeta = (count: number): PageMeta => ({ page: 1, limit: count, total: count, totalPages: 1 })

type Paged<T> = { items: T[]; meta: PageMeta }

/** A query object without undefined/empty values, so equal filters share one cache key. */
const clean = (query: object): Query =>
  Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ) as Query

/** While an integration is still working (sync, pay link), the status moves on its own; poll until it settles. */
const POLL_MS = 4000

export const isSettling = (invoice: Pick<InvoiceSummary, 'status' | 'sync'> | undefined) => {
  if (!invoice) return false

  // A client user gets no sync state: an approved invoice moves on by itself, so keep watching it
  if (!invoice.sync) return invoice.status === 'APPROVED'

  // A dead job waits for a person to retry it; polling would never see a change
  return invoice.sync.accounting.state === 'PENDING' || invoice.sync.payment.state === 'PENDING'
}

/** Only an https link may become an href (a pay link comes from the payment provider, but never trust it blindly). */
export const safePayUrl = (url: string | null | undefined): string | null =>
  url && /^https:\/\//i.test(url) ? url : null

// ---- reads ----------------------------------------------------------------------------

export const fetchInvoicePage = async (
  filters: InvoiceFilters,
  signal?: AbortSignal
): Promise<Paged<InvoiceSummary>> => {
  const { data, meta } = await bff<{ invoices: InvoiceSummary[] }>('invoices', { query: clean(filters), signal })

  return { items: data.invoices, meta: meta ?? emptyMeta(data.invoices.length) }
}

export const useInvoicesQuery = (filters: InvoiceFilters, enabled = true) =>
  useQuery({
    queryKey: queryKeys.invoices.list(clean(filters)),
    enabled,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => fetchInvoicePage(filters, signal),
    refetchInterval: query => (query.state.data?.items.some(isSettling) ? POLL_MS : false)
  })

export const useInvoiceQuery = (id: string | null | undefined) =>
  useQuery({
    queryKey: queryKeys.invoices.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async ({ signal }) => (await bff<{ invoice: InvoiceDetail }>(`invoices/${id}`, { signal })).data.invoice,
    refetchInterval: query => (isSettling(query.state.data) ? POLL_MS : false)
  })

export const fetchInvoiceTrace = async (id: string, signal?: AbortSignal) =>
  (await bff<InvoiceTrace>(`invoices/${id}/trace`, { signal })).data

/** ADMIN only: every line with its timesheet, shift, schedule, contract and lead. */
export const useInvoiceTrace = (id: string | null | undefined, enabled = true) =>
  useQuery({
    queryKey: queryKeys.invoices.trace(id ?? ''),
    enabled: Boolean(id) && enabled,
    queryFn: ({ signal }) => fetchInvoiceTrace(id ?? '', signal)
  })

/** The issuing organization, for the "Bill from" block. */
export const useOrgQuery = () =>
  useQuery({
    queryKey: queryKeys.invoices.org(),
    staleTime: 10 * 60 * 1000,
    queryFn: async ({ signal }) =>
      (await bff<{ org: { id: string; name: string; timezone: string } }>('org', { signal })).data.org
  })

// ---- writes ---------------------------------------------------------------------------

/** Store the detail a write answered with, then refresh the lists (and the timesheets when entries moved). */
const useInvoiceWriteback = () => {
  const queryClient = useQueryClient()

  return (invoice: InvoiceDetail | null, { timesheets = false }: { timesheets?: boolean } = {}) => {
    if (invoice) queryClient.setQueryData(queryKeys.invoices.detail(invoice.id), invoice)
    void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.lists() })

    if (invoice) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoices.trace(invoice.id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.contracts.audit('invoice', invoice.id) })
    }

    if (timesheets) void queryClient.invalidateQueries({ queryKey: queryKeys.timesheets.all() })
  }
}

type DetailResponse = { invoice: InvoiceDetail }

export const useRunInvoice = () => {
  const writeback = useInvoiceWriteback()

  return useMutation({
    mutationFn: async (input: RunInput) =>
      (await bff<DetailResponse>('invoices/runs', { method: 'POST', body: input })).data.invoice,
    onSuccess: invoice => writeback(invoice, { timesheets: true })
  })
}

export const useUpdateInvoice = (id: string) => {
  const writeback = useInvoiceWriteback()

  return useMutation({
    mutationFn: async (patch: InvoicePatch) =>
      (await bff<DetailResponse>(`invoices/${id}`, { method: 'PATCH', body: patch })).data.invoice,
    onSuccess: invoice => writeback(invoice)
  })
}

export const useAddInvoiceLine = (id: string) => {
  const writeback = useInvoiceWriteback()

  return useMutation({
    mutationFn: async (input: ManualLineInput) =>
      (await bff<DetailResponse>(`invoices/${id}/lines`, { method: 'POST', body: input })).data.invoice,
    onSuccess: invoice => writeback(invoice)
  })
}

export const useRemoveInvoiceLine = (id: string) => {
  const writeback = useInvoiceWriteback()

  return useMutation({
    mutationFn: async (lineId: string) =>
      (await bff<DetailResponse>(`invoices/${id}/lines/${lineId}`, { method: 'DELETE' })).data.invoice,
    onSuccess: invoice => writeback(invoice, { timesheets: true })
  })
}

export const useDeleteInvoice = () => {
  const queryClient = useQueryClient()
  const writeback = useInvoiceWriteback()

  return useMutation({
    mutationFn: async (id: string) =>
      (await bff<{ deleted: true; id: string }>(`invoices/${id}`, { method: 'DELETE' })).data,
    onSuccess: ({ id }) => {
      queryClient.removeQueries({ queryKey: queryKeys.invoices.detail(id) })
      writeback(null, { timesheets: true })
    }
  })
}

/** The body-less lifecycle steps. `send` answers 202: the status turns SENT once the pay link has been emailed. */
export type InvoiceStep = 'approve' | 'send' | 'retry-sync'

export const useInvoiceStep = () => {
  const writeback = useInvoiceWriteback()

  return useMutation({
    mutationFn: async ({ id, step }: { id: string; step: InvoiceStep }) =>
      (await bff<DetailResponse>(`invoices/${id}/${step}`, { method: 'POST', body: {} })).data.invoice,
    onSuccess: invoice => writeback(invoice)
  })
}

export const useVoidInvoice = () => {
  const writeback = useInvoiceWriteback()

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      (await bff<DetailResponse>(`invoices/${id}/void`, { method: 'POST', body: { reason } })).data.invoice,
    onSuccess: invoice => writeback(invoice, { timesheets: true })
  })
}

export const useRecordPayment = (id: string) => {
  const writeback = useInvoiceWriteback()

  return useMutation({
    mutationFn: async (input: PaymentInput) =>
      (await bff<DetailResponse>(`invoices/${id}/payments`, { method: 'POST', body: input })).data.invoice,
    onSuccess: invoice => writeback(invoice)
  })
}
