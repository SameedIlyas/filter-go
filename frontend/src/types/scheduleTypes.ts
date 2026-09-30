/**
 * TypeScript contract for the Scheduling module: schedules generated from contracts, their shifts, assignment
 * (with overridable warnings), offers, the supervisor's board and coverage, and the field user's own view.
 *
 * Copied from backend/docs/types/scheduling.ts: keep the two in sync. Types only, no runtime code.
 * The `T` below is the envelope's `data` member; lists also carry `meta: PageMeta` next to `data`.
 * Dates: instants are ISO-8601 UTC strings, calendar dates are "YYYY-MM-DD".
 * Spec: docs/ARCHITECTURE.md section 5.
 */
import type { PageMeta } from './api'

export type { PageMeta }

export type ScheduleStatus = 'DRAFT' | 'PUBLISHED' | 'LOCKED' | 'CLOSED'
export type ShiftStatus = 'OPEN' | 'ASSIGNED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED'
export type OfferStatus = 'OFFERED' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN'
export type CoveragePatternType = 'WEEKLY' | 'INTERVAL' | 'AD_HOC'

/** Shift counts by status. Used for a schedule's `coverage` and (plus `extra`) the board footer. */
export interface ShiftCounts {
  total: number
  open: number
  assigned: number
  confirmed: number
  inProgress: number
  completed: number
  noShow: number
  cancelled: number
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

/** The contract terms frozen at generation, redacted per viewer: `billRate` ADMIN only, `payRate` ADMIN + SUPERVISOR. */
export interface TermsSnapshot {
  contractId: string
  contractNumber: string
  contractVersion: number
  billingType: 'PER_VISIT' | 'HOURLY' | 'MONTHLY_FIXED'
  billingCycle: 'PER_VISIT' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'

  /** IANA zone the coverage times were interpreted in. */
  siteTimezone: string
  serviceItems: Array<{
    lineId: string
    siteId: string
    serviceId: string | null
    description: string
    qty: string
    billRate?: string
    payRate?: string | null
    estMinutes: number | null
    taxCode: string | null
  }>
  coverage: Array<{
    siteId: string
    patternType: CoveragePatternType

    /** ISO weekdays, 1 = Monday. */
    weekdays: number[]

    /** "HH:mm" site-local; an end at or before the start crosses midnight. */
    timeStart: string | null
    timeEnd: string | null
    intervalDays: number | null
    visitsPerPeriod: number | null
  }>
  generatedAt: string
}

export interface Schedule {
  id: string
  contractId: string
  contractNumber: string
  contractVersion: number
  siteId: string
  site: { id: string; name: string }

  /** ADMIN and SUPERVISOR only. */
  supervisorId?: string | null
  periodStart: string
  periodEnd: string
  status: ScheduleStatus

  /** Sum of AD_HOC `visitsPerPeriod`, or null when the schedule has no ad-hoc coverage. */
  expectedVisits: number | null
  coverage: ShiftCounts
  publishedAt: string | null
  lockedAt: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string

  /** Detail responses only; never sent to CLIENT_USER. */
  termsSnapshot?: TermsSnapshot
}

/** POST /schedules/generate (ADMIN, SUPERVISOR). The period is clamped to the contract and at most 93 days. */
export interface GenerateScheduleRequest {
  contractId: string
  siteId: string
  periodStart: string
  periodEnd: string
  supervisorId?: string
}

/** 201 from POST /schedules/generate, and 200 from POST /schedules/:id/regenerate (DRAFT only). */
export interface GenerateScheduleResponse {
  schedule: Schedule
  shiftCount: number
}

/** GET /schedules: `status`, `contractId`, `siteId`, `from`/`to` (dates, period overlap), `page`, `limit` (<= 100). */
export interface ScheduleListResponse {
  schedules: Schedule[]
}

/** GET /schedules/:id and POST /schedules/:id/{publish,unpublish,lock,close} (empty body). DELETE -> `{ deleted: true }`. */
export interface ScheduleResponse {
  schedule: Schedule
}

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------

export interface Shift {
  id: string
  scheduleId: string
  scheduleStatus: ScheduleStatus
  siteId: string

  /** `timezone` is the site's, falling back to the organization's. Show times in it. */
  site: { id: string; name: string; timezone: string }
  scheduledStart: string
  scheduledEnd: string
  status: ShiftStatus
  assignedUser: { id: string; name: string } | null
  isExtra: boolean
  notes: string | null

  /** Contract line id when the shift maps to exactly one. */
  serviceRef: string | null

  /** ADMIN and SUPERVISOR only. */
  billableQty?: string | null

  /** ADMIN and SUPERVISOR only: offers still waiting for an answer. */
  pendingOfferCount?: number

  /** Not sent to CLIENT_USER. */
  cancelledReason?: string | null
  createdAt: string
  updatedAt: string
}

/** GET /shifts: `scheduleId`, `siteId`, `userId`, `status`, `from`/`to` (instants, on the start), `isExtra`, `unassigned`, paging. */
export interface ShiftListResponse {
  shifts: Shift[]
}

/** GET /shifts/:id, PATCH /shifts/:id, POST /shifts/:id/{assign,unassign,cancel,confirm}, POST /schedules/:id/shifts (201). */
export interface ShiftResponse {
  shift: Shift
}

/** POST /schedules/:id/shifts (ADMIN, SUPERVISOR). Not on LOCKED/CLOSED schedules. */
export interface AddShiftRequest {
  start: string
  end: string
  notes?: string
  assignedUserId?: string
  isExtra?: boolean
  billableQty?: string
  overrideWarnings?: boolean
  reason?: string
}

/** PATCH /shifts/:id (ADMIN, SUPERVISOR): at least one field. Refused once the shift is IN_PROGRESS or later. */
export interface PatchShiftRequest {
  start?: string
  end?: string
  notes?: string | null
  billableQty?: string | null
}

/** POST /shifts/extra (FIELD_USER): unplanned work on a PUBLISHED schedule at one of their sites. */
export interface ExtraShiftRequest {
  scheduleId: string
  start: string
  end: string
  notes?: string
}

// ---------------------------------------------------------------------------
// Assignment (section 5.4): warnings, not walls
// ---------------------------------------------------------------------------

export type BlockingCode = 'SHIFT_OVERLAP' | 'USER_NOT_ELIGIBLE' | 'SCHEDULE_LOCKED' | 'INVALID_STATE'
export type WarningCode = 'NO_SITE_ACCESS' | 'OUTSIDE_AVAILABILITY' | 'DOCUMENT_EXPIRED' | 'DOCUMENT_EXPIRING' | 'OVERTIME'

export interface BlockingIssue {
  code: BlockingCode
  message: string

  /** SHIFT_OVERLAP: `{ shiftId, scheduledStart, scheduledEnd }` of the clash. */
  data?: Record<string, unknown>
}

export interface AssignmentWarning {
  code: WarningCode
  message: string

  /** DOCUMENT_*: `{ type, expiresAt }`; OVERTIME: `{ weeklyMinutes, thresholdMinutes }`; OUTSIDE_AVAILABILITY: `{ timezone }`. */
  data?: Record<string, unknown>
}

/** POST /shifts/:id/validate-assignment `{ userId }`: a dry run, nothing is saved. */
export interface ValidateAssignmentResponse {
  blocking: BlockingIssue[]
  warnings: AssignmentWarning[]
}

/**
 * POST /shifts/:id/assign. With warnings and no `overrideWarnings: true` -> 422 ASSIGNMENT_WARNINGS with
 * `error.details.warnings` and nothing saved. Retry with the override (and an optional reason) to save; it is audited.
 */
export interface AssignRequest {
  userId: string
  overrideWarnings?: boolean
  reason?: string
}

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

export interface ShiftOffer {
  id: string
  shiftId: string
  userId: string
  status: OfferStatus
  offeredAt: string
}

/** POST /shifts/:id/offers `{ userIds }` (1..50, OPEN shifts) -> 201. */
export interface CreateOffersResponse {
  offers: ShiftOffer[]
}

/** GET /me/offers (FIELD_USER): own OFFERED offers, each with its shift. */
export interface MyOffersResponse {
  offers: Array<ShiftOffer & { shift: Shift }>
}

/** POST /shift-offers/:id/accept -> `{ offer, shift }`; /decline -> `{ offer }`. First accept wins. */
export interface AcceptOfferResponse {
  offer: ShiftOffer
  shift: Shift
}

// ---------------------------------------------------------------------------
// Board: GET /shifts/board (ADMIN, SUPERVISOR in scope)
// ---------------------------------------------------------------------------

/**
 * Query: `from`, `to` (instants, required; `to > from`, at most 45 days). Every shift that OVERLAPS the window is
 * returned, oldest first. Optional: `siteIds`, `userIds`, `statuses` (comma-separated), `scheduleId`,
 * `unassigned` ("true"/"false"), `includeDraft` (default "true").
 */
export interface BoardShift {
  id: string
  scheduleId: string
  scheduleStatus: ScheduleStatus
  siteId: string
  site: { id: string; name: string; timezone: string }
  scheduledStart: string
  scheduledEnd: string
  status: ShiftStatus
  assignedUser: { id: string; name: string } | null
  isExtra: boolean
  hasNotes: boolean
}

export interface BoardResponse {
  window: { from: string; to: string }

  /** At most 2000. `truncated: true` means more matched: narrow the filters. */
  shifts: BoardShift[]

  /** Over every matching shift, not just the returned rows. */
  counts: ShiftCounts & { extra: number }
  truncated: boolean
}

// ---------------------------------------------------------------------------
// Coverage: GET /coverage (ADMIN, SUPERVISOR in scope), PUBLISHED schedules only
// ---------------------------------------------------------------------------

export interface CoverageTally {
  total: number
  filled: number
  open: number
}

/** Query: `from`, `to` (dates, site-local), `siteId`, `unfilledLimit` (1..100, default 20). */
export interface CoverageResponse {
  from: string
  to: string
  totals: CoverageTally
  sites: Array<{ siteId: string; siteName: string } & CoverageTally>
  days: Array<{ date: string; siteId: string; siteName: string } & CoverageTally>

  /** OPEN shifts that have not ended yet, soonest first. */
  unfilled: Array<{ id: string; scheduleId: string; siteId: string; siteName: string; scheduledStart: string; scheduledEnd: string; notes: string | null }>
}
