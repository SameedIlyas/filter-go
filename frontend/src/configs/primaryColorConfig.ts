export type PrimaryColorConfig = {
  name?: string
  light?: string
  main: string
  dark?: string
}

/**
 * Breeze — primary colour swatches offered in the Customizer.
 *
 * Index 0 is the product default and is sourced directly from the FilterGO
 * wordmark (#2DA551). The remaining swatches are drawn from the same brand
 * family (Gusty's forest green) plus three neutral-safe alternates.
 */
const primaryColorConfig: PrimaryColorConfig[] = [
  {
    name: 'filtergo-green',
    light: '#57B774',
    main: '#2DA551',
    dark: '#299549'
  },
  {
    name: 'forest',
    light: '#667D67',
    main: '#405C41',
    dark: '#3A533B'
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
