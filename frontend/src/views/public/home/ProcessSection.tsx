'use client'

// React Imports
import { useRef } from 'react'

// MUI Imports
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { motion, useScroll, useSpring, useTransform } from 'motion/react'

// Theme Imports
import { radius } from '@components/layout/public/theme'

// Data Imports
import { home } from '@/data/public/site'

// Component Imports
import Reveal from '../shared/Reveal'
import SectionHeading from '../shared/SectionHeading'

/**
 * The three-step explainer.
 *
 * A single rail runs down the steps and fills as the section scrolls past,
 * tying the three cards into one continuous journey. The fill is scroll-linked
 * rather than time-based, so it tracks the reader instead of racing ahead.
 */
const ProcessSection = () => {
  const ref = useRef<HTMLDivElement>(null)

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 65%', 'end 65%'] })

  const railHeight = useSpring(useTransform(scrollYProgress, [0, 1], ['0%', '100%']), {
    stiffness: 90,
    damping: 24,
    restDelta: 0.001
  })

  return (
    <Box component='section' id='process' sx={{ paddingBlock: { xs: 10, md: 16 }, scrollMarginBlockStart: 90 }}>
      <Container>
        <SectionHeading eyebrow={home.process.eyebrow} title={home.process.title} subtitle={home.process.subtitle} />

        <Box ref={ref} sx={{ position: 'relative', maxInlineSize: 960, marginInline: 'auto' }}>
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              insetBlock: 0,
              insetInlineStart: { xs: 27, md: '50%' },
              inlineSize: 2,
              marginInlineStart: { md: -1 },
              backgroundColor: 'divider',
              borderRadius: radius.pill
            }}
          />
          <Box
            component={motion.div}
            aria-hidden
            style={{ height: railHeight }}
            sx={{
              position: 'absolute',
              insetBlockStart: 0,
              insetInlineStart: { xs: 27, md: '50%' },
              inlineSize: 2,
              marginInlineStart: { md: -1 },
              borderRadius: radius.pill,
              background: theme => `linear-gradient(180deg, ${theme.vars.palette.primary.main}, #7FE0D4)`
            }}
          />

          {home.process.steps.map((step, index) => (
            <Box
              key={step.id}
              sx={{
                position: 'relative',
                display: 'grid',
                gridTemplateColumns: { xs: '56px 1fr', md: '1fr 56px 1fr' },
                alignItems: 'center',
                gap: { xs: 2, md: 3 },
                paddingBlock: { xs: 3, md: 4 }
              }}
            >
              <Box
                sx={{
                  gridColumn: { xs: 1, md: 2 },
                  gridRow: 1,
                  display: 'flex',
                  justifyContent: 'center',
                  zIndex: 1
                }}
              >
                <Reveal distance={0}>
                  <Box
                    sx={{
                      display: 'grid',
                      placeItems: 'center',
                      inlineSize: 56,
                      blockSize: 56,
                      borderRadius: '50%',
                      backgroundColor: 'background.default',
                      border: '2px solid',
                      borderColor: 'primary.main',
                      color: 'primary.main',
                      fontSize: '1.5rem'
                    }}
                  >
                    <i className={step.icon} />
                  </Box>
                </Reveal>
              </Box>

              <Box
                sx={{
                  gridColumn: { xs: 2, md: index % 2 === 0 ? 1 : 3 },
                  gridRow: 1,
                  textAlign: { xs: 'start', md: index % 2 === 0 ? 'end' : 'start' }
                }}
              >
                <Reveal direction={index % 2 === 0 ? 'right' : 'left'} distance={36}>
                  <Box
                    sx={{
                      padding: { xs: 3, md: 4 },
                      borderRadius: radius.lg,
                      backgroundColor: 'background.paper',
                      border: '1px solid',
                      borderColor: 'divider',
                      transition: 'transform .4s cubic-bezier(.22,1,.36,1), box-shadow .4s ease, border-color .3s ease',
                      '&:hover': {
                        transform: 'translateY(-6px)',
                        borderColor: theme => `rgba(${theme.vars.palette.primary.mainChannel} / 0.42)`,
                        boxShadow: '0 24px 48px -28px rgba(27,154,170,.55)'
                      }
                    }}
                  >
                    <Typography variant='overline' sx={{ display: 'block', color: 'primary.main', marginBlockEnd: 1 }}>
                      {step.label}
                    </Typography>
                    <Typography variant='h4' component='h3' sx={{ marginBlockEnd: 1.5 }}>
                      {step.title}
                    </Typography>
                    <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                      {step.description}
                    </Typography>
                  </Box>
                </Reveal>
              </Box>
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  )
}

export default ProcessSection
