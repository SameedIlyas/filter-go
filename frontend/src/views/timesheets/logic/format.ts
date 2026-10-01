import type { TimesheetException } from '@/types/timesheetTypes'

/** "8h", "7h 45m", "45m", "0m"; a dash when there is nothing to show (an open entry, a no-show). */
export const formatMinutes = (minutes: number | null | undefined): string => {
  if (minutes === null || minutes === undefined) return '—'

  const sign = minutes < 0 ? '-' : ''
  const whole = Math.abs(Math.round(minutes))
  const hours = Math.floor(whole / 60)
  const rest = whole % 60

  if (hours === 0) return `${sign}${rest}m`

  return rest === 0 ? `${sign}${hours}h` : `${sign}${hours}h ${rest}m`
}

/** Worked minus scheduled, as "+15m" / "-1h 5m"; empty when either side is missing or they match. */
export const formatVariance = (actual: number | null, scheduled: number): string => {
  if (actual === null) return ''

  const delta = actual - scheduled

  if (delta === 0) return ''

  return `${delta > 0 ? '+' : ''}${formatMinutes(delta)}`
}

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

const metres = (value: unknown): string => {
  const distance = num(value)

  if (distance === null) return 'no GPS'

  return distance >= 1000 ? `${(distance / 1000).toFixed(1)} km away` : `${distance} m away`
}

/**
 * One line explaining an exception from its `detail` (docs/types/timesheets.ts ExceptionDetail). Reads defensively:
 * a missing number falls back to the plain label.
 */
export const describeException = (exception: Pick<TimesheetException, 'type' | 'detail'>): string => {
  const detail = exception.detail ?? {}

  switch (exception.type) {
    case 'LATE_IN': {
      const late = num(detail.minutesLate)

      return late === null ? 'Clocked in late' : `Clocked in ${formatMinutes(late)} late`
    }

    case 'EARLY_OUT': {
      const early = num(detail.minutesEarly)

      return early === null ? 'Clocked out early' : `Clocked out ${formatMinutes(early)} early`
    }

    case 'OVERTIME': {
      const reasons = Array.isArray(detail.reasons) ? detail.reasons : []
      const parts: string[] = []
      const actual = num(detail.actualMinutes)
      const scheduled = num(detail.scheduledMinutes)
      const weekly = num(detail.weeklyMinutes)
      const limit = num(detail.weeklyLimitMinutes)

      if (reasons.includes('DAILY') && actual !== null && scheduled !== null) parts.push(`${formatMinutes(actual - scheduled)} over the shift`)
      if (reasons.includes('WEEKLY') && weekly !== null && limit !== null) parts.push(`${formatMinutes(weekly)} this week (limit ${formatMinutes(limit)})`)

      return parts.length ? `Overtime: ${parts.join('; ')}` : 'Overtime'
    }

    case 'GEOFENCE_MISS': {
      const parts = [
        ...('clockInDistanceMeters' in detail ? [`clock-in ${metres(detail.clockInDistanceMeters)}`] : []),
        ...('clockOutDistanceMeters' in detail ? [`clock-out ${metres(detail.clockOutDistanceMeters)}`] : [])
      ]

      return parts.length ? `Outside the site: ${parts.join(', ')}` : 'Outside the site'
    }

    case 'MISSING_CLOCK_OUT':
      return 'Never clocked out; closed at the scheduled end'
    case 'NO_SHOW':
      return 'Did not clock in'
    default:
      return String(exception.type)
  }
}

/** "just now", "12m ago", "3h ago", "2d ago": how long an exception has waited in the queue. */
export const formatAge = (instant: string, now: number): string => {
  const minutes = Math.max(0, Math.floor((now - Date.parse(instant)) / 60_000))

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)}h ago`

  return `${Math.floor(minutes / (24 * 60))}d ago`
}
