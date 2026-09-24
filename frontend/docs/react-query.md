# Data fetching with TanStack Query

Server state in this app lives in TanStack Query v5 (`@tanstack/react-query`), not in Redux.
Redux stays for client-only UI state (chat, calendar, kanban, email slices).

The layout mirrors **Melk-FE-Next**, so the two codebases stay navigable side by side.

## Files

```
src/libs/react-query/
  index.ts                      barrel — import from '@/libs/react-query'
  query-client.ts               makeQueryClient / getQueryClient, all defaults
  query-keys.ts                 every query key in the app
  query-provider.tsx            <QueryProvider>, mounted in src/components/Providers.tsx
  query-hydration-boundary.tsx  <QueryHydrationBoundary>, app-owned HydrationBoundary

src/libs/api/
  index.ts                      barrel — import from '@/libs/api'
  api-client.ts                 apiFetch() + ApiError, the transport for every query
  queries/
    index.ts
    users.ts                    reference module: queryOptions + use…Query hook
  mutations/                    add as mutations appear
```

## Query keys

All keys live in one place, [`src/libs/react-query/query-keys.ts`](../src/libs/react-query/query-keys.ts),
hanging off a `root` segment so nothing collides with a third-party key:

```ts
export const queryKeys = {
  root: ['breeze'] as const,

  users: {
    all: () => [...queryKeys.root, 'users'] as const,
    lists: () => [...queryKeys.root, 'users', 'list'] as const,
    list: (params: UserFilters = {}) => [...queryKeys.root, 'users', 'list', params] as const,
    details: () => [...queryKeys.root, 'users', 'detail'] as const,
    detail: (userId: number) => [...queryKeys.root, 'users', 'detail', userId] as const
  }
} as const
```

- **Never write a key inline.** Hierarchy is what makes invalidation precise —
  `queryKeys.users.all()` drops everything for the feature, `.lists()` only the lists,
  `.detail(id)` exactly one entry.
- **Every variable the query function reads belongs in the key.** A key that omits a filter will
  serve another filter's cached data. The `@tanstack/query/exhaustive-deps` ESLint rule catches most.
- Each leaf is a **function** returning an `as const` tuple, even when it takes no argument, so call
  sites read the same everywhere.

> @see https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
> @see https://tkdodo.eu/blog/effective-react-query-keys

## Writing a feature module

One file per domain under `src/libs/api/queries/`, exporting the `queryOptions` factory *and* the
hook. See [`queries/users.ts`](../src/libs/api/queries/users.ts).

```ts
// src/libs/api/queries/invoices.ts
import { queryOptions, useQuery } from '@tanstack/react-query'

import { queryKeys } from '@/libs/react-query/query-keys'

import { apiFetch } from '../api-client'

export const invoiceListQueryOptions = (filters: InvoiceFilters = {}) =>
  queryOptions({
    queryKey: queryKeys.invoices.list(filters),
    queryFn: ({ signal }) => apiFetch<InvoiceType[]>('/apps/invoice', { signal })
  })

export const useInvoicesQuery = (filters: InvoiceFilters = {}) => useQuery(invoiceListQueryOptions(filters))
```

Export it from `queries/index.ts`, and add the key segment to `query-keys.ts`.

Always forward `signal` to `apiFetch` so React Query can abort in-flight requests. Use
`queryOptions()` rather than a bare object — it ties the key to the function that fills it and gives
`setQueryData` a typed key.

## Defaults, and why

Set in [`query-client.ts`](../src/libs/react-query/query-client.ts):

- **`staleTime: 60s`** — prefetched data reaches the browser already slightly old. At `0` every
  hydrated query refetches on mount and the prefetch was wasted work.
- **`gcTime: 5min`** — how long an unobserved query survives before collection.
- **`retry`** — never retries a `< 500` response. Retrying a 401 or 404 only delays the error the
  user needs to see. 5xx and network errors get two more attempts with exponential backoff.
- **`mutations.retry: false`** — a retried mutation can apply its side effect twice.
- **`shouldDehydrateQuery`** includes `pending` queries, which is what lets a prefetch started in a
  Server Component stream to the client instead of blocking the response.
- **`shouldRedactErrors: () => false`** — Next.js signals dynamic rendering and `redirect()` /
  `notFound()` through thrown errors; redacting them during dehydration swallows that signal.

`getQueryClient()` returns a **fresh client per server request** (one visitor's cache must never
leak into another's) and a **single shared client in the browser** (a suspended first render must
not discard a cache that already has data). This differs from Melk-FE-Next's `useState(makeQueryClient)`
because this app prefetches in Server Components, which needs both sides to share one factory.

## Prefetch on the server, read on the client

Server Components are a place to *prefetch*, nothing more — do not render the result of
`queryClient.query()` on the server or pass it down as a prop, or it desynchronises from the client
cache on the next revalidation.

```tsx
// page.tsx — a Server Component
import { dehydrate } from '@tanstack/react-query'

import { QueryHydrationBoundary, getQueryClient } from '@/libs/react-query'
import { userListQueryOptions } from '@/libs/api'

const UserListPage = () => {
  const queryClient = getQueryClient()

  // No await: the pending query is dehydrated and streams in as it resolves
  void queryClient.query(userListQueryOptions())

  return (
    <QueryHydrationBoundary state={dehydrate(queryClient)}>
      <UserList />
    </QueryHydrationBoundary>
  )
}
```

```tsx
// UserList.tsx
'use client'

import { useUsersQuery } from '@/libs/api'

const UserList = () => {
  const { data, isPending, isError, error } = useUsersQuery()
  ...
}
```

`useQuery` rather than `useSuspenseQuery` when the data was prefetched — it is already in the cache,
so there is nothing to suspend on. `QueryHydrationBoundary` is not root-only: prefetch in the
closest Server Component to the data and wrap just that subtree.

Note `queryClient.query()`, not `prefetchQuery` / `fetchQuery` — those are deprecated as of v5.103.

## Mutations

Invalidate through the key factory, in `onSettled` so the refetch happens whether the mutation
succeeded or failed:

```tsx
const queryClient = useQueryClient()

const { mutate, isPending } = useMutation({
  mutationFn: (payload: NewInvoice) => apiFetch<InvoiceType>('/apps/invoice', { method: 'POST', body: payload }),
  onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.invoices.lists() })
})
```

Errors surface as `ApiError` with `status` and `body` intact, so a form can branch on
`error instanceof ApiError && error.status === 422`.

## Devtools

Open in development via the floating button (bottom-left). Compiled out of production builds by the
`NODE_ENV` guard in `query-provider.tsx`.

## References

- [Query Keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys)
- [Query Options](https://tanstack.com/query/latest/docs/framework/react/guides/query-options)
- [Advanced Server Rendering](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr)
- [Effective React Query Keys — TkDodo](https://tkdodo.eu/blog/effective-react-query-keys)
