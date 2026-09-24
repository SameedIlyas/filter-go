/*
 * CoolCraft brand tokens — the single source for both surfaces.
 *
 * The portal (`src/@core/theme`) and the public website
 * (`src/components/layout/public/theme.ts`) both import from here, so the two
 * cannot drift apart. Before this existed there were three different palettes
 * live at once.
 *
 * Roles:
 *   · navy   — structure. Headings, sidebar, footer, dark panels.
 *   · orange — action. Buttons and calls to action, and little else, so that
 *              orange reliably means "this is the thing to click".
 */

export const brandColors = {
  navy: '#0B3B5C',
  navyDeep: '#072C46',
  navyMid: '#14527B',
  orange: '#F18F2C',
  orangeLight: '#F7AB5E',
  orangeDark: '#D97814',
  orangeSoft: '#FDEBD4',

  /** Page tint behind white cards. */
  tint: '#EFF6FB',
  ink: '#0A1721',
  slate: '#5B7185',
  offWhite: '#F7FAFC'
} as const

/** Shared status colours, so a success toast looks the same in both surfaces. */
export const statusColors = {
  success: '#1B8A5A',
  warning: '#E8A020',
  error: '#DC3A55',
  info: '#2A7FB8'
} as const

/**
 * Corner radii, as strings with units.
 *
 * MUI's `sx` multiplies a bare number by `theme.shape.borderRadius`, so a
 * number here would silently scale. `BASE_RADIUS` is the one numeric value,
 * because `shape.borderRadius` must be a number for that multiplier to work.
 */
export const BASE_RADIUS = 8

export const radius = {
  sm: '8px',
  md: '10px',
  lg: '14px',
  xl: '20px',
  xxl: '28px',
  pill: '999px'
} as const

export type BrandColors = typeof brandColors
