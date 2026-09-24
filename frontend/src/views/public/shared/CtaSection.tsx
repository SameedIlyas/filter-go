'use client'

// Next Imports
import Link from 'next/link'

// MUI Imports
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

// Component Imports
import Magnetic from './Magnetic'
import Reveal from './Reveal'

type Props = {
  title: string
  highlight?: string
  subtitle?: string
  primaryCta: { label: string; href: string }
  secondaryCta?: { label: string; href: string }
}

/**
 * The closing call to action: a full-bleed orange band.
 *
 * Deliberately edge-to-edge rather than an inset card — it is the last thing on
 * every page and a full-width colour change is what makes it read as a break in
 * the document rather than one more section.
 */
const CtaSection = ({ title, highlight, subtitle, primaryCta, secondaryCta }: Props) => (
  <Box
    component='section'
    sx={{
      backgroundColor: 'primary.main',
      backgroundImage: 'linear-gradient(120deg, #EF8A22 0%, #F18F2C 55%, #F7A64F 100%)',
      paddingBlock: { xs: 8, md: 12 }
    }}
  >
    <Container sx={{ textAlign: 'center' }}>
      <Reveal>
        <Typography variant='h2' component='p' sx={{ color: '#FFFFFF' }}>
          {title}
          {highlight ? (
            <Box component='span' sx={{ display: 'block', color: 'rgba(255,255,255,.82)' }}>
              {highlight}
            </Box>
          ) : null}
        </Typography>
      </Reveal>

      {subtitle ? (
        <Reveal delay={0.08}>
          <Typography
            variant='subtitle1'
            sx={{ color: 'rgba(255,255,255,.9)', marginBlockStart: 2.5, marginInline: 'auto', maxInlineSize: 620 }}
          >
            {subtitle}
          </Typography>
        </Reveal>
      ) : null}

      <Reveal delay={0.16}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          sx={{ gap: 2, marginBlockStart: 5, justifyContent: 'center', alignItems: 'center' }}
        >
          <Magnetic>
            <Button
              variant='contained'
              size='large'
              component={Link}
              href={primaryCta.href}
              sx={{
                backgroundColor: '#FFFFFF',
                color: 'secondary.main',
                boxShadow: 'none',
                '&:hover': { backgroundColor: '#FFF7EE', boxShadow: '0 14px 28px -16px rgba(0,0,0,.45)' }
              }}
            >
              {primaryCta.label}
            </Button>
          </Magnetic>

          {secondaryCta ? (
            <Button
              size='large'
              component={Link}
              href={secondaryCta.href}
              sx={{
                color: '#FFFFFF',
                border: '1px solid rgba(255,255,255,.55)',
                '&:hover': { backgroundColor: 'rgba(255,255,255,.14)', borderColor: '#FFFFFF' }
              }}
            >
              {secondaryCta.label}
            </Button>
          ) : null}
        </Stack>
      </Reveal>
    </Container>
  </Box>
)

export default CtaSection
