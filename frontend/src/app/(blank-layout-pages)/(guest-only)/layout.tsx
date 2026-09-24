import type { ChildrenType } from '@core/types'

// HOC Imports
import GuestOnlyRoute from '@/hocs/GuestOnlyRoute'

const Layout = async (props: ChildrenType) => {
  const { children } = props

  return <GuestOnlyRoute>{children}</GuestOnlyRoute>
}

export default Layout
