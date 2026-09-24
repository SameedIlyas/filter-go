/*
 * The transport layer every `queryFn` / `mutationFn` should go through.
 *
 * React Query decides success or failure purely on whether the promise rejects,
 * and `fetch` only rejects on network failure — a 404 or a 500 resolves happily.
 * `apiFetch` closes that gap by throwing `ApiError`, which also carries the
 * status so the retry policy in `queryClient.ts` can tell "the server is having
 * a moment" (retry) from "you asked for something that isn't there" (don't).
 */

export class ApiError extends Error {
  readonly status: number

  readonly body: unknown

  constructor(status: number, statusText: string, body: unknown) {
    super(typeof body === 'object' && body !== null && 'message' in body ? String(body.message) : statusText)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/*
 * Query functions run on the server during prefetching as well as in the
 * browser, and `fetch` will not accept a relative URL on the server, so paths
 * are resolved against the API origin. Set `NEXT_PUBLIC_API_URL` in `.env`.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api`

const resolveUrl = (path: string) =>
  /^https?:\/\//.test(path) ? path : `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`

type ApiFetchOptions = Omit<RequestInit, 'body'> & { body?: unknown }

/**
 * `fetch` that sends and receives JSON, throws `ApiError` on a non-2xx
 * response, and is typed by its caller: `apiFetch<UsersType[]>('/apps/user-list')`.
 *
 * Pass `signal` through from the query function context so React Query can
 * cancel in-flight requests — see `src/queries/users.ts` for the pattern.
 */
export const apiFetch = async <T>(path: string, options: ApiFetchOptions = {}): Promise<T> => {
  const { body, headers, ...rest } = options

  const response = await fetch(resolveUrl(path), {
    ...rest,
    headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  })

  // Read the payload once, tolerating empty bodies (204, HTML error pages)
  const text = await response.text()

  let payload: unknown = null

  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, response.statusText, payload)
  }

  return payload as T
}
