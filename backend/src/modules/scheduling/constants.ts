import type { ScheduleStatus, ShiftStatus } from '../../generated/prisma/client.js'
import { Errors } from '../../lib/errors.js'

/** Explicit schedule state machine (docs/ARCHITECTURE.md 5.1). PUBLISHED -> DRAFT is "unpublish". */
export const SCHEDULE_TRANSITIONS: Record<ScheduleStatus, ScheduleStatus[]> = {
  DRAFT: ['PUBLISHED'],
  PUBLISHED: ['DRAFT', 'LOCKED'],
  LOCKED: ['CLOSED'],
  CLOSED: []
}

export const assertScheduleTransition = (from: ScheduleStatus, to: ScheduleStatus): void => {
  if (!SCHEDULE_TRANSITIONS[from].includes(to)) {
    throw Errors.invalidState('schedule', from, to, SCHEDULE_TRANSITIONS[from])
  }
}

/**
 * The part of the shift state machine this module owns (5.6). IN_PROGRESS, COMPLETED and NO_SHOW belong to
 * Timesheets, so from here they (and CANCELLED) are dead ends.
 */
export const SHIFT_TRANSITIONS: Record<ShiftStatus, ShiftStatus[]> = {
  OPEN: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['ASSIGNED', 'CONFIRMED', 'OPEN', 'CANCELLED'],
  CONFIRMED: ['ASSIGNED', 'OPEN', 'CANCELLED'],
  IN_PROGRESS: [],
  COMPLETED: [],
  NO_SHOW: [],
  CANCELLED: []
}

export const assertShiftTransition = (from: ShiftStatus, to: ShiftStatus): void => {
  if (!SHIFT_TRANSITIONS[from].includes(to)) {
    throw Errors.invalidState('shift', from, to, SHIFT_TRANSITIONS[from])
  }
}

/** Shift statuses Scheduling may still edit. Anything else has been (or is being) worked or is cancelled. */
export const EDITABLE_SHIFT_STATUSES: ShiftStatus[] = ['OPEN', 'ASSIGNED', 'CONFIRMED']

export const TERMINAL_SHIFT_STATUSES: ShiftStatus[] = ['COMPLETED', 'NO_SHOW', 'CANCELLED']

/** Schedules that field users and clients may see. Before PUBLISHED nothing is visible to them. */
export const OUTSIDER_VISIBLE_STATUSES: ScheduleStatus[] = ['PUBLISHED', 'LOCKED', 'CLOSED']

export const MAX_PERIOD_DAYS = 93
export const MAX_SHIFT_HOURS = 24
export const MAX_OFFERS_PER_REQUEST = 50
