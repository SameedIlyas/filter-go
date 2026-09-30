import { describe, expect, it } from 'vitest'

import type { BoardShift } from '@/types/scheduleTypes'

import { UNASSIGNED_ROW, countVisible, placeShifts, splitCell, timeRange } from './placeShifts'

const CHICAGO = 'America/Chicago'

const shift = (id: string, start: string, end: string, extra: Partial<BoardShift> = {}): BoardShift => ({
  id,
  scheduleId: 'sch-1',
  scheduleStatus: 'PUBLISHED',
  siteId: 'site-1',
  site: { id: 'site-1', name: 'Main St', timezone: CHICAGO },
  scheduledStart: start,
  scheduledEnd: end,
  status: 'OPEN',
  assignedUser: null,
  isExtra: false,
  hasNotes: false,
  ...extra
})

const alice = { id: 'u-alice', name: 'Alice' }
const DAYS = ['2026-03-02', '2026-03-03', '2026-03-04']

describe('placeShifts', () => {
  it('by staff: open shifts go to the Unassigned row, others to their assignee, on the SITE-local day', () => {
    const open = shift('open', '2026-03-03T00:00:00.000Z', '2026-03-03T08:00:00.000Z') // Mon 18:00 Chicago
    const mine = shift('mine', '2026-03-03T15:00:00.000Z', '2026-03-03T23:00:00.000Z', { assignedUser: alice, status: 'ASSIGNED' })

    const { rows } = placeShifts([open, mine], DAYS, 'staff')

    expect(rows.get(UNASSIGNED_ROW)?.get('2026-03-02')?.map(s => s.id)).toEqual(['open'])
    expect(rows.get('u-alice')?.get('2026-03-03')?.map(s => s.id)).toEqual(['mine'])
  })

  it('by site: one row per site', () => {
    const other = shift('b', '2026-03-04T15:00:00.000Z', '2026-03-04T20:00:00.000Z', { siteId: 'site-2', site: { id: 'site-2', name: 'Depot', timezone: 'UTC' } })
    const { rows } = placeShifts([shift('a', '2026-03-03T15:00:00.000Z', '2026-03-03T20:00:00.000Z'), other], DAYS, 'site')

    expect([...rows.keys()].sort()).toEqual(['site-1', 'site-2'])
    expect(rows.get('site-2')?.get('2026-03-04')?.[0].id).toBe('b')
  })

  it('drops shifts whose local day is outside the visible days (they came from the padded request window)', () => {
    const { rows } = placeShifts([shift('early', '2026-03-01T15:00:00.000Z', '2026-03-01T20:00:00.000Z')], DAYS, 'staff')

    expect(rows.size).toBe(0)
  })

  it('totals scheduled minutes per person, ignoring cancelled shifts', () => {
    const { minutesByUser } = placeShifts(
      [
        shift('a', '2026-03-03T15:00:00.000Z', '2026-03-03T23:00:00.000Z', { assignedUser: alice, status: 'ASSIGNED' }),
        shift('b', '2026-03-04T15:00:00.000Z', '2026-03-04T19:30:00.000Z', { assignedUser: alice, status: 'COMPLETED' }),
        shift('c', '2026-03-04T20:00:00.000Z', '2026-03-04T22:00:00.000Z', { assignedUser: alice, status: 'CANCELLED' })
      ],
      DAYS,
      'staff'
    )

    expect(minutesByUser.get('u-alice')).toBe(8 * 60 + 4 * 60 + 30)
  })

  it('keeps shifts in start order within a cell', () => {
    const late = shift('late', '2026-03-03T20:00:00.000Z', '2026-03-03T22:00:00.000Z')
    const early = shift('early', '2026-03-03T15:00:00.000Z', '2026-03-03T17:00:00.000Z')

    expect(placeShifts([late, early], DAYS, 'staff').rows.get(UNASSIGNED_ROW)?.get('2026-03-03')?.map(s => s.id)).toEqual(['early', 'late'])
  })
})

describe('splitCell', () => {
  it('shows up to the limit and counts the rest', () => {
    const cell = ['a', 'b', 'c', 'd', 'e'].map(id => shift(id, '2026-03-03T15:00:00.000Z', '2026-03-03T16:00:00.000Z'))

    expect(splitCell(cell, 3)).toEqual({ visible: cell.slice(0, 3), hidden: 2 })
    expect(splitCell(cell.slice(0, 3), 3)).toEqual({ visible: cell.slice(0, 3), hidden: 0 })
  })
})

describe('timeRange', () => {
  it('is site-local, and marks shifts that end on a later day', () => {
    expect(timeRange(shift('x', '2026-03-03T15:00:00.000Z', '2026-03-03T23:00:00.000Z'))).toBe('09:00 – 17:00')
    expect(timeRange(shift('y', '2026-03-03T00:00:00.000Z', '2026-03-03T08:00:00.000Z'))).toBe('18:00 – 02:00 +1')
  })
})

describe('countVisible', () => {
  it('counts by status over the visible site-local days only, plus extras', () => {
    const counts = countVisible(
      [
        shift('a', '2026-03-03T00:00:00.000Z', '2026-03-03T08:00:00.000Z'),
        shift('b', '2026-03-03T15:00:00.000Z', '2026-03-03T20:00:00.000Z', { status: 'ASSIGNED', assignedUser: alice, isExtra: true }),
        shift('c', '2026-03-04T15:00:00.000Z', '2026-03-04T20:00:00.000Z', { status: 'CANCELLED' }),
        shift('padding', '2026-03-01T15:00:00.000Z', '2026-03-01T20:00:00.000Z')
      ],
      DAYS
    )

    expect(counts).toEqual({ total: 3, open: 1, assigned: 1, confirmed: 0, inProgress: 0, completed: 0, noShow: 0, cancelled: 1, extra: 1 })
  })
})
