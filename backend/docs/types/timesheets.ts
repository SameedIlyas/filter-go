/**
 * TypeScript contract for the Timesheets module: clocking, the worker's own entries and corrections, the supervisor's
 * review (approve, reject, adjust, the exception queue, the hours grid) and work logs.
 *
 * Types only, no runtime code. Every authenticated response is wrapped in `ApiResponse<T>` from `../api-types`;
 * the `T` below is the `data` member. Lists also carry `meta: PageMeta` next to `data`.
 * Dates: instants are ISO-8601 UTC strings, calendar dates are "YYYY-MM-DD". Money is a two-decimal string.
 * Spec: docs/ARCHITECTURE.md section 6.
 */
import type { PageMeta } from '../api-types.js'
import type { ShiftStatus } from './scheduling.js'

export type { PageMeta }

export type TimesheetStatus = 'OPEN' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'ADJUSTED' | 'CORRECTED' | 'INVOICED'
export type ExceptionType = 'LATE_IN' | 'EARLY_OUT' | 'OVERTIME' | 'GEOFENCE_MISS' | 'MISSING_CLOCK_OUT' | 'NO_SHOW'
export type WorkLogKind = 'PHOTO' | 'NOTE' | 'ISSUE' | 'CHECKLIST'

/** Why `approve-batch` passed over an entry (it is skipped, not an error). */
export type BatchSkipReason = 'NOT_FOUND' | 'NOT_SUBMITTED' | 'HAS_UNRESOLVED_EXCEPTIONS' | 'INVALID_STATE' | 'UNPROCESSABLE'

export interface UserRef {
  id: string
  name: string
}

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------

/** The numbers behind each exception type. Unknown keys may appear; read defensively. */
export interface ExceptionDetail {
  LATE_IN: { minutesLate: number; thresholdMinutes: number }
  EARLY_OUT: { minutesEarly: number; thresholdMinutes: number }
  OVERTIME: {
    reasons: Array<'DAILY' | 'WEEKLY'>
    actualMinutes: number
    scheduledMinutes: number
    thresholdMinutes: number
    weeklyMinutes: number
    weeklyLimitMinutes: number
  }
  /** Each distance is present only for the point that missed; `null` means the phone sent no GPS. */
  GEOFENCE_MISS: { limitMeters: number; clockInDistanceMeters?: number | null; clockOutDistanceMeters?: number | null }
  MISSING_CLOCK_OUT: Record<string, unknown>
  NO_SHOW: Record<string, unknown>
}

export interface TimesheetException {
  id: string
  type: ExceptionType
  detail: Record<string, unknown>
  resolved: boolean
  resolvedById: string | null
  resolvedAt: string | null
  createdAt: string
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export interface TimesheetShiftSummary {
  id: string
  scheduleId: string
  siteId: string
  scheduledStart: string
  scheduledEnd: string
  status: ShiftStatus
  isExtra: boolean
}

/**
 * A timesheet entry as staff and the worker see it. Rate stamps are set on approval: `payRateSnapshot` is present
 * for ADMIN and SUPERVISOR, `billRateSnapshot` for ADMIN only (the keys are omitted, not null, for everyone else).
 * `clockInAt` is null on a no-show; `clockOutAt` is null while OPEN.
 */
export interface Timesheet {
  id: string
  shiftId: string
  userId: string
  user: UserRef | null
  status: TimesheetStatus
  clockInAt: string | null
  clockOutAt: string | null
  breakMinutes: number
  scheduledMinutes: number
  actualMinutes: number | null
  billable: boolean
  payable: boolean
  /** Closed by the sweep at the scheduled end (MISSING_CLOCK_OUT). */
  autoClosed: boolean
  adjustmentReason: string | null
  rejectionReason: string | null
  approvedById: string | null
  approvedAt: string | null
  payRateSnapshot?: string | null
  billRateSnapshot?: string | null
  shift: TimesheetShiftSummary
  /** `timezone` is the site's, falling back to the organization's. Show times in it. */
  site: { id: string; name: string; timezone: string }
  exceptions: TimesheetException[]
  openExceptionCount: number
  createdAt: string
  updatedAt: string
}

/** The client portal's view: approved work only, no worker, GPS, exceptions or rates. */
export interface ClientTimesheet {
  id: string
  shiftId: string
  status: 'APPROVED' | 'INVOICED'
  clockInAt: string | null
  clockOutAt: string | null
  breakMinutes: number
  scheduledMinutes: number
  actualMinutes: number | null
  billable: boolean
  approvedAt: string | null
  shift: TimesheetShiftSummary
  /** `timezone` is the site's, falling back to the organization's. Show times in it. */
  site: { id: string; name: string; timezone: string }
}

export interface ClockPoint {
  at: string | null
  lat: number | null
  lng: number | null
  /** Metres from the site; null when either point is missing. */
  distanceMeters: number | null
}

export interface WorkLog {
  id: string
  shiftId: string
  kind: WorkLogKind
  fileId: string | null
  body: string | null
  /** CHECKLIST: `{ items: [{ label, done }] }`. */
  data: { items?: Array<{ label: string; done: boolean }> } | null
  at: string
  /** Omitted for CLIENT_USER. */
  userId?: string
  user?: UserRef | null
}

/** One line of the trail: a scheduling event on the shift or a timesheet event on the entry. `actor` null = system. */
export interface TimesheetActivity {
  id: string
  entity: 'shift' | 'timesheet' | string
  /** e.g. assigned, confirmed, clocked_in, clocked_out, adjusted, rejected, corrected, resubmitted, approved, auto_closed, no_show, exception_resolved */
  action: string
  actor: UserRef | null
  reason: string | null
  at: string
}

/** GET /timesheets/:id for staff and the entry's worker. `activity` is staff only. */
export interface TimesheetDetail extends Omit<Timesheet, 'site'> {
  site: { id: string; name: string; address: string | null; lat: number | null; lng: number | null; timezone: string }
  clockIn: ClockPoint
  clockOut: ClockPoint
  workLogs: WorkLog[]
  activity?: TimesheetActivity[]
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** GET /timesheets (staff; clients get `ClientTimesheet`) and GET /me/timesheets. Paged. */
export interface TimesheetListResponse {
  timesheets: Timesheet[]
}

/** Query of GET /timesheets. `from`/`to` are instants on the shift's scheduled start. */
export interface TimesheetListQuery {
  page?: number
  limit?: number
  status?: TimesheetStatus
  siteId?: string
  userId?: string
  hasOpenExceptions?: boolean
  from?: string
  to?: string
}

/** GET /timesheets/exceptions: unresolved exceptions, oldest first. Paged. Filters `type`, `siteId`, `userId`. */
export interface ExceptionQueueResponse {
  exceptions: Array<TimesheetException & { timesheet: Timesheet }>
}

export interface HoursTally {
  scheduledMinutes: number
  workedMinutes: number
  approvedMinutes: number
}

/**
 * GET /timesheets/hours?from&to&siteId&userId (ADMIN, SUPERVISOR). `from`/`to` are calendar dates, inclusive, at most
 * 45 days. Days are site-local. A worker's `days` only has the dates with something on them; `totals.days` has every
 * date. Overtime is weekly: every Monday-start week touching the window counts whole.
 */
export interface HoursResponse {
  from: string
  to: string
  days: string[]
  weeklyOvertimeMinutes: number
  workers: Array<
    HoursTally & {
      user: UserRef
      days: Record<string, HoursTally>
      overtimeMinutes: number
      entryCount: number
      openExceptionCount: number
    }
  >
  totals: HoursTally & { days: Record<string, HoursTally>; overtimeMinutes: number }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** POST /shifts/:shiftId/clock-in. GPS is optional, but `lat` and `lng` come together. -> 201 `{ timesheet }`. */
export interface ClockInInput {
  lat?: number
  lng?: number
}

/** POST /timesheets/:id/clock-out -> `{ timesheet }` (now SUBMITTED). */
export interface ClockOutInput extends ClockInInput {
  breakMinutes?: number
}

/** POST /timesheets/:id/adjust (staff; SUBMITTED or ADJUSTED). At least one change besides `reason`. */
export interface AdjustInput {
  clockInAt?: string
  clockOutAt?: string
  breakMinutes?: number
  billable?: boolean
  payable?: boolean
  reason: string
}

/** PATCH /timesheets/:id/correct (the worker; REJECTED only). Times within 12 h of the scheduled shift. */
export interface CorrectInput {
  clockInAt?: string
  clockOutAt?: string
  breakMinutes?: number
  note?: string
}

/** POST /timesheets/:id/reject. */
export interface RejectInput {
  reason: string
}

/** POST /timesheets/approve-batch `{ ids }` (max 100). */
export interface ApproveBatchResponse {
  approved: string[]
  skipped: Array<{ id: string; reason: BatchSkipReason }>
}

/** POST /timesheet-exceptions/:id/resolve `{ note? }` -> `{ exception }`. */
export interface ResolveExceptionInput {
  note?: string
}

/** POST /shifts/:shiftId/work-logs -> 201 `{ workLog }`. */
export type WorkLogInput =
  | { kind: 'PHOTO'; fileId: string; body?: string }
  | { kind: 'NOTE'; body: string }
  | { kind: 'ISSUE'; body: string }
  | { kind: 'CHECKLIST'; data: { items: Array<{ label: string; done: boolean }> } }
