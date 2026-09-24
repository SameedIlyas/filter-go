'use client'

// Next Imports
import Link from 'next/link'

// MUI Imports
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { motion, useReducedMotion } from 'motion/react'

// Theme Imports
import { radius } from '@components/layout/public/theme'

// Data Imports
import { home, siteConfig } from '@/data/public/site'

// Component Imports
import AirGraphic from '../shared/AirGraphic'
import Magnetic from '../shared/Magnetic'

/*
 * Each headline line sits in an overflow-hidden box and slides up from below
 * it, so the words appear to be uncovered rather than faded in. It is the one
 * piece of motion every visitor sees, so it runs on load rather than on scroll.
 */
const lineVariants = {
  hidden: { y: '110%' },
  visible: (i: number) => ({
    y: 0,
    transition: { duration: 0.9, delay: 0.15 + i * 0.12, ease: [0.22, 1, 0.36, 1] as const }
  })
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay: 0.55 + i * 0.1, ease: [0.22, 1, 0.36, 1] as const }
  })
}

const HeroSection = () => {
  const shouldReduceMotion = useReducedMotion()
  const initial = shouldReduceMotion ? 'visible' : 'hidden'

  return (
    <Box
      component='section'
      sx={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        minBlockSize: { xs: 'auto', md: '88svh' },
        paddingBlockStart: { xs: 16, md: 16 },
        paddingBlockEnd: { xs: 10, md: 16 },
        overflow: 'hidden',
        color: '#FFFFFF',
        backgroundColor: 'secondary.dark',
        backgroundImage: 'linear-gradient(160deg, #072C46 0%, #0B3B5C 55%, #14527B 100%)'
      }}
    >
      <Container sx={{ position: 'relative', zIndex: 1 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1.15fr 0.85fr' },
            alignItems: 'center',
            gap: { xs: 6, md: 4 }
          }}
        >
          <Box>
            <Box
              component={motion.div}
              variants={fadeUp}
              custom={-2}
              initial={initial}
              animate='visible'
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1.25,
                paddingBlock: 0.75,
                paddingInline: 2,
                marginBlockEnd: { xs: 3, md: 4 },
                borderRadius: radius.pill,
                border: '1px solid rgba(255,255,255,.22)',
                backgroundColor: 'rgba(255,255,255,.08)'
              }}
            >
              <Box
                component='span'
                sx={{
                  inlineSize: 7,
                  blockSize: 7,
                  borderRadius: '50%',
                  backgroundColor: 'primary.main',
                  animation: shouldReduceMotion ? 'none' : 'coolcraftPulse 2.4s infinite'
                }}
              />
              <Typography variant='body2' sx={{ fontWeight: 600, color: '#FFFFFF' }}>
                No contracts · No service fees
              </Typography>
            </Box>

            <Typography variant='h1' component='h1' sx={{ marginBlockEnd: { xs: 3, md: 4 } }}>
              {home.hero.titleLines.map((line, index) => (
                <Box key={line} sx={{ display: 'block', overflow: 'hidden', paddingBlockEnd: '0.08em' }}>
                  <Box
                    component={motion.span}
                    variants={lineVariants}
                    custom={index}
                    initial={initial}
                    animate='visible'
                    sx={{
                      display: 'block',
                      ...(index === 1 && {
                        color: 'primary.main'
                      })
                    }}
                  >
                    {line}
                  </Box>
                </Box>
              ))}
            </Typography>

            <Box component={motion.div} variants={fadeUp} custom={0} initial={initial} animate='visible'>
              <Typography variant='subtitle1' sx={{ color: 'rgba(255,255,255,.78)', maxInlineSize: 500 }}>
                {home.hero.subtitle}
              </Typography>
            </Box>

            <Box
              component={motion.div}
              variants={fadeUp}
              custom={1}
              initial={initial}
              animate='visible'
              sx={{ marginBlockStart: { xs: 4, md: 5 } }}
            >
              <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 2, alignItems: { sm: 'center' } }}>
                <Magnetic>
                  <Button variant='contained' size='large' component={Link} href={home.hero.primaryCta.href}>
                    {home.hero.primaryCta.label}
                  </Button>
                </Magnetic>
                <Button
                  size='large'
                  component={Link}
                  href={home.hero.secondaryCta.href}
                  endIcon={<i className='bx-down-arrow-alt' />}
                  sx={{
                    color: '#FFFFFF',
                    border: '1px solid rgba(255,255,255,.45)',
                    '&:hover': { backgroundColor: 'rgba(255,255,255,.1)', borderColor: '#FFFFFF' }
                  }}
                >
                  {home.hero.secondaryCta.label}
                </Button>
              </Stack>
            </Box>

            <Box
              component={motion.div}
              variants={fadeUp}
              custom={2}
              initial={initial}
              animate='visible'
              sx={{ marginBlockStart: { xs: 5, md: 7 } }}
            >
              <Stack direction='row' sx={{ gap: { xs: 3, sm: 5 }, flexWrap: 'wrap' }}>
                {[
                  { icon: 'bx-phone', label: siteConfig.phone, href: siteConfig.phoneHref },
                  { icon: 'bx-envelope', label: siteConfig.email, href: siteConfig.emailHref }
                ].map(item => (
                  <Stack
                    key={item.label}
                    component='a'
                    href={item.href}
                    direction='row'
                    sx={{
                      alignItems: 'center',
                      gap: 1,
                      color: 'rgba(255,255,255,.72)',
                      textDecoration: 'none',
                      transition: 'color .2s ease',
                      '&:hover': { color: 'primary.main' }
                    }}
                  >
                    <i className={item.icon} />
                    <Typography variant='body2' sx={{ fontWeight: 500 }}>
                      {item.label}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          </Box>

          <Box
            component={motion.div}
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            sx={{
              display: 'flex',
              justifyContent: 'center',
              order: { xs: -1, md: 0 },

              // Capped on phones so the headline is not pushed below the fold
              '& svg': { maxInlineSize: { xs: 280, sm: 360, md: 440 } }
            }}
          >
            <AirGraphic variant='filter' width={440} />
          </Box>
        </Box>
      </Container>
    </Box>
  )
}

export default HeroSection
