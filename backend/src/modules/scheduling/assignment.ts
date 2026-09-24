import type { Config } from '../../config/env.js'
import type { ScheduleStatus, ShiftStatus } from '../../generated/prisma/client.js'
import { AppError, Errors } from '../../lib/errors.js'
import type { Warning } from '../../lib/errors.js'
import type { Db } from '../../lib/prisma.js'
import { addDays, eachDay, fromDateOnly, isoWeekday, localDate, minutesBetween, startOfWeek, zonedInstant } from '../../lib/time.js'
import { EDITABLE_SHIFT_STATUSES, SHIFT_TRANSITIONS } from './constants.js'
import { orgTimezone, siteTimezone } from './timezones.js'

/**
 * Assignment validation (docs/ARCHITECTURE.md 5.4). ONE function computes everything, and `validate-assignment`,
 * `assign`, "add shift with assignee" and offer-accept all call it, so the dry run can never disagree with the real thing.
 *
 * Blocking problems are never overridable. Warnings are, by resending with `overrideWarnings: true`.
 */

export type BlockingCode = 'SCHEDULE_LOCKED' | 'INVALID_STATE' | 'USER_NOT_ELIGIBLE' | 'SHIFT_OVERLAP'

export interface BlockingIssue {
  code: BlockingCode
  message: string
  data?: Record<string, unknown>
}

export interface AssignmentCheck {
  blocking: BlockingIssue[]
  warnings: Warning[]
}

export interface ShiftToAssign {
  id: string
  siteId: string
  scheduledStart: Date
  scheduledEnd: Date
  status: ShiftStatus
}

export interface AssignmentInput {
  orgId: string
  config: Pick<Config, 'work'>
  shift: ShiftToAssign
  scheduleStatus: ScheduleStatus
  userId: string
}

/** Days before expiry at which a still-valid document is flagged. */
const DOCUMENT_EXPIRING_DAYS = 14

/** An availability window that ends at 23:59 means "until the end of the day". */
const END_OF_DAY = '23:59'

const isoOf = (date: Date): string => date.toISOString()

// ---------------------------------------------------------------------------
// Blocking rules
// ---------------------------------------------------------------------------

const shiftBlockers = (shift: ShiftToAssign, scheduleStatus: ScheduleStatus): BlockingIssue[] => {
  const blockers: BlockingIssue[] = []

  if (scheduleStatus === 'LOCKED' || scheduleStatus === 'CLOSED') {
    blockers.push({ code: 'SCHEDULE_LOCKED', message: 'This schedule is locked and can no longer be changed.' })
  }

  if (!EDITABLE_SHIFT_STATUSES.includes(shift.status)) {
    blockers.push({
      code: 'INVALID_STATE',
      message: `This shift is ${shift.status.toLowerCase().replace('_', ' ')} and can no longer be assigned.`,
      data: { from: shift.status, to: 'ASSIGNED', allowed: SHIFT_TRANSITIONS[shift.status] }
    })
  }

  return blockers
}

const findOverlap = (db: Db, input: AssignmentInput) =>
  db.shift.findFirst({
    where: {
      orgId: input.orgId,
      assignedUserId: input.userId,
      id: { not: input.shift.id },
      status: { not: 'CANCELLED' },
      scheduledStart: { lt: input.shift.scheduledEnd },
      scheduledEnd: { gt: input.shift.scheduledStart }
    },
    orderBy: { scheduledStart: 'asc' },
    select: { id: true, scheduledStart: true, scheduledEnd: true }
  })

/** The shift a person already has that overlaps `input.shift`, as a blocking issue (or nothing). */
export const overlapBlocker = async (db: Db, input: AssignmentInput): Promise<BlockingIssue | null> => {
  const clash = await findOverlap(db, input)

  return clash
    ? {
        code: 'SHIFT_OVERLAP',
        message: 'This person already has a shift at that time.',
        data: { shiftId: clash.id, scheduledStart: isoOf(clash.scheduledStart), scheduledEnd: isoOf(clash.scheduledEnd) }
      }
    : null
}

const eligibilityBlocker = async (db: Db, input: AssignmentInput): Promise<BlockingIssue | null> => {
  const user = await db.user.findFirst({ where: { id: input.userId, orgId: input.orgId }, select: { status: true, role: true } })
  const eligible = user?.status === 'ACTIVE' && (user.role === 'FIELD_USER' || user.role === 'SUPERVISOR')

  return eligible
    ? null
    : { code: 'USER_NOT_ELIGIBLE', message: 'Only active field users and supervisors of this organization can be assigned to a shift.' }
}

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------

const siteAccessWarnings = async (db: Db, input: AssignmentInput): Promise<Warning[]> => {
  const access = await db.userSiteAccess.findFirst({ where: { userId: input.userId, siteId: input.shift.siteId }, select: { id: true } })

  return access ? [] : [{ code: 'NO_SITE_ACCESS', message: 'This person has not been given access to this site.' }]
}

interface Window {
  startTime: string
  endTime: string
}

/** Is `[from, to]` (a slice of one local day) inside one of that day's windows? */
const insideWindow = (windows: Window[], day: string, dayEnd: Date, from: Date, to: Date, zone: string): boolean =>
  windows.some(window => {
    const windowStart = zonedInstant(day, window.startTime, zone)
    const windowEnd = window.endTime === END_OF_DAY ? dayEnd : zonedInstant(day, window.endTime, zone)

    return windowStart <= from && to <= windowEnd
  })

/**
 * Availability windows are wall-clock times in the ORGANIZATION zone. A shift is split at local midnights and every
 * slice must sit inside a window of that weekday. A person with no windows at all gets no warning: unknown is not unavailable.
 */
const availabilityWarnings = async (db: Db, input: AssignmentInput): Promise<Warning[]> => {
  const windows = await db.userAvailability.findMany({ where: { userId: input.userId }, select: { weekday: true, startTime: true, endTime: true } })

  if (windows.length === 0) return []

  const zone = await orgTimezone(db, input.orgId)
  const { scheduledStart: start, scheduledEnd: end } = input.shift
  const days = eachDay(localDate(start, zone), localDate(new Date(end.getTime() - 1), zone))

  const fits = days.every(day => {
    const dayStart = zonedInstant(day, '00:00', zone)
    const dayEnd = zonedInstant(addDays(day, 1), '00:00', zone)
    const from = start > dayStart ? start : dayStart
    const to = end < dayEnd ? end : dayEnd

    return insideWindow(windows.filter(window => window.weekday === isoWeekday(day)), day, dayEnd, from, to, zone)
  })

  return fits
    ? []
    : [{ code: 'OUTSIDE_AVAILABILITY', message: 'This shift is outside the times this person has said they are available.', data: { timezone: zone } }]
}

const documentWarnings = async (db: Db, input: AssignmentInput, zone: string): Promise<Warning[]> => {
  const documents = await db.userDocument.findMany({
    where: { orgId: input.orgId, userId: input.userId, expiresAt: { not: null } },
    select: { type: true, expiresAt: true },
    orderBy: [{ expiresAt: 'asc' }, { type: 'asc' }]
  })

  const shiftDay = localDate(input.shift.scheduledStart, zone)
  const lastExpiringDay = addDays(shiftDay, DOCUMENT_EXPIRING_DAYS)

  return documents.flatMap((document): Warning[] => {
    const expiresAt = document.expiresAt ? fromDateOnly(document.expiresAt) : null

    if (!expiresAt) return []

    if (expiresAt < shiftDay) {
      return [{ code: 'DOCUMENT_EXPIRED', message: `Their ${document.type} had expired before this shift.`, data: { type: document.type, expiresAt } }]
    }

    if (expiresAt <= lastExpiringDay) {
      return [{ code: 'DOCUMENT_EXPIRING', message: `Their ${document.type} expires soon after this shift.`, data: { type: document.type, expiresAt } }]
    }

    return []
  })
}

/** Total scheduled minutes in the Monday-start week (site zone) that contains the shift, this shift included. */
const weeklyMinutes = async (db: Db, input: AssignmentInput, zone: string): Promise<number> => {
  const weekStart = startOfWeek(input.shift.scheduledStart, zone)
  const weekEnd = zonedInstant(addDays(localDate(weekStart, zone), 7), '00:00', zone)

  const others = await db.shift.findMany({
    where: {
      orgId: input.orgId,
      assignedUserId: input.userId,
      id: { not: input.shift.id },
      status: { not: 'CANCELLED' },
      scheduledStart: { gte: weekStart, lt: weekEnd }
    },
    select: { scheduledStart: true, scheduledEnd: true }
  })

  return others.reduce((total, other) => total + minutesBetween(other.scheduledStart, other.scheduledEnd), minutesBetween(input.shift.scheduledStart, input.shift.scheduledEnd))
}

const overtimeWarnings = async (db: Db, input: AssignmentInput, zone: string): Promise<Warning[]> => {
  const minutes = await weeklyMinutes(db, input, zone)
  const threshold = input.config.work.weeklyOvertimeMinutes

  return minutes > threshold
    ? [{ code: 'OVERTIME', message: 'This would put them over the weekly overtime threshold.', data: { weeklyMinutes: minutes, thresholdMinutes: threshold } }]
    : []
}

const warningsFor = async (db: Db, input: AssignmentInput): Promise<Warning[]> => {
  const zone = await siteTimezone(db, input.orgId, input.shift.siteId)

  return [
    ...(await siteAccessWarnings(db, input)),
    ...(await availabilityWarnings(db, input)),
    ...(await documentWarnings(db, input, zone)),
    ...(await overtimeWarnings(db, input, zone))
  ]
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Everything wrong (or worth knowing) about putting `userId` on `shift`. Pass the transaction client and hold the
 * user's row lock when the result is going to be acted on, so the overlap check and the write are one atomic step.
 */
export const evaluateAssignment = async (db: Db, input: AssignmentInput): Promise<AssignmentCheck> => {
  const blocking = shiftBlockers(input.shift, input.scheduleStatus)
  const notEligible = await eligibilityBlocker(db, input)

  if (notEligible) return { blocking: [...blocking, notEligible], warnings: [] }

  const overlap = await overlapBlocker(db, input)

  return { blocking: overlap ? [...blocking, overlap] : blocking, warnings: await warningsFor(db, input) }
}

/** The error a blocking issue turns into when it stops a real write. Uses the module's own error codes. */
export const blockingError = (issue: BlockingIssue): AppError => {
  switch (issue.code) {
    case 'SCHEDULE_LOCKED':
      return new AppError(409, 'SCHEDULE_LOCKED', issue.message)
    case 'SHIFT_OVERLAP':
      return new AppError(409, 'SHIFT_OVERLAP', issue.message, { details: { context: issue.data } })
    case 'INVALID_STATE':
      return new AppError(409, 'INVALID_STATE', issue.message, {
        details: { entity: 'shift', from: String(issue.data?.from), to: 'ASSIGNED', allowed: (issue.data?.allowed as string[] | undefined) ?? [] }
      })
    case 'USER_NOT_ELIGIBLE':
      return Errors.unprocessable(issue.message)
  }
}

export const throwIfBlocked = (check: AssignmentCheck): void => {
  const first = check.blocking[0]

  if (first) throw blockingError(first)
}

export const assignmentWarningsError = (warnings: Warning[]): AppError =>
  new AppError(422, 'ASSIGNMENT_WARNINGS', 'This assignment has warnings. Review them and resend with overrideWarnings to go ahead.', { details: { warnings } })
