import type { InvoiceFilters, InvoiceSummary } from '@/types/invoiceTypes'

import { MAX_PAGE_SIZE, fetchInvoicePage } from '@/libs/api/queries/invoices'

/** Exports stop here rather than hammering the API; narrow the filters for more. */
export const EXPORT_CAP = 5000

/** Every invoice matching `filters` (paging/limit ignored), up to `cap`; `truncated` says whether more existed. */
export const fetchAllInvoices = async (
  filters: InvoiceFilters,
  cap = EXPORT_CAP
): Promise<{ items: InvoiceSummary[]; total: number; truncated: boolean }> => {
  const first = await fetchInvoicePage({ ...filters, page: 1, limit: MAX_PAGE_SIZE })
  const pages = Math.min(first.meta.totalPages, Math.ceil(cap / MAX_PAGE_SIZE))
  const items = [...first.items]

  // One page at a time: an export is rare, and this keeps it well inside the proxy's rate limit
  for (let page = 2; page <= pages; page++) {
    items.push(...(await fetchInvoicePage({ ...filters, page, limit: MAX_PAGE_SIZE })).items)
  }

  return { items: items.slice(0, cap), total: first.meta.total, truncated: first.meta.total > cap }
}

/** Run `task` over `items`, `width` at a time, reporting progress; results keep the input order. */
export const mapPooled = async <T, R>(
  items: T[],
  width: number,
  task: (item: T) => Promise<R>,
  onProgress?: (done: number) => void
): Promise<R[]> => {
  const results: R[] = new Array(items.length)
  let next = 0
  let done = 0

  const worker = async () => {
    while (next < items.length) {
      const index = next++

      results[index] = await task(items[index])
      onProgress?.(++done)
    }
  }

  await Promise.all(Array.from({ length: Math.min(width, items.length) }, worker))

  return results
}
