// Next Imports
import { NextResponse } from 'next/server'

// Lib Imports
import { clearSessionCookie } from '@/libs/session'

/** Signs the current user out by expiring the session cookie. */
export async function POST() {
  const response = NextResponse.json({ ok: true })

  response.cookies.set(clearSessionCookie())

  return response
}
