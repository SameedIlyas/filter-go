import 'server-only'

import { createHash } from 'node:crypto'

/**
 * Fixed-window request counter kept in this server's memory. It is a first line of defence in front of the API
 * (which has its own limits): it stops one browser session from flooding the proxy. With several Next.js
 * instances each one counts separately, so the effective limit is per instance.
 */

type Window = { startedAt: number; count: number }

const windows = new Map<string, Window>()
const MAX_KEYS = 50_000

const keyFor = (bucket: string, token: string) =>
  `${bucket}:${createHash('sha256').update(token).digest('base64url').slice(0, 22)}`

/** Drops expired windows once the map gets large, so memory stays bounded. */
const prune = (now: number, windowMs: number) => {
  if (windows.size < MAX_KEYS) return

  for (const [key, window] of windows) {
    if (now - window.startedAt >= windowMs) windows.delete(key)
  }

  // Still full of live windows: forget the oldest ones (Map keeps insertion order) rather than grow without bound
  for (const key of windows.keys()) {
    if (windows.size < MAX_KEYS) break
    windows.delete(key)
  }
}

/** Counts one request. Returns the seconds to wait when over `limit` per `windowMs`, or null when allowed. */
export const hitRateLimit = (
  bucket: string,
  token: string,
  limit: number,
  windowMs = 60_000,
  now = Date.now()
): number | null => {
  const key = keyFor(bucket, token)
  const current = windows.get(key)

  if (!current || now - current.startedAt >= windowMs) {
    prune(now, windowMs)
    windows.set(key, { startedAt: now, count: 1 })

    return null
  }

  current.count += 1

  return current.count > limit ? Math.max(1, Math.ceil((current.startedAt + windowMs - now) / 1000)) : null
}

/** Test hook. */
export const resetRateLimits = () => windows.clear()
