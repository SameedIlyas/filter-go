import type { Site } from '@/types/contractTypes'
import type { BoardShift } from '@/types/scheduleTypes'
import type { User } from '@/types/userTypes'

import type { BoardRange, BoardState, BoardView } from '../logic/boardWindow'
import { UNASSIGNED_ROW, formatHours } from '../logic/placeShifts'
import type { Placement } from '../logic/placeShifts'
import type { BoardRow } from './BoardGrid'

/** Display hint only: the backend's WEEKLY_OVERTIME_MINUTES default (the real check runs on assignment). */
const OVERTIME_MINUTES = 40 * 60

type Input = {
  view: BoardView
  range: BoardRange
  shifts: BoardShift[]
  staff: User[]
  sites: Site[]
  filter: Pick<BoardState, 'userIds' | 'siteIds'>
  placement: Placement
}

const openIn = (placement: Placement, rowKey: string) =>
  [...(placement.rows.get(rowKey)?.values() ?? [])].flat().filter(shift => shift.status === 'OPEN').length

const staffRows = ({ range, shifts, staff, filter, placement }: Input): BoardRow[] => {
  const known = new Map(staff.map(user => [user.id, { id: user.id, name: user.name, image: user.image }]))

  // Someone can hold shifts without being in the options (deactivated since): keep their row
  for (const shift of shifts) {
    if (shift.assignedUser && !known.has(shift.assignedUser.id)) known.set(shift.assignedUser.id, { ...shift.assignedUser, image: null })
  }

  const people = [...known.values()].filter(person => filter.userIds.length === 0 || filter.userIds.includes(person.id))
  const period = range === 'day' ? 'today' : 'this week'

  return [
    { key: UNASSIGNED_ROW, title: 'Unassigned', subtitle: `${openIn(placement, UNASSIGNED_ROW)} open`, icon: 'bx-user-x', dropUserId: null },
    ...people.map(person => {
      const minutes = placement.minutesByUser.get(person.id) ?? 0

      return {
        key: person.id,
        title: person.name,
        image: person.image,
        subtitle: `${formatHours(minutes)} ${period}`,
        subtitleWarn: range === 'week' && minutes > OVERTIME_MINUTES,
        dropUserId: person.id
      }
    })
  ]
}

const siteRows = ({ shifts, sites, filter, placement }: Input): BoardRow[] => {
  const names = new Map(sites.map(site => [site.id, site.name]))

  for (const shift of shifts) if (!names.has(shift.siteId)) names.set(shift.siteId, shift.site.name)

  const ids = new Set([...placement.rows.keys(), ...filter.siteIds])

  return [...ids]
    .filter(id => names.has(id))
    .map(id => ({ key: id, title: names.get(id) ?? '', subtitle: `${openIn(placement, id)} open`, icon: 'bx-buildings' }))
    .sort((a, b) => a.title.localeCompare(b.title))
}

/** The board's rows: Unassigned + people (by staff), or the sites in play (by site). */
export const buildRows = (input: Input): BoardRow[] => (input.view === 'staff' ? staffRows(input) : siteRows(input))
