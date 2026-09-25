import type { ErrorDetails, PageMeta } from '@/types/api'

/*
 * Browser-side transport to the FilterGO API, via the Next.js proxy at
 * `/api/backend/*` (the session token never reaches the browser).
 * Unwraps the `{ success, data, meta, error }` envelope and throws `BffError`
 * with the server's human-readable message on failure.
 */

export class BffError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: ErrorDetails
  ) {
    super(message)
    this.name = 'BffError'
  }

  /** First field-level message for `field`, if the server sent one. */
  fieldMessage(field: string) {
    return this.details?.issues?.find(issue => issue.field === field)?.message
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

type Envelope<T> = {
  success: boolean
  data: T
  meta?: PageMeta
  error: { code: string; message: string; details?: ErrorDetails } | null
}

export type Query = Record<string, string | number | undefined | null>

export const toSearch = (query: Query = {}) => {
  const params = new URLSearchParams()

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  })

  const search = params.toString()

  return search ? `?${search}` : ''
}

export async function bff<T>(
  path: string,
  { method = 'GET', body, query, signal }: { method?: Method; body?: unknown; query?: Query; signal?: AbortSignal } = {}
): Promise<{ data: T; meta?: PageMeta }> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ''

  const res = await fetch(`${base}/api/backend/${path.replace(/^\//, '')}${toSearch(query)}`, {
    method,
    signal,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined
  })

  const json = (await res.json().catch(() => null)) as Envelope<T> | null

  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.assign(`/login?redirectTo=${encodeURIComponent(window.location.pathname)}`)
  }

  if (!res.ok || !json?.success) {
    const error = json?.error

    throw new BffError(res.status, error?.code ?? 'UNKNOWN', error?.message ?? 'Request failed.', error?.details)
  }

  return { data: json.data, meta: json.meta }
}

/** Turn any thrown error into a message fit for a toast. */
export const errorMessage = (error: unknown) => {
  if (error instanceof BffError) {
    const issue = error.details?.issues?.[0]

    return issue && error.code === 'VALIDATION_ERROR' ? `${error.message} ${issue.message}` : error.message
  }

  return error instanceof Error ? error.message : 'Something went wrong.'
}
