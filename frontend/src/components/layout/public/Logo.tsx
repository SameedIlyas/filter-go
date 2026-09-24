'use client'

// MUI Imports
import Box from '@mui/material/Box'

// Data Imports
import { siteConfig } from '@/data/public/site'

// Theme Imports
import { displayFont } from './theme'

type Props = {

  /** Height of the mark in px; the wordmark scales with it. */
  size?: number
}

/**
 * The CoolCraft lockup: a mark plus the wordmark, drawn rather than loaded.
 *
 * Inline SVG in `currentColor` means one asset works on any background and in
 * both colour schemes, with no second file to swap and no flash of the wrong
 * artwork during hydration.
 *
 * The mark reads as a filter frame with air passing through it: a rounded
 * square, three flow lines crossing it, the middle one broken to suggest the
 * filter media catching what the air carries.
 */
const PublicLogo = ({ size = 30 }: Props) => (
  <Box
    sx={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 1.15,
      color: 'inherit',
      lineHeight: 0
    }}
  >
    <Box
      component='svg'
      viewBox='0 0 32 32'
      role='img'
      aria-label={siteConfig.name}
      sx={{ inlineSize: size, blockSize: size, flexShrink: 0, color: 'primary.main' }}
    >
      <rect x='1.5' y='1.5' width='29' height='29' rx='9' fill='currentColor' fillOpacity='0.14' />
      <rect
        x='1.5'
        y='1.5'
        width='29'
        height='29'
        rx='9'
        fill='none'
        stroke='currentColor'
        strokeOpacity='0.32'
        strokeWidth='1.5'
      />
      <g stroke='currentColor' strokeWidth='2.4' strokeLinecap='round' fill='none'>
        <path d='M8 11.5h13' />
        <path d='M8 16h7' />
        <path d='M19 16h5' />
        <path d='M8 20.5h13' />
      </g>
    </Box>

    <Box
      component='span'
      sx={{
        fontFamily: displayFont,
        fontSize: size * 0.72,
        fontWeight: 700,
        letterSpacing: '-0.03em',
        whiteSpace: 'nowrap'
      }}
    >
      Cool
      <Box component='span' sx={{ color: 'primary.main' }}>
        Craft
      </Box>
    </Box>
  </Box>
)

export default PublicLogo
