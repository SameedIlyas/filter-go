'use client'

// MUI Imports
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { AppRouterCacheProvider } from '@mui/material-nextjs/v14-appRouter'

// Type Imports
import type { ChildrenType } from '@core/types'

// Theme Imports
import publicTheme from './theme'

/**
 * Wraps the public site in its own MUI theme, independent of the portal's
 * cookie-driven Customizer.
 *
 * The default `mui-mode` storage key is left alone on purpose so the
 * `InitColorSchemeScript` already in the root layout resolves the scheme before
 * first paint — a custom key here would leave the script looking in the wrong
 * place and the page would flash light before switching to dark.
 */
const PublicThemeProvider = ({ children }: ChildrenType) => (
  <AppRouterCacheProvider options={{ prepend: true }}>
    <ThemeProvider theme={publicTheme} defaultMode='system'>
      <CssBaseline />
      {children}
    </ThemeProvider>
  </AppRouterCacheProvider>
)

export default PublicThemeProvider
