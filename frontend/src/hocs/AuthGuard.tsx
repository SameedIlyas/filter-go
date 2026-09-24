// Type Imports
import type { ChildrenType } from '@core/types'

// Component Imports
import AuthRedirect from '@/components/AuthRedirect'

// Lib Imports
import { getSession } from '@/libs/session'

export default async function AuthGuard({ children }: ChildrenType) {
  const session = await getSession()

  return <>{session ? children : <AuthRedirect />}</>
}
