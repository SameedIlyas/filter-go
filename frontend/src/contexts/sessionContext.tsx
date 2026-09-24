'use client'

// React Imports
import { createContext, use } from 'react'
import type { ReactNode } from 'react'

// Type Imports
import type { SessionUser } from '@/types/sessionTypes'

const SessionContext = createContext<SessionUser | null>(null)

/**
 * Makes the signed-in user available to client components.
 *
 * Seeded on the server in `Providers`, so the user is present on first paint
 * with no loading state and no client-side session fetch.
 */
export const SessionProvider = ({ session, children }: { session: SessionUser | null; children: ReactNode }) => {
  return <SessionContext value={session}>{children}</SessionContext>
}

/** The signed-in user, or null when signed out. */
export const useSession = () => use(SessionContext)
