import type { BoardResponse, BoardShift, ShiftStatus } from '@/types/scheduleTypes'

import type { BoardView } from './boardWindow'
import { dayKeyIn, formatTimeIn, minutesBetween } from './zoned'

export type BoardCounts = BoardResponse['counts']

/** Row key of the pinned "Unassigned" row in the By staff view. */
export const UNASSIGNED_ROW = '__unassigned__'

/** rowKey -> dayKey -> shifts (start order). */
export type PlacedRows = Map<string, Map<string, BoardShift[]>>

export type Placement = {
  rows: PlacedRows

  /** Scheduled minutes per assignee over the visible days, excluding cancelled shifts. */
  minutesByUser: Map<string, number>
}

const rowKeyOf = (shift: BoardShift, view: BoardView) => (view === 'site' ? shift.siteId : (shift.assignedUser?.id ?? UNASSIGNED_ROW))

/**
 * Buckets shifts into row x day cells. A shift sits on the day it STARTS in its site's timezone (a night shift
 * crossing midnight stays on its first day). Shifts whose local day is not visible are dropped: the request
 * window is padded a day either side so that every visible day is complete in every timezone.
 */
export const placeShifts = (shifts: BoardShift[], days: string[], view: BoardView): Placement => {
  const visible = new Set(days)
  const rows: PlacedRows = new Map()
  const minutesByUser = new Map<string, number>()
  const ordered = [...shifts].sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart) || a.id.localeCompare(b.id))

  for (const shift of ordered) {
    const day = dayKeyIn(shift.scheduledStart, shift.site.timezone)

    if (!visible.has(day)) continue

    const rowKey = rowKeyOf(shift, view)
    const row = rows.get(rowKey) ?? new Map<string, BoardShift[]>()

    row.set(day, [...(row.get(day) ?? []), shift])
    rows.set(rowKey, row)

    if (shift.assignedUser && shift.status !== 'CANCELLED') {
      const minutes = minutesBetween(shift.scheduledStart, shift.scheduledEnd)

      minutesByUser.set(shift.assignedUser.id, (minutesByUser.get(shift.assignedUser.id) ?? 0) + minutes)
    }
  }

  return { rows, minutesByUser }
}

const COUNT_KEY: Record<ShiftStatus, Exclude<keyof BoardCounts, 'total' | 'extra'>> = {
  OPEN: 'open',
  ASSIGNED: 'assigned',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'inProgress',
  COMPLETED: 'completed',
  NO_SHOW: 'noShow',
  CANCELLED: 'cancelled'
}

/**
 * Status counts over the VISIBLE days. The server's counts cover the padded request window (a day either side),
 * so they are only the fallback when the rows were truncated.
 */
export const countVisible = (shifts: BoardShift[], days: string[]): BoardCounts => {
  const visible = new Set(days)

  return shifts.reduce<BoardCounts>(
    (counts, shift) =>
      visible.has(dayKeyIn(shift.scheduledStart, shift.site.timezone))
        ? { ...counts, total: counts.total + 1, [COUNT_KEY[shift.status]]: counts[COUNT_KEY[shift.status]] + 1, extra: counts.extra + (shift.isExtra ? 1 : 0) }
        : counts,
    { total: 0, open: 0, assigned: 0, confirmed: 0, inProgress: 0, completed: 0, noShow: 0, cancelled: 0, extra: 0 }
  )
}

/** The first `limit` shifts of a cell, and how many are behind "+N more". */
export const splitCell = (cell: BoardShift[], limit: number) => ({
  visible: cell.slice(0, limit),
  hidden: Math.max(0, cell.length - limit)
})

/** "18:00 – 02:00 +1" in the site's timezone. */
export const timeRange = (shift: Pick<BoardShift, 'scheduledStart' | 'scheduledEnd' | 'site'>): string => {
  const zone = shift.site.timezone
  const start = formatTimeIn(shift.scheduledStart, zone)
  const end = formatTimeIn(shift.scheduledEnd, zone)
  const startDay = dayKeyIn(shift.scheduledStart, zone)
  const endDay = dayKeyIn(shift.scheduledEnd, zone)
  const spill = Math.round((Date.parse(`${endDay}T00:00:00Z`) - Date.parse(`${startDay}T00:00:00Z`)) / 86_400_000)

  return `${start} – ${end}${spill > 0 ? ` +${spill}` : ''}`
}

/** "37.5h" from minutes. */
export const formatHours = (minutes: number): string => `${Math.round((minutes / 60) * 10) / 10}h`
