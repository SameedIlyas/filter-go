// Next Imports
import { Inter, Outfit } from 'next/font/google'

// MUI Imports
import type { Theme } from '@mui/material/styles'

// Type Imports
import type { Settings } from '@core/contexts/settingsContext'
import type { Skin, SystemMode } from '@core/types'

// Config Imports
import { BASE_RADIUS } from '@configs/brand'

// Theme Options Imports
import overrides from './overrides'
import colorSchemes from './colorSchemes'
import spacing from './spacing'
import shadows from './shadows'
import customShadows from './customShadows'
import typography from './typography'

/*
 * The same two faces the public website uses, so a heading in the portal and a
 * heading on the marketing site are set in the same type.
 */
const outfit = Outfit({ subsets: ['latin'], weight: ['400', '500', '600', '700'], display: 'swap' })
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], display: 'swap' })

const theme = (settings: Settings, mode: SystemMode, direction: Theme['direction']): Theme => {
  return {
    direction,
    components: overrides(settings.skin as Skin),
    colorSchemes: colorSchemes(settings.skin as Skin),
    ...spacing,
    shape: {
      borderRadius: BASE_RADIUS,
      customBorderRadius: {
        xs: 2,
        sm: 4,
        md: 6,
        lg: 8,
        xl: 10
      }
    },
    shadows: shadows(mode),
    typography: typography(inter.style.fontFamily, outfit.style.fontFamily),
    customShadows: customShadows(mode),
    mainColorChannels: {
      light: '11 59 92',
      dark: '234 241 247',
      lightShadow: '11 59 92',
      darkShadow: '10 23 33'
    }
  } as Theme
}

export default theme
