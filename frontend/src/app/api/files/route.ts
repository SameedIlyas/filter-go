import { NextResponse } from 'next/server'

import { errorResponse } from '@/libs/apiResponse'
import { forwardRaw } from '@/libs/backend'
import { getSessionToken } from '@/libs/session'

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ success: false, data: null, error: { code, message } }, { status })

/** Upload proxy: streams the multipart body to `POST /v1/files` with the session token attached. */
export async function POST(req: Request) {
  const token = await getSessionToken()

  if (!token) return fail(401, 'UNAUTHENTICATED', 'You are not signed in.')

  const contentType = req.headers.get('content-type') ?? ''

  // Cross-site forms can post multipart too, so also require the fetch-only header
  if (!contentType.startsWith('multipart/form-data') || req.headers.get('x-requested-with') !== 'fetch') {
    return fail(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the file as multipart/form-data.')
  }

  try {
    const res = await forwardRaw('/v1/files', { method: 'POST', token, body: req.body ?? undefined, contentType })

    return new NextResponse(res.body, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' }
    })
  } catch (error) {
    return errorResponse(error)
  }
}
