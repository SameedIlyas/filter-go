// Third-party Imports
import { QueryClient, defaultShouldDehydrateQuery, environmentManager } from '@tanstack/react-query'

// Lib Imports
import { ApiError } from '@/libs/api/api-client'

/*
 * One QueryClient factory shared by the server and the browser.
 *
 * On the server every request must get its own client, or one visitor's cache
 * leaks into another's. In the browser we keep a single module-level client so
 * that a suspended render — React may throw away and retry the first render —
 * does not silently discard a cache that already has data in it.
 *
 * https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr
 */

export const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        /*
         * Prefetched data arrives at the client already a few hundred
         * milliseconds old. With staleTime at 0 every hydrated query refetches
         * immediately, which throws away the whole point of prefetching.
         */
        staleTime: 60 * 1000,

        // How long an unused query stays in cache before it is garbage collected
        gcTime: 5 * 60 * 1000,

        /*
         * Retrying a 404 or a 401 just delays the error the user needs to see.
         * Only server-side failures and network errors are worth another go.
         */
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status < 500) {
            return false
          }

          return failureCount < 2
        },
        retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000)
      },
      mutations: {
        // A retried mutation can double-apply a side effect — opt in per mutation instead
        retry: false
      },
      dehydrate: {
        /*
         * Dehydrate queries that are still pending as well as settled ones, so
         * a prefetch started in a Server Component streams down to the client
         * as it resolves instead of blocking the response.
         */
        shouldDehydrateQuery: query => defaultShouldDehydrateQuery(query) || query.state.status === 'pending',

        /*
         * Next.js throws control-flow errors (`redirect()`, `notFound()`) and
         * detects dynamic pages through thrown errors. Redacting them here
         * would swallow that signal — Next.js already redacts real server
         * errors itself, with better digests.
         */
        shouldRedactErrors: () => false
      }
    }
  })

let browserQueryClient: QueryClient | undefined = undefined

export const getQueryClient = () => {
  if (environmentManager.isServer()) {
    // Server: always a fresh client, never shared between requests
    return makeQueryClient()
  }

  browserQueryClient ??= makeQueryClient()

  return browserQueryClient
}
