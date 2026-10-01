import { describe, expect, it } from 'vitest'

import type { TimesheetStatus } from '@/types/timesheetTypes'

import { canAddWorkLog, reviewActions, workerActions } from './actions'

const ALL: TimesheetStatus[] = ['OPEN', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ADJUSTED', 'CORRECTED', 'INVOICED']

describe('reviewActions', () => {
  it('lets staff act on SUBMITTED and ADJUSTED entries only', () => {
    const reviewable = ALL.filter(status => reviewActions({ status, openExceptionCount: 0 }).canApprove)

    expect(reviewable).toEqual(['SUBMITTED', 'ADJUSTED'])
    expect(reviewActions({ status: 'ADJUSTED', openExceptionCount: 0 })).toMatchObject({ canReject: true, canAdjust: true })
    expect(reviewActions({ status: 'APPROVED', openExceptionCount: 0 })).toMatchObject({ canReject: false, canAdjust: false })
  })

  it('marks only clean SUBMITTED entries as batchable, like approve-batch', () => {
    expect(reviewActions({ status: 'SUBMITTED', openExceptionCount: 0 }).batchable).toBe(true)
    expect(reviewActions({ status: 'SUBMITTED', openExceptionCount: 2 }).batchable).toBe(false)
    expect(reviewActions({ status: 'ADJUSTED', openExceptionCount: 0 }).batchable).toBe(false)
  })
})

describe('workerActions', () => {
  it('follows the worker side of the state machine', () => {
    expect(workerActions({ status: 'OPEN' })).toEqual({ canClockOut: true, canCorrect: false, canResubmit: false })
    expect(workerActions({ status: 'REJECTED' })).toEqual({ canClockOut: false, canCorrect: true, canResubmit: false })
    expect(workerActions({ status: 'CORRECTED' })).toEqual({ canClockOut: false, canCorrect: false, canResubmit: true })
    expect(workerActions({ status: 'APPROVED' })).toEqual({ canClockOut: false, canCorrect: false, canResubmit: false })
  })
})

describe('canAddWorkLog', () => {
  const now = Date.parse('2026-03-03T12:00:00Z')

  it('is open while the shift runs and for 24 hours after clock-out', () => {
    expect(canAddWorkLog({ status: 'IN_PROGRESS', scheduledEnd: '2026-03-01T00:00:00Z' }, null, now)).toBe(true)
    expect(canAddWorkLog({ status: 'COMPLETED', scheduledEnd: '2026-03-01T00:00:00Z' }, { clockOutAt: '2026-03-02T13:00:00Z' }, now)).toBe(true)
    expect(canAddWorkLog({ status: 'COMPLETED', scheduledEnd: '2026-03-01T00:00:00Z' }, { clockOutAt: '2026-03-02T11:00:00Z' }, now)).toBe(false)
  })

  it('falls back to the scheduled end and refuses other statuses', () => {
    expect(canAddWorkLog({ status: 'COMPLETED', scheduledEnd: '2026-03-03T00:00:00Z' }, null, now)).toBe(true)
    expect(canAddWorkLog({ status: 'ASSIGNED', scheduledEnd: '2026-03-03T00:00:00Z' }, null, now)).toBe(false)
    expect(canAddWorkLog({ status: 'NO_SHOW', scheduledEnd: '2026-03-03T00:00:00Z' }, null, now)).toBe(false)
  })
})
