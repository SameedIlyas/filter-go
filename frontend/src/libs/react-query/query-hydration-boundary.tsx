'use client'

// Third-party Imports
import { HydrationBoundary } from '@tanstack/react-query'

import type { DehydratedState } from '@tanstack/react-query'

// Type Imports
import type { ChildrenType } from '@core/types'

export type QueryHydrationBoundaryProps = ChildrenType & {
  state: DehydratedState
}

/**
 * Thin wrapper around TanStack `HydrationBoundary` so pages use an app-owned
 * API and behaviour can be extended in one place later.
 */
export const QueryHydrationBoundary = ({ state, children }: QueryHydrationBoundaryProps) => {
  return <HydrationBoundary state={state}>{children}</HydrationBoundary>
}
