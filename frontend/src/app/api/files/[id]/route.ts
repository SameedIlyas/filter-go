import { NextResponse } from 'next/server'

import { errorResponse } from '@/libs/apiResponse'
import { forwardRaw } from '@/libs/backend'
import { hitRateLimit } from '@/libs/rateLimit'
import { getSessionToken } from '@/libs/session'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Thumbnails load many at once, so this is higher than the upload limit. */
const DOWNLOADS_PER_MINUTE = 300

/** Download proxy for `GET /v1/files/:id`, keeping the API's safety headers. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!UUID.test(id))
    return NextResponse.json(
      { success: false, data: null, error: { code: 'NOT_FOUND', message: 'Not found.' } },
      { status: 404 }
    )

  const token = await getSessionToken()

  if (!token)
    return NextResponse.json(
      { success: false, data: null, error: { code: 'UNAUTHENTICATED', message: 'You are not signed in.' } },
      { status: 401 }
    )

  const retryAfter = hitRateLimit('download', token, DOWNLOADS_PER_MINUTE)

  if (retryAfter) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again in a moment.' }
      },
      { status: 429, headers: { 'retry-after': String(retryAfter) } }
    )
  }

  try {
    const res = await forwardRaw(`/v1/files/${id}`, { token })
    const headers = new Headers()

    for (const name of [
      'content-type',
      'content-length',
      'content-disposition',
      'x-content-type-options',
      'cache-control',
      'content-security-policy'
    ]) {
      const value = res.headers.get(name)

      if (value) headers.set(name, value)
    }

    return new NextResponse(res.body, { status: res.status, headers })
  } catch (error) {
    return errorResponse(error)
  }
}
