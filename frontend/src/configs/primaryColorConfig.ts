export type PrimaryColorConfig = {
  name?: string
  light?: string
  main: string
  dark?: string
}

// Config Imports
import { brandColors } from '@configs/brand'

/**
 * CoolCraft — primary colour swatches offered in the Customizer.
 *
 * Index 0 is the product default and is the same orange the public website
 * uses for its calls to action, so a button looks identical on both surfaces.
 * Index 1 is the brand navy. The rest are neutral-safe alternates.
 */
const primaryColorConfig: PrimaryColorConfig[] = [
  {
    name: 'coolcraft-orange',
    light: brandColors.orangeLight,
    main: brandColors.orange,
    dark: brandColors.orangeDark
  },
  {
    name: 'coolcraft-navy',
    light: brandColors.navyMid,
    main: brandColors.navy,
    dark: brandColors.navyDeep
  },
  {
    name: 'teal',
    light: '#3DA9A9',
    main: '#0D9394',
    dark: '#0C8485'
  },
  {
    name: 'amber',
    light: '#FFBC4A',
    main: '#FFAB1D',
    dark: '#E69A1A'
  },
  {
    name: 'sky',
    light: '#4DA8F0',
    main: '#2092EC',
    dark: '#1D83D4'
  }
]

export default primaryColorConfig
