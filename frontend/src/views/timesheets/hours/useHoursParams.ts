'use client'

// React Imports
import { useCallback, useMemo } from 'react'

// Next Imports
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { todayKey } from '../../scheduling/logic/zoned'
import { clampWindow, weekOf } from '../logic/window'
import type { DayWindow } from '../logic/window'

const DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * The grid's window and site, kept in the URL as `from`, `to` and `siteId`: the same keys the review list uses,
 * so switching tabs keeps the period. Defaults to the current Monday-start week.
 */
export const useHoursParams = () => {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const fromParam = params.get('from')
  const toParam = params.get('to')
  const siteId = params.get('siteId') ?? ''

  const window = useMemo<DayWindow>(() => {
    if (fromParam && toParam && DAY.test(fromParam) && DAY.test(toParam)) return clampWindow({ from: fromParam, to: toParam })

    return weekOf(todayKey())
  }, [fromParam, toParam])

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString())

      Object.entries(patch).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)))

      // A new window, site or drill-down always starts on the first page of the list it lands on
      next.delete('page')
      router.replace(`${pathname}?${next.toString()}`, { scroll: false })
    },
    [params, pathname, router]
  )

  const setWindow = useCallback((next: DayWindow) => {
    const clamped = clampWindow(next)

    update({ from: clamped.from, to: clamped.to })
  }, [update])

  const setSite = useCallback((id: string) => update({ siteId: id || null }), [update])

  /** Open the review list for one worker over a day range, every status. */
  const drill = useCallback(
    (userId: string, range: DayWindow) => update({ tab: null, status: 'all', userId, from: range.from, to: range.to, exceptions: null }),
    [update]
  )

  /** Open the exception queue for one worker. */
  const showExceptions = useCallback((userId: string) => update({ tab: 'exceptions', userId }), [update])

  return { window, siteId, setWindow, setSite, drill, showExceptions }
}
