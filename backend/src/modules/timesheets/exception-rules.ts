import type { Config } from '../../config/env.js'
import type { Prisma } from '../../generated/prisma/client.js'
import { haversineMeters } from './geo.js'
import type { GeoPoint } from './geo.js'

export type WorkRules = Config['work']

/** Exception types recomputed from the entry's numbers. MISSING_CLOCK_OUT and NO_SHOW are set only by the sweep job. */
export const MANAGED_TYPES = ['LATE_IN', 'EARLY_OUT', 'OVERTIME', 'GEOFENCE_MISS'] as const
export type ManagedType = (typeof MANAGED_TYPES)[number]

export const isManaged = (type: string): type is ManagedType => (MANAGED_TYPES as readonly string[]).includes(type)

export interface RuleInput {
  scheduledStart: Date
  scheduledEnd: Date
  scheduledMinutes: number
  clockInAt: Date | null
  clockOutAt: Date | null
  actualMinutes: number | null
  /** The system closed this entry: there was no real clock-out, so no clock-out time/GPS rules apply. */
  autoClosed: boolean
  /** null = the GPS point was not captured. */
  clockInPoint: GeoPoint | null
  clockOutPoint: GeoPoint | null
  /** null = the site has no coordinates, so the geofence is skipped. */
  sitePoint: GeoPoint | null
  /** The worker's Monday-start-week total of actualMinutes over non-rejected entries, this one included. */
  weeklyMinutes: number
}

export interface DetectedException {
  type: ManagedType
  detail: Prisma.InputJsonObject
}

const MINUTE_MS = 60_000

const lateIn = (input: RuleInput, rules: WorkRules): DetectedException | null => {
  if (!input.clockInAt) return null

  const limit = input.scheduledStart.getTime() + rules.lateInMinutes * MINUTE_MS

  if (input.clockInAt.getTime() <= limit) return null

  return {
    type: 'LATE_IN',
    detail: { minutesLate: Math.floor((input.clockInAt.getTime() - input.scheduledStart.getTime()) / MINUTE_MS), thresholdMinutes: rules.lateInMinutes }
  }
}

const earlyOut = (input: RuleInput, rules: WorkRules): DetectedException | null => {
  if (!input.clockOutAt || input.autoClosed) return null

  const limit = input.scheduledEnd.getTime() - rules.earlyOutMinutes * MINUTE_MS

  if (input.clockOutAt.getTime() >= limit) return null

  return {
    type: 'EARLY_OUT',
    detail: { minutesEarly: Math.floor((input.scheduledEnd.getTime() - input.clockOutAt.getTime()) / MINUTE_MS), thresholdMinutes: rules.earlyOutMinutes }
  }
}

const overtime = (input: RuleInput, rules: WorkRules): DetectedException | null => {
  if (!input.clockInAt) return null

  const daily = input.actualMinutes !== null && input.actualMinutes > input.scheduledMinutes + rules.overtimeThresholdMinutes
  const weekly = input.weeklyMinutes > rules.weeklyOvertimeMinutes

  if (!daily && !weekly) return null

  return {
    type: 'OVERTIME',
    detail: {
      reasons: [...(daily ? ['DAILY'] : []), ...(weekly ? ['WEEKLY'] : [])],
      actualMinutes: input.actualMinutes,
      scheduledMinutes: input.scheduledMinutes,
      thresholdMinutes: rules.overtimeThresholdMinutes,
      weeklyMinutes: input.weeklyMinutes,
      weeklyLimitMinutes: rules.weeklyOvertimeMinutes
    }
  }
}

/** Distance in metres to the site, or null when the point is missing. */
const distanceOrMissing = (point: GeoPoint | null, site: GeoPoint, limit: number): { miss: boolean; distance: number | null } => {
  if (!point) return { miss: true, distance: null }

  const distance = haversineMeters(point, site)

  return { miss: distance > limit, distance: Math.round(distance) }
}

const geofence = (input: RuleInput, rules: WorkRules): DetectedException | null => {
  if (!input.sitePoint) return null

  const checks = [
    ...(input.clockInAt ? [{ key: 'clockInDistanceMeters', ...distanceOrMissing(input.clockInPoint, input.sitePoint, rules.geofenceMeters) }] : []),
    ...(input.clockOutAt && !input.autoClosed ? [{ key: 'clockOutDistanceMeters', ...distanceOrMissing(input.clockOutPoint, input.sitePoint, rules.geofenceMeters) }] : [])
  ].filter(check => check.miss)

  if (checks.length === 0) return null

  return {
    type: 'GEOFENCE_MISS',
    detail: { limitMeters: rules.geofenceMeters, ...Object.fromEntries(checks.map(check => [check.key, check.distance])) }
  }
}

/** Pure: which computed exceptions apply to this entry right now. Every threshold is strict ("more than"). */
export const detectExceptions = (input: RuleInput, rules: WorkRules): DetectedException[] =>
  [lateIn(input, rules), earlyOut(input, rules), overtime(input, rules), geofence(input, rules)].filter(
    (found): found is DetectedException => found !== null
  )
