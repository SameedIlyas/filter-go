// Next Imports
import { redirect } from 'next/navigation'

// Type Imports
import type { ChildrenType } from '@core/types'

// Config Imports
import themeConfig from '@configs/themeConfig'

// Lib Imports
import { getSession } from '@/libs/session'

const GuestOnlyRoute = async ({ children }: ChildrenType) => {
  const session = await getSession()

  if (session) {
    redirect(themeConfig.homePageUrl)
  }

  return <>{children}</>
}

export default GuestOnlyRoute
