import { createHash, randomBytes } from 'node:crypto'

/** 256 bits of randomness, URL-safe. The raw value is only ever shown to the client once. */
export const generateToken = (prefix: string): string => `${prefix}_${randomBytes(32).toString('base64url')}`

export const SESSION_TOKEN_PREFIX = 'fps'
export const LINK_TOKEN_PREFIX = 'fpl'

/**
 * SHA-256 is the right tool here (not a slow password hash): the inputs are 256-bit random
 * values, so they cannot be brute-forced, and we need a fast indexed lookup on every request.
 */
export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

/** Stable, non-reversible key for throttling by email without storing the address. */
export const emailKey = (email: string): string => sha256(`email:${email}`)

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,200}$/
