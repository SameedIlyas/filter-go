import type { Prisma, ShiftOffer, ShiftStatus } from '../../generated/prisma/client.js'
import { canSeeBillRate, canSeePayRate } from '../../lib/access.js'
import type { Actor } from '../../lib/access.js'
import { money } from '../../lib/money.js'
import { parseTermsSnapshot, redactSnapshot } from '../../lib/terms-snapshot.js'
import { fromDateOnly } from '../../lib/time.js'

type Viewer = Pick<Actor, 'role'>

const isStaff = (viewer: Viewer): boolean => viewer.role === 'ADMIN' || viewer.role === 'SUPERVISOR'

// ---------------------------------------------------------------------------
// Coverage summary (counts of shifts by status)
// ---------------------------------------------------------------------------

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

const COUNT_KEY: Record<ShiftStatus, keyof Omit<ShiftCounts, 'total'>> = {
  OPEN: 'open',
  ASSIGNED: 'assigned',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'inProgress',
  COMPLETED: 'completed',
  NO_SHOW: 'noShow',
  CANCELLED: 'cancelled'
}

export const emptyCounts = (): ShiftCounts => ({ total: 0, open: 0, assigned: 0, confirmed: 0, inProgress: 0, completed: 0, noShow: 0, cancelled: 0 })

export const countsFromGroups = (groups: Array<{ status: ShiftStatus; count: number }>): ShiftCounts =>
  groups.reduce<ShiftCounts>((counts, group) => ({ ...counts, total: counts.total + group.count, [COUNT_KEY[group.status]]: counts[COUNT_KEY[group.status]] + group.count }), emptyCounts())

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export const SCHEDULE_INCLUDE = {
  site: { select: { id: true, name: true } },
  contract: { select: { contractNumber: true } }
} satisfies Prisma.ScheduleInclude

export type ScheduleRow = Prisma.ScheduleGetPayload<{ include: typeof SCHEDULE_INCLUDE }>

/** The snapshot a viewer may see: rates by role (2.3), and nothing at all for client users. */
export const snapshotFor = (snapshot: unknown, viewer: Viewer) =>
  viewer.role === 'CLIENT_USER' ? undefined : redactSnapshot(parseTermsSnapshot(snapshot), { canSeeBillRate: canSeeBillRate(viewer), canSeePayRate: canSeePayRate(viewer) })

const expectedVisits = (snapshot: unknown): number | null => {
  const adHoc = parseTermsSnapshot(snapshot).coverage.filter(row => row.patternType === 'AD_HOC')

  return adHoc.length === 0 ? null : adHoc.reduce((total, row) => total + (row.visitsPerPeriod ?? 0), 0)
}

export const serializeSchedule = (row: ScheduleRow, viewer: Viewer, counts: ShiftCounts, options: { withSnapshot: boolean }) => ({
  id: row.id,
  contractId: row.contractId,
  contractNumber: row.contract.contractNumber,
  contractVersion: row.contractVersion,
  siteId: row.siteId,
  site: row.site,
  ...(isStaff(viewer) ? { supervisorId: row.supervisorId } : {}),
  periodStart: fromDateOnly(row.periodStart),
  periodEnd: fromDateOnly(row.periodEnd),
  status: row.status,
  expectedVisits: expectedVisits(row.termsSnapshot),
  coverage: counts,
  publishedAt: row.publishedAt,
  lockedAt: row.lockedAt,
  closedAt: row.closedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  ...(options.withSnapshot ? { termsSnapshot: snapshotFor(row.termsSnapshot, viewer) } : {})
})

export type ScheduleView = ReturnType<typeof serializeSchedule>


// ---------------------------------------------------------------------------
// Shift
// ---------------------------------------------------------------------------

export const SHIFT_INCLUDE = {
  site: { select: { id: true, name: true, timezone: true } },
  schedule: { select: { status: true } },
  _count: { select: { offers: { where: { status: 'OFFERED' } } } }
} satisfies Prisma.ShiftInclude

export type ShiftRow = Prisma.ShiftGetPayload<{ include: typeof SHIFT_INCLUDE }>

export interface ShiftContext {
  assignee: { id: string; name: string } | null
  /** Resolved site timezone (site.timezone ?? organization.timezone). */
  timezone: string
}

/**
 * Shifts never carry a rate. Quantities and internal cancellation reasons are for staff; a client user sees the
 * plan (who, where, when, status) and nothing else.
 */
export const serializeShift = (row: ShiftRow, viewer: Viewer, context: ShiftContext) => ({
  id: row.id,
  scheduleId: row.scheduleId,
  scheduleStatus: row.schedule.status,
  siteId: row.siteId,
  site: { id: row.site.id, name: row.site.name, timezone: context.timezone },
  scheduledStart: row.scheduledStart,
  scheduledEnd: row.scheduledEnd,
  status: row.status,
  assignedUser: context.assignee,
  isExtra: row.isExtra,
  notes: row.notes,
  serviceRef: row.serviceRef,
  ...(isStaff(viewer) ? { billableQty: money(row.billableQty), pendingOfferCount: row._count.offers } : {}),
  ...(viewer.role === 'CLIENT_USER' ? {} : { cancelledReason: row.cancelledReason }),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
})

export type ShiftView = ReturnType<typeof serializeShift>

// ---------------------------------------------------------------------------
// Offer
// ---------------------------------------------------------------------------

export const serializeOffer = (offer: ShiftOffer) => ({
  id: offer.id,
  shiftId: offer.shiftId,
  userId: offer.userId,
  status: offer.status,
  offeredAt: offer.at
})

export const serializeOfferWithShift = (offer: ShiftOffer, shift: ShiftView) => ({ ...serializeOffer(offer), shift })
