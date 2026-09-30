import { NextResponse } from 'next/server'

import { callApi } from '@/libs/backend'
import { errorResponse } from '@/libs/apiResponse'
import { hitRateLimit } from '@/libs/rateLimit'
import { getSessionToken } from '@/libs/session'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

// Allow-list of API paths the browser may reach. Login/logout have their own handlers because they touch the cookie.
const ALLOWED = [
  new RegExp(`^auth/(me|logout-all|change-password|sessions(/${UUID})?)$`),
  new RegExp(`^admin/users(/invite|/${UUID}(/revoke-sessions)?)?$`),
  new RegExp(`^leads(/${UUID}(/(status|activities|convert|surveys(/${UUID})?))?)?$`),
  new RegExp(`^users(/${UUID}(/(availability|sites|compliance|documents(/${UUID})?))?)?$`),
  /^org$/,
  new RegExp(`^services(/${UUID})?$`),
  /^tax-rates(\/[A-Za-z0-9_.-]{1,32})?$/,
  /^audit-events$/,
  new RegExp(`^clients(/${UUID}(/sites)?)?$`),
  new RegExp(`^sites(/${UUID})?$`),
  new RegExp(`^contracts(/${UUID}(/(lines|coverage|submit|sign|suspend|resume|cancel|new-version))?)?$`),
  new RegExp(`^schedules(/generate|/${UUID}(/(publish|unpublish|lock|close|regenerate|shifts))?)?$`),
  new RegExp(`^shifts(/board|/extra|/${UUID}(/(validate-assignment|assign|unassign|cancel|confirm|offers))?)?$`),
  new RegExp(`^shift-offers/${UUID}/(accept|decline)$`),
  /^me\/(shifts|offers)$/
]

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** Generous for a busy screen (each page fires several queries), low enough to stop a runaway loop or script. */
const REQUESTS_PER_MINUTE = 600

const fail = (status: number, code: string, message: string, headers?: Record<string, string>) =>
  NextResponse.json({ success: false, data: null, error: { code, message } }, { status, headers })

async function handle(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const route = (await params).path.join('/')

  if (!ALLOWED.some(pattern => pattern.test(route))) return fail(404, 'NOT_FOUND', 'Not found.')

  const token = await getSessionToken()

  if (!token) return fail(401, 'UNAUTHENTICATED', 'You are not signed in.')

  const retryAfter = hitRateLimit('api', token, REQUESTS_PER_MINUTE)

  if (retryAfter)
    return fail(429, 'RATE_LIMITED', 'Too many requests. Try again in a moment.', { 'retry-after': String(retryAfter) })

  const hasBody = !['GET', 'HEAD', 'DELETE'].includes(req.method)

  // CSRF hardening on top of SameSite=Lax: cross-site forms cannot send JSON
  if (hasBody && !req.headers.get('content-type')?.includes('application/json')) {
    return fail(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send JSON.')
  }

  try {
    const { data, meta } = await callApi(`/v1/${route}${new URL(req.url).search}`, {
      method: req.method as Method,
      token,
      body: hasBody ? await req.json().catch(() => ({})) : undefined
    })

    return NextResponse.json({ success: true, data, meta, error: null })
  } catch (error) {
    return errorResponse(error)
  }
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE }
