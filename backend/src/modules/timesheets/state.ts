import type { TimesheetStatus } from '../../generated/prisma/client.js'
import { Errors } from '../../lib/errors.js'

/**
 * Timesheet state machine (docs/ARCHITECTURE.md 6.1).
 * ADJUSTED -> ADJUSTED is allowed: a supervisor may adjust more than once before approving.
 * INVOICED is set by the Invoices module, never from here.
 */
export const TRANSITIONS: Record<TimesheetStatus, TimesheetStatus[]> = {
  OPEN: ['SUBMITTED'],
  SUBMITTED: ['APPROVED', 'REJECTED', 'ADJUSTED'],
  ADJUSTED: ['APPROVED', 'REJECTED', 'ADJUSTED'],
  REJECTED: ['CORRECTED'],
  CORRECTED: ['SUBMITTED'],
  APPROVED: ['INVOICED'],
  INVOICED: []
}

export const assertTransition = (from: TimesheetStatus, to: TimesheetStatus): void => {
  if (!TRANSITIONS[from].includes(to)) {
    throw Errors.invalidState('timesheet', from, to, TRANSITIONS[from])
  }
}

/** Resubmitting is only for a corrected entry: OPEN -> SUBMITTED also exists, but that edge belongs to clock-out. */
export const assertResubmittable = (from: TimesheetStatus): void => {
  if (from !== 'CORRECTED') {
    throw Errors.invalidState('timesheet', from, 'SUBMITTED', TRANSITIONS[from].filter(next => next !== 'SUBMITTED'))
  }
}

/** Statuses a supervisor can act on (approve, reject, adjust). */
export const REVIEWABLE: TimesheetStatus[] = ['SUBMITTED', 'ADJUSTED']

/** Statuses visible to a CLIENT_USER: only finished, approved work. */
export const CLIENT_VISIBLE: TimesheetStatus[] = ['APPROVED', 'INVOICED']
