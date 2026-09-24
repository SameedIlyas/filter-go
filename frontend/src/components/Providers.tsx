// Type Imports
import type { ChildrenType, Direction } from '@core/types'

// Context Imports
import { SessionProvider } from '@/contexts/sessionContext'
import { VerticalNavProvider } from '@menu/contexts/verticalNavContext'
import { SettingsProvider } from '@core/contexts/settingsContext'
import ThemeProvider from '@components/theme'
import ReduxProvider from '@/redux-store/ReduxProvider'
import { QueryProvider } from '@/libs/react-query'

// Styled Component Imports
import AppReactToastify from '@/libs/styles/AppReactToastify'

// Lib Imports
import { getSession } from '@/libs/session'

// Util Imports
import { getMode, getSettingsFromCookie, getSystemMode } from '@core/utils/serverHelpers'

type Props = ChildrenType & {
  direction: Direction
}

const Providers = async (props: Props) => {
  // Props
  const { children, direction } = props

  // Vars
  const mode = await getMode()
  const settingsCookie = await getSettingsFromCookie()
  const systemMode = await getSystemMode()
  const session = await getSession()

  return (
    <SessionProvider session={session}>
      <VerticalNavProvider>
        <SettingsProvider settingsCookie={settingsCookie} mode={mode}>
          <ThemeProvider direction={direction} systemMode={systemMode}>
            <QueryProvider>
              <ReduxProvider>{children}</ReduxProvider>
            </QueryProvider>
            <AppReactToastify direction={direction} hideProgressBar />
          </ThemeProvider>
        </SettingsProvider>
      </VerticalNavProvider>
    </SessionProvider>
  )
}

export default Providers
