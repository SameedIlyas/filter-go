// React Imports
import { useCallback, useMemo } from 'react'

// Next Imports
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

// Type Imports
import type { InvoiceFilters, InvoiceStatus } from '@/types/invoiceTypes'

import { INVOICE_STATUSES } from '../logic/labels'
import { isDay } from '../logic/period'

export type InvoiceParams = {
  filters: Required<Pick<InvoiceFilters, 'page' | 'limit'>> & Omit<InvoiceFilters, 'page' | 'limit'>

  /** The invoice open in the drawer. */
  openId: string | null

  /** Any filter beyond the defaults. */
  filtered: boolean
}

const PAGE_SIZES = [10, 20, 50, 100]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const statusOf = (value: string | null): InvoiceStatus | undefined =>
  INVOICE_STATUSES.includes(value as InvoiceStatus) ? (value as InvoiceStatus) : undefined

const dayOf = (value: string | null): string | undefined => (value && isDay(value) ? value : undefined)

/**
 * The list's filters (`q`, `status`, `clientId`, `from`, `to`), paging (`page`, `limit`) and the open invoice (`open`)
 * live in the URL, so a filtered list or a single invoice can be bookmarked and shared. Filter writes go back to page 1.
 */
export const useInvoiceParams = () => {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const state = useMemo<InvoiceParams>(() => {
    const limit = Number(params.get('limit'))

    const filters = {
      page: Math.max(1, Number(params.get('page')) || 1),
      limit: PAGE_SIZES.includes(limit) ? limit : 20,
      q: params.get('q')?.trim().slice(0, 50) || undefined,
      status: statusOf(params.get('status')),
      clientId: UUID.test(params.get('clientId') ?? '') ? (params.get('clientId') ?? undefined) : undefined,
      from: dayOf(params.get('from')),
      to: dayOf(params.get('to'))
    }

    return {
      filters,
      openId: params.get('open'),
      filtered: Boolean(filters.q || filters.status || filters.clientId || filters.from || filters.to)
    }
  }, [params])

  const write = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString())

      Object.entries(patch).forEach(([key, value]) =>
        value === null || value === '' ? next.delete(key) : next.set(key, value)
      )

      const search = next.toString()

      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false })
    },
    [params, pathname, router]
  )

  /** Change filters; back to the first page. */
  const update = useCallback((patch: Record<string, string | null>) => write({ ...patch, page: null }), [write])

  const clear = useCallback(
    () => write({ q: null, status: null, clientId: null, from: null, to: null, page: null }),
    [write]
  )

  return {
    ...state,
    pageSizes: PAGE_SIZES,
    update,
    clear,
    setPage: (page: number) => write({ page: page > 1 ? String(page) : null }),
    setLimit: (limit: number) => write({ limit: String(limit), page: null }),
    open: (id: string | null) => write({ open: id })
  }
}
