// Node Imports
import { createHmac, timingSafeEqual } from 'node:crypto'

// Next Imports
import { cookies } from 'next/headers'

// Third-party Imports
import 'server-only'

// Type Imports
import type { SessionUser } from '@/types/sessionTypes'

/*
 * Minimal, self-contained session handling.
 *
 * The cookie holds `<payload>.<signature>` where the payload is a base64url
 * JSON blob and the signature is an HMAC-SHA256 of it. That means the payload
 * is readable by the client but cannot be tampered with, so it must never
 * carry secrets — keep it to display data plus an expiry.
 *
 * To move onto the real FilterGO API, leave this file alone and change only
 * the credential check in `src/app/api/login/route.ts`.
 */

export const SESSION_COOKIE_NAME = 'breeze-session'

const MAX_AGE_SECONDS = 60 * 60 * 24 * 7 // 7 days

type SessionPayload = SessionUser & { exp: number }

const getSecret = () => {
  const secret = process.env.AUTH_SECRET

  if (!secret) {
    throw new Error('AUTH_SECRET is not set. Generate one with `openssl rand -base64 32` and add it to your .env file.')
  }

  return secret
}

const sign = (payload: string) => createHmac('sha256', getSecret()).update(payload).digest('base64url')

// Serialise and sign a user into a cookie value
const seal = (user: SessionUser) => {
  const payload: SessionPayload = { ...user, exp: Date.now() + MAX_AGE_SECONDS * 1000 }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')

  return `${encoded}.${sign(encoded)}`
}

// Verify signature and expiry, returning the user only if both hold
const unseal = (token: string): SessionUser | null => {
  const [encoded, signature] = token.split('.')

  if (!encoded || !signature) {
    return null
  }

  const expected = Buffer.from(sign(encoded))
  const received = Buffer.from(signature)

  // Length check first: timingSafeEqual throws on a length mismatch
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return null
  }

  try {
    const { exp, ...user } = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as SessionPayload

    if (typeof exp !== 'number' || Date.now() > exp) {
      return null
    }

    return user
  } catch {
    return null
  }
}

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/'
}

/** Cookie descriptor that signs the user in. Pass to `response.cookies.set()`. */
export const createSessionCookie = (user: SessionUser) => ({
  name: SESSION_COOKIE_NAME,
  value: seal(user),
  maxAge: MAX_AGE_SECONDS,
  ...cookieOptions
})

/** Cookie descriptor that signs the user out. Pass to `response.cookies.set()`. */
export const clearSessionCookie = () => ({
  name: SESSION_COOKIE_NAME,
  value: '',
  maxAge: 0,
  ...cookieOptions
})

/**
 * Read the current session on the server, or null when signed out.
 *
 * Returns early when no cookie is present, so an unauthenticated request never
 * needs `AUTH_SECRET` to be configured.
 */
export const getSession = async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value

  return token ? unseal(token) : null
}
