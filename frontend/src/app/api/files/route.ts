import { NextResponse } from 'next/server'

import { errorResponse } from '@/libs/apiResponse'
import { forwardRaw } from '@/libs/backend'
import { limitStream } from '@/libs/limitStream'
import { hitRateLimit } from '@/libs/rateLimit'
import { getSessionToken } from '@/libs/session'

/** The API's own cap (MAX_UPLOAD_BYTES, 10 MB by default) plus room for the multipart framing. */
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024)
const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 64 * 1024

const UPLOADS_PER_MINUTE = 30

const fail = (status: number, code: string, message: string, headers?: Record<string, string>) =>
  NextResponse.json({ success: false, data: null, error: { code, message } }, { status, headers })

const tooLarge = () =>
  fail(413, 'FILE_TOO_LARGE', `The file is larger than the ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.`)

/** Upload proxy: streams the multipart body to `POST /v1/files` with the session token attached. */
export async function POST(req: Request) {
  const token = await getSessionToken()

  if (!token) return fail(401, 'UNAUTHENTICATED', 'You are not signed in.')

  const contentType = req.headers.get('content-type') ?? ''

  // Cross-site forms can post multipart too, so also require the fetch-only header
  if (!contentType.startsWith('multipart/form-data') || req.headers.get('x-requested-with') !== 'fetch') {
    return fail(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the file as multipart/form-data.')
  }

  const retryAfter = hitRateLimit('upload', token, UPLOADS_PER_MINUTE)

  if (retryAfter)
    return fail(429, 'RATE_LIMITED', 'Too many uploads. Try again in a moment.', { 'retry-after': String(retryAfter) })

  // Refuse what announces itself as too big up front; the stream limit catches the rest (missing or false length)
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return tooLarge()

  let exceeded = false

  try {
    const body = req.body ? limitStream(req.body, MAX_BODY_BYTES, () => (exceeded = true)) : undefined
    const res = await forwardRaw('/v1/files', { method: 'POST', token, body, contentType })

    return new NextResponse(res.body, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' }
    })
  } catch (error) {
    return exceeded ? tooLarge() : errorResponse(error)
  }
}
