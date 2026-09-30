import type { ShiftStatus } from '@/types/scheduleTypes'

import { addDays, isoWeekday } from './zoned'

export type BoardView = 'staff' | 'site'
export type BoardRange = 'day' | 'week' | 'month'

export const SHIFT_STATUSES: ShiftStatus[] = ['OPEN', 'ASSIGNED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED']

/** Everything the board shows is described by this, and it lives in the URL so a view can be shared or refreshed. */
export type BoardState = {
  view: BoardView
  range: BoardRange

  /** Any day inside the range being shown. */
  anchor: string
  siteIds: string[]
  userIds: string[]
  statuses: ShiftStatus[]
  includeDraft: boolean
}

export const BOARD_DEFAULTS: Omit<BoardState, 'anchor'> = {
  view: 'staff',
  range: 'week',
  siteIds: [],
  userIds: [],
  statuses: [],
  includeDraft: true
}

export type BoardWindow = {

  /** The day columns, in order. */
  days: string[]

  /** The request window: the days plus one day either side, because each shift lands on its SITE's local day. */
  from: string
  to: string
  label: string

  /** "YYYY-MM" of the month being shown (month range only), so cells outside it can be dimmed. */
  month?: string
}

const mondayOf = (dayKey: string) => addDays(dayKey, 1 - isoWeekday(dayKey))

const utcDate = (dayKey: string) => new Date(`${dayKey}T00:00:00Z`)

const format = (dayKey: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(utcDate(dayKey))

const rangeLabel = (first: string, last: string) => {
  const sameYear = first.slice(0, 4) === last.slice(0, 4)
  const start = format(first, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })

  return `${start} – ${format(last, { month: 'short', day: 'numeric', year: 'numeric' })}`
}

const daysFrom = (first: string, count: number) => Array.from({ length: count }, (_, index) => addDays(first, index))

export const boardWindow = (anchor: string, range: BoardRange): BoardWindow => {
  let days: string[]
  let label: string
  let month: string | undefined

  if (range === 'day') {
    days = [anchor]
    label = format(anchor, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  } else if (range === 'week') {
    days = daysFrom(mondayOf(anchor), 7)
    label = rangeLabel(days[0], days[6])
  } else {
    month = anchor.slice(0, 7)

    const first = mondayOf(`${month}-01`)
    const lastOfMonth = addDays(`${shiftMonth(month, 1)}-01`, -1)
    const last = addDays(mondayOf(lastOfMonth), 6)

    days = daysFrom(first, Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000) + 1)
    label = format(`${month}-01`, { month: 'long', year: 'numeric' })
  }

  return {
    days,
    from: `${addDays(days[0], -1)}T00:00:00.000Z`,
    to: `${addDays(days[days.length - 1], 2)}T00:00:00.000Z`,
    label,
    ...(month ? { month } : {})
  }
}

/** "YYYY-MM" moved by `delta` months. */
const shiftMonth = (month: string, delta: number) => {
  const [year, index] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, index - 1 + delta, 1))

  return date.toISOString().slice(0, 7)
}

/** The anchor after pressing ‹ or › : one day, one week or one month (clamped to the month's last day). */
export const shiftAnchor = (anchor: string, range: BoardRange, direction: 1 | -1): string => {
  if (range === 'day') return addDays(anchor, direction)
  if (range === 'week') return addDays(anchor, 7 * direction)

  const target = shiftMonth(anchor.slice(0, 7), direction)
  const lastDay = Number(addDays(`${shiftMonth(target, 1)}-01`, -1).slice(8))

  return `${target}-${String(Math.min(Number(anchor.slice(8)), lastDay)).padStart(2, '0')}`
}

// ---- URL state ----------------------------------------------------------------

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/
const list = (value: string | null) => (value ? value.split(',').filter(Boolean) : [])

export const parseBoardState = (params: URLSearchParams, today: string): BoardState => {
  const view = params.get('view')
  const range = params.get('range')
  const date = params.get('date')

  return {
    view: view === 'site' ? 'site' : 'staff',
    range: range === 'day' || range === 'month' ? range : 'week',
    anchor: date && DAY_KEY.test(date) && !Number.isNaN(Date.parse(date)) ? date : today,
    siteIds: list(params.get('sites')),
    userIds: list(params.get('staff')),
    statuses: list(params.get('statuses')).filter((status): status is ShiftStatus => SHIFT_STATUSES.includes(status as ShiftStatus)),
    includeDraft: params.get('drafts') !== '0'
  }
}

/** Only non-default values, so a plain /schedules link means "this week, everything". */
export const serializeBoardState = (state: BoardState, today: string): URLSearchParams => {
  const params = new URLSearchParams()

  if (state.view !== BOARD_DEFAULTS.view) params.set('view', state.view)
  if (state.range !== BOARD_DEFAULTS.range) params.set('range', state.range)
  if (state.anchor !== today) params.set('date', state.anchor)
  if (state.siteIds.length) params.set('sites', state.siteIds.join(','))
  if (state.userIds.length) params.set('staff', state.userIds.join(','))
  if (state.statuses.length) params.set('statuses', state.statuses.join(','))
  if (!state.includeDraft) params.set('drafts', '0')

  return params
}
