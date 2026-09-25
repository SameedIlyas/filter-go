import 'server-only'

import { headers } from 'next/headers'

import type { ApiFailure, ApiSuccess, ErrorCode, ErrorDetails, PageMeta } from '@/types/api'

const BASE = process.env.AUTH_API_URL ?? 'http://localhost:4000'
const SERVICE_KEY = process.env.AUTH_API_SERVICE_KEY

export class BackendError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'BAD_GATEWAY',
    message: string,
    readonly details?: ErrorDetails,
    readonly requestId?: string
  ) {
    super(message)
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface CallOptions {
  method?: Method
  body?: unknown

  /** The session token from the cookie. Omit for public endpoints. */
  token?: string
}

/** The one place the Next.js server talks to the FilterGO API. */
export async function callApi<T>(path: string, { method = 'GET', body, token }: CallOptions = {}) {
  const incoming = await headers()
  const clientIp = incoming.get('x-forwarded-for')?.split(',')[0]?.trim() ?? incoming.get('x-real-ip') ?? undefined
  const userAgent = incoming.get('user-agent') ?? undefined

  let res: Response

  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(SERVICE_KEY ? { 'x-service-key': SERVICE_KEY } : {}),
        ...(clientIp ? { 'x-forwarded-for': clientIp } : {}),
        ...(userAgent ? { 'user-agent': userAgent } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
  } catch {
    throw new BackendError(502, 'BAD_GATEWAY', 'The server could not be reached.')
  }

  const json = (await res.json().catch(() => null)) as ApiSuccess<T> | ApiFailure | null

  if (!json || typeof json.success !== 'boolean') {
    throw new BackendError(502, 'BAD_GATEWAY', 'Unexpected response from the server.')
  }

  if (!json.success) {
    const { code, message, details, requestId } = json.error

    if (code === 'INVALID_SERVICE_KEY') console.error('FilterGO API rejected the service key. Check AUTH_API_SERVICE_KEY.')

    throw new BackendError(res.status, code, message, details, requestId)
  }

  return { data: json.data, meta: (json as { meta?: PageMeta }).meta }
}
