import { describe, expect, it } from 'vitest'

import { BffError } from '@/libs/api/bff'

import { assignOutcome, classifyValidation, schedulingError } from './assignmentFlow'

const overtime = { code: 'OVERTIME' as const, message: 'Over the threshold.', data: { weeklyMinutes: 2520, thresholdMinutes: 2400 } }

describe('classifyValidation', () => {
  it('blocking issues win over warnings', () => {
    const blocking = [{ code: 'SHIFT_OVERLAP' as const, message: 'Clash.', data: { shiftId: 's-2' } }]

    expect(classifyValidation({ blocking, warnings: [overtime] })).toEqual({ kind: 'blocked', issues: blocking })
    expect(classifyValidation({ blocking: [], warnings: [overtime] })).toEqual({ kind: 'warn', warnings: [overtime] })
    expect(classifyValidation({ blocking: [], warnings: [] })).toEqual({ kind: 'clear' })
  })
})

describe('assignOutcome', () => {
  it('ASSIGNMENT_WARNINGS means "confirm and retry with the override", not an error', () => {
    const error = new BffError(422, 'ASSIGNMENT_WARNINGS', 'Has warnings.', { warnings: [overtime] })

    expect(assignOutcome(error)).toEqual({ kind: 'warnings', warnings: [overtime] })
  })

  it('SHIFT_OVERLAP names the clashing shift', () => {
    const error = new BffError(409, 'SHIFT_OVERLAP', 'This person already has a shift at that time.', { context: { shiftId: 's-9' } })

    expect(assignOutcome(error)).toEqual({ kind: 'error', message: 'This person already has a shift at that time.', link: { href: '/schedules?shift=s-9', label: 'View the other shift' } })
  })

  it('anything else is a plain error with the server message', () => {
    expect(assignOutcome(new BffError(409, 'SCHEDULE_LOCKED', 'This schedule is locked.'))).toEqual({ kind: 'error', message: 'This schedule is locked.' })
    expect(assignOutcome(new Error('boom'))).toEqual({ kind: 'error', message: 'boom' })
  })
})

describe('schedulingError', () => {
  it('links to the schedule that already covers the period', () => {
    const error = new BffError(409, 'SCHEDULE_OVERLAP', 'Already covered.', { context: { scheduleId: 'sch-7' } })

    expect(schedulingError(error)).toEqual({ message: 'Already covered.', link: { href: '/schedules/sch-7', label: 'Open that schedule' } })
  })

  it('explains INVALID_STATE on a shift in plain words', () => {
    const error = new BffError(409, 'INVALID_STATE', 'Cannot move shift from COMPLETED to CANCELLED.', { entity: 'shift', from: 'COMPLETED', to: 'CANCELLED', allowed: [] })

    expect(schedulingError(error).message).toBe('This shift is completed and can no longer be changed here.')
  })

  it('passes validation details through', () => {
    const error = new BffError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', { issues: [{ field: 'to', code: 'custom', message: 'Too long.' }] })

    expect(schedulingError(error).message).toBe('Some fields are invalid. Too long.')
  })
})
