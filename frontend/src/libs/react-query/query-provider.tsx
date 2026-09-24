'use client'

// Third-party Imports
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

// Type Imports
import type { ChildrenType } from '@core/types'

// Lib Imports
import { getQueryClient } from './query-client'

/*
 * `getQueryClient()` is called during render rather than through a `useState`
 * initialiser because it already returns a stable instance per environment —
 * a fresh client on the server, a single shared one in the browser. That split
 * is what lets a Server Component prefetch into the same client the browser
 * hydrates from.
 */
export const QueryProvider = ({ children }: ChildrenType) => {
  const queryClient = getQueryClient()

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Guarded by NODE_ENV so the devtools bundle is dropped from production builds */}
      {process.env.NODE_ENV === 'development' ? (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition='bottom-left' />
      ) : null}
    </QueryClientProvider>
  )
}
