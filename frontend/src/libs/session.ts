import 'server-only'

import { cache } from 'react'

import { cookies } from 'next/headers'
import type { NextResponse } from 'next/server'

import type { MeData } from '@/types/api'
import type { SessionUser } from '@/types/sessionTypes'
import { BackendError, callApi } from '@/libs/backend'

/*
 * The cookie holds the opaque session token issued by the FilterGO API. It is
 * httpOnly, so browser JavaScript never sees it; only the Next.js server reads
 * it and forwards it as a Bearer token (see `src/libs/backend.ts`).
 */
export const SESSION_COOKIE = 'filtergo-session'

const base = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/' }

export const setSessionCookie = (response: NextResponse, token: string, expiresAt: string) =>
  response.cookies.set({ name: SESSION_COOKIE, value: token, expires: new Date(expiresAt), ...base })

export const clearSessionCookie = (response: NextResponse) =>
  response.cookies.set({ name: SESSION_COOKIE, value: '', maxAge: 0, ...base })

export const getSessionToken = async () => (await cookies()).get(SESSION_COOKIE)?.value

/**
 * The signed-in user, or null. Cached per request. 401 => null (signed out);
 * any other failure throws so an API outage is not mistaken for a logout.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = await getSessionToken()

  if (!token) return null

  try {
    const { data } = await callApi<MeData>('/v1/auth/me', { token })

    return data.user
  } catch (error) {
    if (error instanceof BackendError && error.status === 401) return null

    throw error
  }
})
