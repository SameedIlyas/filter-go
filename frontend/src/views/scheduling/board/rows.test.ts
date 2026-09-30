import { describe, expect, it } from 'vitest'

import type { Site } from '@/types/contractTypes'
import type { BoardShift } from '@/types/scheduleTypes'
import type { User } from '@/types/userTypes'

import { BOARD_DEFAULTS } from '../logic/boardWindow'
import { UNASSIGNED_ROW, placeShifts } from '../logic/placeShifts'
import { buildRows } from './rows'

const DAYS = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08']

const user = (id: string, name: string) => ({ id, name, image: null }) as unknown as User
const site = (id: string, name: string) => ({ id, name, timezone: 'UTC' }) as unknown as Site

const shift = (id: string, day: number, extra: Partial<BoardShift> = {}): BoardShift => ({
  id,
  scheduleId: 'sch',
  scheduleStatus: 'PUBLISHED',
  siteId: 'site-a',
  site: { id: 'site-a', name: 'Alpha', timezone: 'UTC' },
  scheduledStart: `2026-03-0${day}T09:00:00.000Z`,
  scheduledEnd: `2026-03-0${day}T17:00:00.000Z`,
  status: 'OPEN',
  assignedUser: null,
  isExtra: false,
  hasNotes: false,
  ...extra
})

const staff = [user('u-bo', 'Bo'), user('u-al', 'Al')]

const build = (view: 'staff' | 'site', shifts: BoardShift[], filter = { ...BOARD_DEFAULTS, anchor: '2026-03-04' }, sites: Site[] = []) =>
  buildRows({ view, range: 'week', shifts, staff, sites, filter, placement: placeShifts(shifts, DAYS, view) })

describe('buildRows: by staff', () => {
  it('pins Unassigned first (a drop target that unassigns), then every staff member even without shifts', () => {
    const rows = build('staff', [shift('a', 3), shift('b', 4)])

    expect(rows.map(row => row.key)).toEqual([UNASSIGNED_ROW, 'u-bo', 'u-al'])
    expect(rows[0]).toMatchObject({ title: 'Unassigned', subtitle: '2 open', dropUserId: null })
    expect(rows[1]).toMatchObject({ title: 'Bo', dropUserId: 'u-bo', subtitle: '0h this week' })
  })

  it('shows weekly hours and warns past 40h', () => {
    const long = [2, 3, 4, 5, 6, 7].map(day => shift(`s${day}`, day, { assignedUser: { id: 'u-al', name: 'Al' }, status: 'ASSIGNED' }))
    const al = build('staff', long).find(row => row.key === 'u-al')

    expect(al).toMatchObject({ subtitle: '48h this week', subtitleWarn: true })
  })

  it('keeps assignees who are not in the staff list (e.g. since deactivated), and narrows to the staff filter', () => {
    const ghost = shift('g', 3, { assignedUser: { id: 'u-gone', name: 'Gone' }, status: 'ASSIGNED' })

    expect(build('staff', [ghost]).map(row => row.key)).toEqual([UNASSIGNED_ROW, 'u-bo', 'u-al', 'u-gone'])
    expect(build('staff', [ghost], { ...BOARD_DEFAULTS, anchor: '2026-03-04', userIds: ['u-al'] }).map(row => row.key)).toEqual([UNASSIGNED_ROW, 'u-al'])
  })
})

describe('buildRows: by site', () => {
  it('lists sites that have shifts (plus filtered sites), by name, and they are not drop targets', () => {
    const other = shift('o', 3, { siteId: 'site-b', site: { id: 'site-b', name: 'Bravo', timezone: 'UTC' } })
    const rows = build('site', [other, shift('a', 4)], { ...BOARD_DEFAULTS, anchor: '2026-03-04' }, [site('site-a', 'Alpha'), site('site-b', 'Bravo'), site('site-c', 'Charlie')])

    expect(rows.map(row => row.title)).toEqual(['Alpha', 'Bravo'])
    expect(rows.every(row => row.dropUserId === undefined)).toBe(true)

    const filtered = build('site', [], { ...BOARD_DEFAULTS, anchor: '2026-03-04', siteIds: ['site-c'] }, [site('site-c', 'Charlie')])

    expect(filtered.map(row => row.title)).toEqual(['Charlie'])
  })
})
