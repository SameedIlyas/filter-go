import type { ScheduleStatus, ShiftCounts, ShiftStatus } from '@/types/scheduleTypes'

/*
 * What a person may do next, mirroring the backend state machines (docs/ARCHITECTURE.md 5.1 and 5.6).
 * The backend still enforces every rule; this only decides which buttons to show, enable, and confirm.
 */

export type ScheduleActionName = 'publish' | 'unpublish' | 'lock' | 'close' | 'regenerate' | 'delete'

export type ScheduleAction = {
  action: ScheduleActionName
  enabled: boolean

  /** Why the action is disabled, for a tooltip. */
  reason?: string

  /** Text for a confirm dialog; absent when the action can run straight away. */
  confirm?: string

  /** Shown as the primary button. */
  primary?: boolean
  destructive?: boolean
}

type ScheduleLike = { status: ScheduleStatus; coverage: ShiftCounts; periodEnd: string }

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

export const scheduleActions = (schedule: ScheduleLike, today: string): ScheduleAction[] => {
  const { coverage } = schedule

  switch (schedule.status) {
    case 'DRAFT':
      return [
        {
          action: 'publish',
          enabled: true,
          primary: true,
          confirm:
            coverage.open > 0
              ? `${plural(coverage.open, 'shift')} ${coverage.open === 1 ? 'is' : 'are'} still open. Publish anyway? Assigned staff will be notified and the schedule becomes visible to field staff and the client.`
              : undefined
        },
        {
          action: 'regenerate',
          enabled: true,
          destructive: true,
          confirm: `Regenerate rebuilds all ${plural(coverage.total, 'shift')} from the latest active version of the contract. Assignments and manually added shifts will be lost.`
        },
        { action: 'delete', enabled: true, destructive: true, confirm: 'Delete this draft schedule and all of its shifts? This cannot be undone.' }
      ]

    case 'PUBLISHED': {
      const ended = today > schedule.periodEnd

      return [
        { action: 'lock', enabled: ended, primary: true, reason: ended ? undefined : 'You can lock a schedule after the period ends.' },
        {
          action: 'unpublish',
          enabled: true,
          destructive: true,
          confirm: 'Unpublish returns the schedule to draft: field staff and the client will no longer see it. This is refused once any shift has a timesheet.'
        }
      ]
    }

    case 'LOCKED': {
      const unfinished = coverage.total - coverage.completed - coverage.noShow - coverage.cancelled

      return [
        {
          action: 'close',
          enabled: unfinished === 0,
          primary: true,
          reason: unfinished === 0 ? undefined : `${plural(unfinished, 'shift')} still need to be completed, marked no-show or cancelled.`
        }
      ]
    }

    case 'CLOSED':
      return []
  }
}

export type ShiftActions = {

  /** Times, notes and quantity may change. */
  editable: boolean
  canAssign: boolean
  canUnassign: boolean
  canCancel: boolean
  canOffer: boolean
  canDrag: boolean

  /** For the assigned field user. */
  canConfirm: boolean
}

const EDITABLE: ShiftStatus[] = ['OPEN', 'ASSIGNED', 'CONFIRMED']

export const shiftActions = (shift: { status: ShiftStatus; scheduleStatus: ScheduleStatus }): ShiftActions => {
  const scheduleOpen = shift.scheduleStatus === 'DRAFT' || shift.scheduleStatus === 'PUBLISHED'
  const editable = scheduleOpen && EDITABLE.includes(shift.status)

  return {
    editable,
    canAssign: editable,
    canUnassign: editable && shift.status !== 'OPEN',
    canCancel: editable,
    canOffer: editable && shift.status === 'OPEN',
    canDrag: editable,
    canConfirm: shift.status === 'ASSIGNED' && shift.scheduleStatus === 'PUBLISHED'
  }
}
