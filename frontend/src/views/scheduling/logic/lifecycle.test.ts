import { describe, expect, it } from 'vitest'

import type { ScheduleStatus, ShiftCounts, ShiftStatus } from '@/types/scheduleTypes'

import { scheduleActions, shiftActions } from './lifecycle'

const counts = (patch: Partial<ShiftCounts> = {}): ShiftCounts => ({
  total: 0,
  open: 0,
  assigned: 0,
  confirmed: 0,
  inProgress: 0,
  completed: 0,
  noShow: 0,
  cancelled: 0,
  ...patch
})

const schedule = (status: ScheduleStatus, coverage = counts(), periodEnd = '2026-03-31') => ({ status, coverage, periodEnd })
const names = (actions: ReturnType<typeof scheduleActions>) => actions.map(action => action.action)

describe('scheduleActions', () => {
  it('offers only the valid transitions for each status', () => {
    expect(names(scheduleActions(schedule('DRAFT'), '2026-03-10'))).toEqual(['publish', 'regenerate', 'delete'])
    expect(names(scheduleActions(schedule('PUBLISHED'), '2026-03-10'))).toEqual(['lock', 'unpublish'])
    expect(names(scheduleActions(schedule('LOCKED'), '2026-03-10'))).toEqual(['close'])
    expect(names(scheduleActions(schedule('CLOSED'), '2026-03-10'))).toEqual([])
  })

  it('lock waits for the period to end', () => {
    const [during] = scheduleActions(schedule('PUBLISHED'), '2026-03-31')
    const [after] = scheduleActions(schedule('PUBLISHED'), '2026-04-01')

    expect(during).toMatchObject({ action: 'lock', enabled: false })
    expect(during.reason).toMatch(/after the period ends/i)
    expect(after).toMatchObject({ action: 'lock', enabled: true })
  })

  it('close waits for every shift to be finished', () => {
    const [notYet] = scheduleActions(schedule('LOCKED', counts({ total: 3, completed: 2, assigned: 1 })), '2026-04-10')
    const [ready] = scheduleActions(schedule('LOCKED', counts({ total: 3, completed: 1, noShow: 1, cancelled: 1 })), '2026-04-10')

    expect(notYet).toMatchObject({ action: 'close', enabled: false })
    expect(notYet.reason).toMatch(/1 shift/)
    expect(ready).toMatchObject({ action: 'close', enabled: true })
  })

  it('publish is always allowed from draft, but asks first when shifts are still open', () => {
    const [clean] = scheduleActions(schedule('DRAFT', counts({ total: 2, assigned: 2 })), '2026-03-10')
    const [withOpen] = scheduleActions(schedule('DRAFT', counts({ total: 2, open: 1, assigned: 1 })), '2026-03-10')

    expect(clean).toMatchObject({ action: 'publish', enabled: true, confirm: undefined })
    expect(withOpen.confirm).toMatch(/1 shift is still open/)
  })

  it('destructive actions always ask first', () => {
    const [, regenerate, remove] = scheduleActions(schedule('DRAFT', counts({ total: 18 })), '2026-03-10')
    const [, unpublish] = scheduleActions(schedule('PUBLISHED'), '2026-03-10')

    expect(regenerate.confirm).toMatch(/18 shifts/)
    expect(remove.confirm).toBeTruthy()
    expect(unpublish.confirm).toBeTruthy()
  })
})

describe('shiftActions', () => {
  const on = (status: ShiftStatus, scheduleStatus: ScheduleStatus = 'PUBLISHED') => shiftActions({ status, scheduleStatus })

  it('open shifts can be assigned, offered, cancelled and dragged, but not unassigned', () => {
    expect(on('OPEN')).toEqual({ editable: true, canAssign: true, canUnassign: false, canCancel: true, canOffer: true, canDrag: true, canConfirm: false })
  })

  it('assigned and confirmed shifts can be reassigned or unassigned but not offered', () => {
    expect(on('ASSIGNED')).toMatchObject({ canAssign: true, canUnassign: true, canOffer: false, canConfirm: true })
    expect(on('CONFIRMED')).toMatchObject({ canAssign: true, canUnassign: true, canOffer: false, canConfirm: false })
  })

  it('a field user can only confirm on a published schedule', () => {
    expect(on('ASSIGNED', 'DRAFT').canConfirm).toBe(false)
  })

  it('timesheet-owned and cancelled shifts, and locked or closed schedules, are read-only', () => {
    for (const status of ['IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED'] as const) {
      expect(on(status).editable).toBe(false)
      expect(on(status).canDrag).toBe(false)
    }

    expect(on('OPEN', 'LOCKED').editable).toBe(false)
    expect(on('ASSIGNED', 'CLOSED').canUnassign).toBe(false)
  })
})
