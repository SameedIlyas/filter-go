import { z } from 'zod'

export interface GeoPoint {
  lat: number
  lng: number
}

const EARTH_RADIUS_METERS = 6_371_008.8

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

/** Great-circle distance between two points in metres (haversine). */
export const haversineMeters = (a: GeoPoint, b: GeoPoint): number => {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)))
}

export const latField = z.number().min(-90, 'Latitude must be between -90 and 90.').max(90, 'Latitude must be between -90 and 90.')
export const lngField = z.number().min(-180, 'Longitude must be between -180 and 180.').max(180, 'Longitude must be between -180 and 180.')

/** A row's nullable coordinate columns -> a point, or null when either is missing. */
export const pointOf = (lat: number | null, lng: number | null): GeoPoint | null => (lat === null || lng === null ? null : { lat, lng })
