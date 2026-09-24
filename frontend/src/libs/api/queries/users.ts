// Third-party Imports
import { queryOptions, useQuery } from '@tanstack/react-query'

import type { UseQueryResult } from '@tanstack/react-query'

// Type Imports
import type { UsersType } from '@/types/apps/userTypes'

// Lib Imports
import { queryKeys } from '@/libs/react-query/query-keys'

import { apiFetch } from '../api-client'

/*
 * Reference query module — copy this shape for new features.
 *
 * Keys come from `@/libs/react-query/query-keys`, never spelled out inline, so
 * invalidation stays precise and no key can drift from the function that fills
 * it. `queryOptions()` ties the two together and infers the data type end to
 * end: the same object feeds `useQuery`, `useSuspenseQuery`, `useQueries`,
 * `queryClient.query()` in a Server Component, and `setQueryData`.
 *
 * @see https://tanstack.com/query/latest/docs/framework/react/guides/query-options
 */

export type UserFilters = {
  role?: string
  status?: string
}

/**
 * `GET /apps/user-list` — the full user list.
 *
 * `signal` comes from the query function context and is forwarded to `fetch`,
 * so React Query aborts the request when the query is cancelled or the
 * component unmounts. Always thread it through.
 */
export const userListQueryOptions = (filters: UserFilters = {}) =>
  queryOptions({
    queryKey: queryKeys.users.list(filters),
    queryFn: ({ signal }) => apiFetch<UsersType[]>('/apps/user-list', { signal })
  })

export const useUsersQuery = (filters: UserFilters = {}): UseQueryResult<UsersType[]> =>
  useQuery(userListQueryOptions(filters))

/*
 * `queryKeys.users.details()` / `queryKeys.users.detail(id)` exist but have no
 * query yet — there is no `/apps/user-list/[id]` route to back them. Add one
 * here alongside the route, following the shape above.
 */
