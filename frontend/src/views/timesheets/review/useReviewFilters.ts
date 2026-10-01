// React Imports
import { useCallback, useMemo } from 'react'

// Next Imports
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

// Type Imports
import type { TimesheetStatus } from '@/types/timesheetTypes'

import { todayKey } from '../../scheduling/logic/zoned'
import { clampWindow, weekOf } from '../logic/window'
import type { DayWindow } from '../logic/window'
import { TIMESHEET_STATUSES } from '../shared'

/** `status` param: absent = SUBMITTED (what needs review), `all` = no status filter. */
export type StatusChoice = TimesheetStatus | 'all'

export type ReviewFilters = {
  status: StatusChoice
  siteId: string
  userId: string
  window: DayWindow
  openExceptions: boolean

  /** Nothing chosen beyond the defaults (status SUBMITTED, this week). */
  isDefault: boolean
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

const statusOf = (value: string | null): StatusChoice =>
  value === 'all'
    ? 'all'
    : TIMESHEET_STATUSES.includes(value as TimesheetStatus)
      ? (value as TimesheetStatus)
      : 'SUBMITTED'

/**
 * The review filters, kept in the URL next to the container's `tab` and `open` params so a filtered view can be
 * shared and the hours grid can link straight into it. Every write goes back to page 1 (`page` is in the URL too).
 */
export const useReviewFilters = () => {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const filters = useMemo<ReviewFilters>(() => {
    const week = weekOf(todayKey())
    const from = params.get('from')
    const to = params.get('to')
    const window = from && DAY.test(from) ? clampWindow({ from, to: to && DAY.test(to) ? to : from }) : week
    const status = statusOf(params.get('status'))
    const siteId = params.get('siteId') ?? ''
    const userId = params.get('userId') ?? ''
    const openExceptions = params.get('exceptions') === 'open'

    return {
      status,
      siteId,
      userId,
      window,
      openExceptions,
      isDefault:
        status === 'SUBMITTED' &&
        !siteId &&
        !userId &&
        !openExceptions &&
        window.from === week.from &&
        window.to === week.to
    }
  }, [params])

  const page = Math.max(1, Number(params.get('page')) || 1)

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString())

      Object.entries(patch).forEach(([key, value]) =>
        value === null || value === '' ? next.delete(key) : next.set(key, value)
      )
      if (!('page' in patch)) next.delete('page')

      const search = next.toString()

      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false })
    },
    [params, pathname, router]
  )

  const clear = useCallback(
    () => update({ status: null, siteId: null, userId: null, from: null, to: null, exceptions: null }),
    [update]
  )

  return { filters, page, update, clear }
}
