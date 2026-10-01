import type { ClockInInput } from '@/types/timesheetTypes'

/*
 * The phone's position for a clock-in or clock-out. GPS is optional on the API (a phone may have it off), so a
 * failure never blocks clocking: it resolves to a reason the UI can warn about, and the entry goes in without GPS.
 */

const TIMEOUT_MS = 10_000

export type GpsResult = { ok: true; gps: Required<ClockInInput> } | { ok: false; reason: 'unsupported' | 'denied' | 'unavailable' | 'timeout' }

/** The bits of `navigator.geolocation` used here, so tests can pass a fake. */
export type GeolocationLike = Pick<Geolocation, 'getCurrentPosition'>

/** Six decimals is about 10 cm; more is noise. */
const round6 = (value: number) => Math.round(value * 1e6) / 1e6

const REASONS: Record<number, 'denied' | 'unavailable' | 'timeout'> = { 1: 'denied', 2: 'unavailable', 3: 'timeout' }

export const currentPosition = (geolocation: GeolocationLike | undefined = typeof navigator === 'undefined' ? undefined : navigator.geolocation): Promise<GpsResult> =>
  new Promise(resolve => {
    if (!geolocation) {
      resolve({ ok: false, reason: 'unsupported' })

      return
    }

    geolocation.getCurrentPosition(
      position => resolve({ ok: true, gps: { lat: round6(position.coords.latitude), lng: round6(position.coords.longitude) } }),
      error => resolve({ ok: false, reason: REASONS[error.code] ?? 'unavailable' }),
      { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: 60_000 }
    )
  })

/** What to tell the worker when there is no position. */
export const gpsWarning = (reason: Exclude<GpsResult, { ok: true }>['reason']): string => {
  const why = {
    unsupported: 'This device cannot share its location',
    denied: 'Location access is blocked for this site',
    unavailable: 'Your location could not be found',
    timeout: 'Finding your location took too long'
  }[reason]

  return `${why}. You were clocked without GPS, so your supervisor will see an off-site exception to review.`
}
