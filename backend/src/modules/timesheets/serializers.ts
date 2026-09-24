import type { TimesheetException, WorkLog } from '../../generated/prisma/client.js'
import { canSeeBillRate, canSeePayRate } from '../../lib/access.js'
import type { Actor } from '../../lib/access.js'
import { money } from '../../lib/money.js'
import type { EntryRow } from './entries.js'
import { haversineMeters, pointOf } from './geo.js'

type Viewer = Pick<Actor, 'role'>
type UserNames = Map<string, { id: string; name: string }>

/** The kinds of work log a client may see. */
export const CLIENT_LOG_KINDS: WorkLog['kind'][] = ['PHOTO', 'NOTE']

export const serializeException = (exception: TimesheetException) => ({
  id: exception.id,
  type: exception.type,
  detail: exception.detail,
  resolved: exception.resolved,
  resolvedById: exception.resolvedById,
  resolvedAt: exception.resolvedAt,
  createdAt: exception.createdAt
})

const shiftSummary = (entry: EntryRow) => ({
  id: entry.shift.id,
  scheduleId: entry.shift.scheduleId,
  siteId: entry.shift.siteId,
  scheduledStart: entry.shift.scheduledStart,
  scheduledEnd: entry.shift.scheduledEnd,
  status: entry.shift.status,
  isExtra: entry.shift.isExtra
})

const siteSummary = (entry: EntryRow) => ({ id: entry.shift.site.id, name: entry.shift.site.name })

/** Client portal view: finished, approved work only, no worker identity, GPS, exceptions, flags for pay or rates. */
const serializeClientEntry = (entry: EntryRow) => ({
  id: entry.id,
  shiftId: entry.shiftId,
  status: entry.status,
  clockInAt: entry.clockInAt,
  clockOutAt: entry.clockOutAt,
  breakMinutes: entry.breakMinutes,
  scheduledMinutes: entry.scheduledMinutes,
  actualMinutes: entry.actualMinutes,
  billable: entry.billable,
  approvedAt: entry.approvedAt,
  shift: shiftSummary(entry),
  site: siteSummary(entry)
})

/**
 * The only shape of a timesheet entry that leaves the API. Rate stamps are added per viewer: the pay rate for
 * ADMIN and SUPERVISOR, the bill rate for ADMIN only. The keys are omitted (not null) for everyone else.
 */
export const serializeEntry = (entry: EntryRow, viewer: Viewer, users: UserNames = new Map()) => {
  if (viewer.role === 'CLIENT_USER') return serializeClientEntry(entry)

  return {
    id: entry.id,
    shiftId: entry.shiftId,
    userId: entry.userId,
    user: users.get(entry.userId) ?? null,
    status: entry.status,
    clockInAt: entry.clockInAt,
    clockOutAt: entry.clockOutAt,
    breakMinutes: entry.breakMinutes,
    scheduledMinutes: entry.scheduledMinutes,
    actualMinutes: entry.actualMinutes,
    billable: entry.billable,
    payable: entry.payable,
    autoClosed: entry.autoClosed,
    adjustmentReason: entry.adjustmentReason,
    rejectionReason: entry.rejectionReason,
    approvedById: entry.approvedById,
    approvedAt: entry.approvedAt,
    ...(canSeePayRate(viewer) ? { payRateSnapshot: money(entry.payRateSnapshot) } : {}),
    ...(canSeeBillRate(viewer) ? { billRateSnapshot: money(entry.billRateSnapshot) } : {}),
    shift: shiftSummary(entry),
    site: siteSummary(entry),
    exceptions: entry.exceptions.map(serializeException),
    openExceptionCount: entry.exceptions.filter(exception => !exception.resolved).length,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  }
}

const clockPoint = (at: Date | null, lat: number | null, lng: number | null, site: { lat: number | null; lng: number | null }) => {
  const point = pointOf(lat, lng)
  const sitePoint = pointOf(site.lat, site.lng)

  return { at, lat, lng, distanceMeters: point && sitePoint ? Math.round(haversineMeters(point, sitePoint)) : null }
}

export const serializeWorkLog = (log: WorkLog, viewer: Viewer, users: UserNames = new Map()) => ({
  id: log.id,
  shiftId: log.shiftId,
  kind: log.kind,
  fileId: log.fileId,
  body: log.body,
  data: log.data,
  at: log.at,
  ...(viewer.role === 'CLIENT_USER' ? {} : { userId: log.userId, user: users.get(log.userId) ?? null })
})

/** Detail view: the summary plus the GPS points, the site's coordinates and the work logs (clients: no GPS, no coordinates). */
export const serializeEntryDetail = (entry: EntryRow, viewer: Viewer, workLogs: WorkLog[], users: UserNames) => {
  const summary = serializeEntry(entry, viewer, users)
  const logs = workLogs.map(log => serializeWorkLog(log, viewer, users))

  if (viewer.role === 'CLIENT_USER') return { ...summary, workLogs: logs }

  const { site } = entry.shift

  return {
    ...summary,
    site: { id: site.id, name: site.name, address: site.address, lat: site.lat, lng: site.lng, timezone: site.timezone },
    clockIn: clockPoint(entry.clockInAt, entry.clockInLat, entry.clockInLng, site),
    clockOut: clockPoint(entry.clockOutAt, entry.clockOutLat, entry.clockOutLng, site),
    workLogs: logs
  }
}

/** A queue row: the unresolved exception plus the entry it belongs to (with rates per viewer role). */
export const serializeQueueItem = (exception: TimesheetException & { entry: EntryRow }, viewer: Viewer, users: UserNames) => ({
  ...serializeException(exception),
  timesheet: serializeEntry(exception.entry, viewer, users)
})
