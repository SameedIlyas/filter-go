// Next Imports
import { Outfit, Inter } from 'next/font/google'

// MUI Imports
import { createTheme } from '@mui/material/styles'

import type {} from '@mui/material/themeCssVarsAugmentation'

/*
 * The public website runs on its own theme, deliberately separate from the
 * portal's.
 *
 * The portal theme is driven by the Customizer (cookie-backed skin, primary
 * colour, layout width) which is exactly what a marketing site should not have
 * — every visitor must see the same art direction. Keeping them apart also
 * means restyling the website cannot regress the dashboard.
 */

/** Display face — geometric, matching the CoolCraft wordmark. */
const outfit = Outfit({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], display: 'swap' })

/** Body face — neutral and highly legible at small sizes. */
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], display: 'swap' })

export const displayFont = outfit.style.fontFamily
export const bodyFont = inter.style.fontFamily

// Config Imports
import { BASE_RADIUS, brandColors, radius } from '@configs/brand'

/*
 * Colours and radii come from `@configs/brand` so the portal and the website
 * cannot drift. Re-exported here because the public components import them
 * from this module.
 */
export { radius }

export const brand = brandColors

const publicTheme = createTheme({
  cssVariables: { colorSchemeSelector: 'data' },

  colorSchemes: {
    light: {
      palette: {
        // Orange is `primary` so every contained Button is a call to action by default
        primary: { main: brand.orange, light: '#F7AB5E', dark: brand.orangeDark, contrastText: '#FFFFFF' },
        secondary: { main: brand.navy, light: brand.navyMid, dark: brand.navyDeep, contrastText: '#FFFFFF' },
        success: { main: '#1B8A5A' },
        background: { default: brand.tint, paper: '#FFFFFF' },
        text: {
          primary: brand.navy,
          secondary: brand.slate,
          disabled: 'rgba(11, 59, 92, 0.38)'
        },
        divider: 'rgba(11, 59, 92, 0.12)'
      }
    },
    dark: {
      palette: {
        primary: { main: '#F5A04A', light: '#F9BC7D', dark: '#D97814', contrastText: '#16202B' },
        secondary: { main: '#8FB2CC', light: '#B5CEE0', dark: '#5C8BAC', contrastText: '#0A1721' },
        success: { main: '#2FA97A' },
        background: { default: brand.ink, paper: '#122433' },
        text: {
          primary: '#EAF1F7',
          secondary: 'rgba(234, 241, 247, 0.66)',
          disabled: 'rgba(234, 241, 247, 0.38)'
        },
        divider: 'rgba(234, 241, 247, 0.14)'
      }
    }
  },

  shape: { borderRadius: BASE_RADIUS },

  typography: {
    fontFamily: `${bodyFont}, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,

    /*
     * Display sizes use clamp() so the hero scales continuously between phone
     * and desktop instead of stepping at breakpoints — no size is ever a bad
     * compromise, and there is no layout jump mid-resize.
     */
    h1: {
      fontFamily: displayFont,
      fontSize: 'clamp(2.5rem, 6.4vw, 4.75rem)',
      fontWeight: 700,
      lineHeight: 0.98,
      letterSpacing: '-0.035em'
    },
    h2: {
      fontFamily: displayFont,
      fontSize: 'clamp(1.85rem, 3.6vw, 2.85rem)',
      fontWeight: 700,
      lineHeight: 1.06,
      letterSpacing: '-0.028em'
    },
    h3: {
      fontFamily: displayFont,
      fontSize: 'clamp(1.45rem, 2.4vw, 1.95rem)',
      fontWeight: 600,
      lineHeight: 1.14,
      letterSpacing: '-0.022em'
    },
    h4: {
      fontFamily: displayFont,
      fontSize: 'clamp(1.25rem, 1.8vw, 1.5rem)',
      fontWeight: 600,
      lineHeight: 1.22,
      letterSpacing: '-0.016em'
    },
    h5: { fontFamily: displayFont, fontSize: '1.1875rem', fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.012em' },
    h6: { fontFamily: displayFont, fontSize: '1.0625rem', fontWeight: 600, lineHeight: 1.4 },
    subtitle1: { fontSize: '1.1875rem', fontWeight: 400, lineHeight: 1.65 },
    subtitle2: { fontSize: '1.0625rem', fontWeight: 500, lineHeight: 1.6 },
    body1: { fontSize: '1.0625rem', fontWeight: 400, lineHeight: 1.68 },
    body2: { fontSize: '0.9375rem', fontWeight: 400, lineHeight: 1.65 },
    button: { fontFamily: displayFont, fontSize: '0.9688rem', fontWeight: 600, textTransform: 'none' },
    overline: { fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase' }
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: { scrollBehavior: 'smooth', WebkitFontSmoothing: 'antialiased' },
        body: { overflowX: 'hidden' },

        // Honour the OS setting rather than animating over someone who asked us not to
        '@media (prefers-reduced-motion: reduce)': {
          html: { scrollBehavior: 'auto' },
          '*, *::before, *::after': {
            animationDuration: '0.01ms !important',
            animationIterationCount: '1 !important',
            transitionDuration: '0.01ms !important'
          }
        },

        // A visible, on-brand focus ring for keyboard users on every interactive element
        ':focus-visible': { outline: `3px solid ${brand.orange}`, outlineOffset: '3px' }
      }
    },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: radius.sm,
          paddingBlock: 11,
          paddingInline: 22,
          transition: 'transform .25s cubic-bezier(.22,1,.36,1), box-shadow .25s ease, background-color .2s ease',
          '&:hover': { transform: 'translateY(-2px)' },
          '&:active': { transform: 'translateY(0)' }
        },
        sizeLarge: { paddingBlock: 15, paddingInline: 30, fontSize: '0.9375rem', borderRadius: radius.sm },
        containedPrimary: {
          boxShadow: '0 8px 18px -10px rgba(217,120,20,.55)',
          '&:hover': { boxShadow: '0 14px 26px -12px rgba(217,120,20,.7)', transform: 'translateY(-2px)' }
        }
      }
    },

    MuiContainer: { defaultProps: { maxWidth: 'lg' } },

    MuiTypography: {
      defaultProps: {
        /*
         * MUI maps `subtitle1`/`subtitle2` onto `<h6>` by default, which turns
         * every section sub-heading, testimonial name and FAQ question into a
         * heading and wrecks the document outline for screen readers. These
         * variants are body text here, so map them to paragraphs — headings are
         * chosen explicitly with `component` wherever one is meant.
         */
        variantMapping: {
          subtitle1: 'p',
          subtitle2: 'p',
          body1: 'p',
          body2: 'p'
        }
      }
    },

    MuiOutlinedInput: {
      styleOverrides: { root: { borderRadius: radius.sm } }
    },

    MuiAccordion: {
      styleOverrides: {
        root: {
          borderRadius: radius.lg,
          '&::before': { display: 'none' },
          '&.Mui-expanded': { margin: 0 }
        }
      }
    }
  }
})

export default publicTheme
