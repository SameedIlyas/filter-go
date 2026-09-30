import { BffError, errorMessage } from '@/libs/api/bff'
import type { AssignmentWarning, BlockingIssue, ValidateAssignmentResponse } from '@/types/scheduleTypes'

/*
 * Assignment is "warnings, not walls" (docs/ARCHITECTURE.md 5.4): a dry run shows blocking issues and warnings,
 * and `assign` with warnings answers 422 ASSIGNMENT_WARNINGS until it is resent with `overrideWarnings`.
 * These helpers turn those answers into what the UI should do next.
 */

export type Validation = { kind: 'blocked'; issues: BlockingIssue[] } | { kind: 'warn'; warnings: AssignmentWarning[] } | { kind: 'clear' }

export const classifyValidation = ({ blocking, warnings }: ValidateAssignmentResponse): Validation => {
  if (blocking.length > 0) return { kind: 'blocked', issues: blocking }
  if (warnings.length > 0) return { kind: 'warn', warnings }

  return { kind: 'clear' }
}

export type ErrorLink = { href: string; label: string }
export type FriendlyError = { message: string; link?: ErrorLink }

export type AssignOutcome = { kind: 'warnings'; warnings: AssignmentWarning[] } | ({ kind: 'error' } & FriendlyError)

/** After a failed `assign`: either confirm the warnings and retry with the override, or show the error. */
export const assignOutcome = (error: unknown): AssignOutcome => {
  if (error instanceof BffError && error.code === 'ASSIGNMENT_WARNINGS') {
    return { kind: 'warnings', warnings: (error.details?.warnings ?? []) as AssignmentWarning[] }
  }

  return { kind: 'error', ...schedulingError(error) }
}

const contextId = (error: BffError, key: string) => {
  const value = error.details?.context?.[key]

  return typeof value === 'string' ? value : undefined
}

/** A human message for any scheduling failure, with a link to the thing it clashed with when there is one. */
export const schedulingError = (error: unknown): FriendlyError => {
  if (!(error instanceof BffError)) return { message: errorMessage(error) }

  switch (error.code) {
    case 'SCHEDULE_OVERLAP': {
      const scheduleId = contextId(error, 'scheduleId')

      return { message: error.message, ...(scheduleId ? { link: { href: `/schedules/${scheduleId}`, label: 'Open that schedule' } } : {}) }
    }

    case 'SHIFT_OVERLAP': {
      const shiftId = contextId(error, 'shiftId')

      return { message: error.message, ...(shiftId ? { link: { href: `/schedules?shift=${shiftId}`, label: 'View the other shift' } } : {}) }
    }

    case 'INVALID_STATE':
      if (error.details?.entity === 'shift' && error.details.from) {
        return { message: `This shift is ${error.details.from.toLowerCase().replace('_', ' ')} and can no longer be changed here.` }
      }

      return { message: error.message }
    default:
      return { message: errorMessage(error) }
  }
}
