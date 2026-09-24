import { createHmac, timingSafeEqual } from 'node:crypto'

/** Stripe rejects events older (or further in the future) than this, which stops a captured request being replayed later. */
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60

const HEX_SHA256 = /^[0-9a-f]{64}$/i
const TIMESTAMP = /^\d{1,12}$/

export interface SignatureCheck {
  /** The `Stripe-Signature` header exactly as received. */
  header: string | undefined
  /** The exact request text. Never re-serialised JSON: one changed byte changes the HMAC. */
  rawBody: string | undefined
  /** null / empty = not configured, which fails closed. */
  secret: string | null
  nowMs?: number
}

const parseHeader = (header: string): { timestamp: string; signatures: string[] } | null => {
  const pairs = header.split(',').map((part): [string, string] => {
    const at = part.indexOf('=')

    return at < 0 ? ['', ''] : [part.slice(0, at).trim(), part.slice(at + 1).trim()]
  })
  const timestamps = pairs.filter(([key]) => key === 't').map(([, value]) => value)
  const signatures = pairs.filter(([key, value]) => key === 'v1' && HEX_SHA256.test(value)).map(([, value]) => value)
  const [timestamp] = timestamps

  // Exactly one well-formed timestamp and at least one well-formed v1 signature (several while a secret is rotating)
  if (timestamps.length !== 1 || timestamp === undefined || !TIMESTAMP.test(timestamp) || signatures.length === 0) return null

  return { timestamp, signatures }
}

/**
 * `Stripe-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<rawBody>")>`.
 * True only for a configured secret, a fresh timestamp and a matching signature (constant-time compare).
 * Returns a plain boolean on purpose: callers must not be able to tell WHICH check failed.
 */
export const verifyStripeSignature = ({ header, rawBody, secret, nowMs = Date.now() }: SignatureCheck): boolean => {
  if (!secret || header === undefined || rawBody === undefined) return false

  const parsed = parseHeader(header)

  if (!parsed) return false

  if (Math.abs(nowMs / 1000 - Number(parsed.timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return false

  const expected = createHmac('sha256', secret).update(`${parsed.timestamp}.${rawBody}`).digest()

  return parsed.signatures.some(signature => {
    const candidate = Buffer.from(signature, 'hex')

    return candidate.length === expected.length && timingSafeEqual(candidate, expected)
  })
}
