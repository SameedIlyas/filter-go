'use client'

// React Imports
import { useCallback, useEffect, useState } from 'react'

// MUI Imports
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

// Theme Imports
import { radius } from '@components/layout/public/theme'

// Data Imports
import { testimonials } from '@/data/public/site'

// Component Imports
import SectionHeading from './SectionHeading'

const AUTOPLAY_MS = 7000

/**
 * Customer quotes, one at a time.
 *
 * Autoplay pauses on hover and on focus within the card, and stops entirely
 * under reduced motion — an advancing carousel is hostile to anyone reading
 * slowly or tabbing through. Arrows and dots remain available either way.
 */
const TestimonialsSection = () => {
  const shouldReduceMotion = useReducedMotion()
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const [paused, setPaused] = useState(false)

  const go = useCallback((next: number, dir: number) => {
    setDirection(dir)
    setIndex((next + testimonials.length) % testimonials.length)
  }, [])

  useEffect(() => {
    if (paused || shouldReduceMotion) {
      return
    }

    const timer = setTimeout(() => go(index + 1, 1), AUTOPLAY_MS)

    return () => clearTimeout(timer)
  }, [index, paused, shouldReduceMotion, go])

  const active = testimonials[index]

  return (
    <Box component='section' sx={{ paddingBlock: { xs: 10, md: 16 } }}>
      <Container>
        <SectionHeading eyebrow='Feedback' title='Trusted by businesses like yours' />

        <Box
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
          sx={{ maxInlineSize: 880, marginInline: 'auto' }}
        >
          <Box
            sx={{
              position: 'relative',
              minBlockSize: { xs: 320, sm: 270 },
              padding: { xs: 4, md: 6 },
              borderRadius: radius.xl,
              backgroundColor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider'
            }}
          >
            <Box
              aria-hidden
              sx={{
                fontSize: '4rem',
                lineHeight: 0.7,
                color: 'primary.main',
                opacity: 0.32,
                marginBlockEnd: 2
              }}
            >
              <i className='bx-bxs-quote-left' />
            </Box>

            <AnimatePresence mode='wait' custom={direction}>
              <Box
                key={active.id}
                component={motion.div}
                custom={direction}
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * -40 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              >
                <Typography variant='h5' component='blockquote' sx={{ fontWeight: 500, lineHeight: 1.5 }}>
                  {active.quote}
                </Typography>

                <Stack direction='row' sx={{ alignItems: 'center', gap: 2, marginBlockStart: 4 }}>
                  <Box
                    sx={{
                      display: 'grid',
                      placeItems: 'center',
                      inlineSize: 48,
                      blockSize: 48,
                      borderRadius: '50%',
                      fontWeight: 700,
                      color: 'primary.main',
                      backgroundColor: theme => `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`
                    }}
                  >
                    {active.name.charAt(0)}
                  </Box>
                  <Box>
                    <Typography variant='subtitle2' sx={{ fontWeight: 600 }}>
                      {active.name}
                    </Typography>
                    <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                      {active.business}
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            </AnimatePresence>
          </Box>

          <Stack direction='row' sx={{ alignItems: 'center', justifyContent: 'center', gap: 2, marginBlockStart: 4 }}>
            <IconButton onClick={() => go(index - 1, -1)} aria-label='Previous testimonial'>
              <i className='bx-left-arrow-alt' />
            </IconButton>

            <Stack direction='row' sx={{ gap: 1 }}>
              {testimonials.map((item, dotIndex) => (
                <Box
                  key={item.id}
                  component='button'
                  type='button'
                  aria-label={`Show testimonial from ${item.name}`}
                  aria-current={dotIndex === index}
                  onClick={() => go(dotIndex, dotIndex > index ? 1 : -1)}
                  sx={{
                    border: 0,
                    padding: 0,
                    cursor: 'pointer',
                    blockSize: 8,
                    inlineSize: dotIndex === index ? 28 : 8,
                    borderRadius: radius.pill,
                    backgroundColor: dotIndex === index ? 'primary.main' : 'divider',
                    transition: 'inline-size .4s cubic-bezier(.22,1,.36,1), background-color .3s ease'
                  }}
                />
              ))}
            </Stack>

            <IconButton onClick={() => go(index + 1, 1)} aria-label='Next testimonial'>
              <i className='bx-right-arrow-alt' />
            </IconButton>
          </Stack>
        </Box>
      </Container>
    </Box>
  )
}

export default TestimonialsSection
