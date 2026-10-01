import type { Timesheet, TimesheetStatus } from '@/types/timesheetTypes'

/** SUBMITTED and ADJUSTED entries wait on a supervisor (docs/ARCHITECTURE.md 6.1). */
export const REVIEWABLE: TimesheetStatus[] = ['SUBMITTED', 'ADJUSTED']

export type ReviewActions = {
  canApprove: boolean
  canReject: boolean
  canAdjust: boolean

  /** `approve-batch` only takes SUBMITTED entries with no unresolved exceptions; the rest need a look first. */
  batchable: boolean
}

export const reviewActions = (entry: Pick<Timesheet, 'status' | 'openExceptionCount'>): ReviewActions => {
  const reviewable = REVIEWABLE.includes(entry.status)

  return {
    canApprove: reviewable,
    canReject: reviewable,
    canAdjust: reviewable,
    batchable: entry.status === 'SUBMITTED' && entry.openExceptionCount === 0
  }
}

export type WorkerActions = {
  canClockOut: boolean
  canCorrect: boolean
  canResubmit: boolean
}

/** What the worker may do with their own entry: clock out an OPEN one, fix a REJECTED one, resend a CORRECTED one. */
export const workerActions = (entry: Pick<Timesheet, 'status'>): WorkerActions => ({
  canClockOut: entry.status === 'OPEN',
  canCorrect: entry.status === 'REJECTED',
  canResubmit: entry.status === 'CORRECTED'
})

/** Work logs may be added while the shift runs and up to 24 hours after it ended (docs/ARCHITECTURE.md 6.2). */
export const WORK_LOG_GRACE_MS = 24 * 60 * 60 * 1000

export const canAddWorkLog = (shift: { status: string; scheduledEnd: string }, entry: { clockOutAt: string | null } | null, now: number): boolean => {
  if (shift.status === 'IN_PROGRESS') return true

  if (shift.status !== 'COMPLETED') return false

  const ended = Date.parse(entry?.clockOutAt ?? shift.scheduledEnd)

  return now - ended <= WORK_LOG_GRACE_MS
}
