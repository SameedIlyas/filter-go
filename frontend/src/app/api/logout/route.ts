import { NextResponse } from 'next/server'

import { callApi } from '@/libs/backend'
import { clearSessionCookie, getSessionToken } from '@/libs/session'

export async function POST() {
  const token = await getSessionToken()

  // Best effort: the cookie is cleared no matter what.
  if (token) await callApi('/v1/auth/logout', { method: 'POST', token }).catch(() => undefined)

  const response = NextResponse.json({ success: true, data: { ok: true }, error: null })

  clearSessionCookie(response)

  return response
}
