// Type Imports
import type { ChildrenType } from '@core/types'

// Lib Imports
import { QueryProvider } from '@/libs/react-query'

// Component Imports
import PublicThemeProvider from './PublicThemeProvider'
import PublicHeader from './PublicHeader'
import PublicFooter from './PublicFooter'

/**
 * Chrome shared by every public page: theme, data layer, header and footer.
 *
 * `QueryProvider` is mounted here as well as in the portal's `Providers` — the
 * two route trees never share a React tree, so each needs its own. The contact
 * form's mutation is the current consumer.
 */
const PublicLayout = ({ children }: ChildrenType) => (
  <PublicThemeProvider>
    <QueryProvider>
      <a href='#main' className='public-skip-link'>
        Skip to content
      </a>
      <PublicHeader />
      <main id='main'>{children}</main>
      <PublicFooter />
    </QueryProvider>
  </PublicThemeProvider>
)

export default PublicLayout
