'use client'

// MUI Imports
import Box from '@mui/material/Box'

// Third-party Imports
import { motion, useReducedMotion } from 'motion/react'

type Props = {

  /** `hero` is the full-strength treatment; `section` is a quieter version. */
  variant?: 'hero' | 'section'
}

/**
 * The ambient green wash sitting behind the hero and feature sections.
 *
 * Two slow, offset radial blooms suggest moving air without a video or canvas —
 * it costs two composited layers and animates only `transform`, so it stays off
 * the main thread and never blocks interaction.
 */
const AirBackdrop = ({ variant = 'hero' }: Props) => {
  const shouldReduceMotion = useReducedMotion()
  const isHero = variant === 'hero'

  const blob = {
    position: 'absolute' as const,
    borderRadius: '50%',
    filter: `blur(${isHero ? 90 : 70}px)`,
    willChange: 'transform'
  }

  return (
    <Box aria-hidden sx={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      <Box
        component={motion.div}
        sx={{
          ...blob,
          insetBlockStart: isHero ? '-14%' : '-30%',
          insetInlineEnd: isHero ? '-8%' : '-14%',
          inlineSize: isHero ? 560 : 420,
          blockSize: isHero ? 560 : 420,
          background: theme =>
            `radial-gradient(circle, rgba(${theme.vars.palette.primary.mainChannel} / 0.30) 0%, transparent 70%)`
        }}
        animate={shouldReduceMotion ? undefined : { scale: [1, 1.14, 1], x: [0, -28, 0], y: [0, 22, 0] }}
        transition={{ duration: 17, repeat: Infinity, ease: 'easeInOut' }}
      />
      <Box
        component={motion.div}
        sx={{
          ...blob,
          insetBlockEnd: isHero ? '-22%' : '-34%',
          insetInlineStart: isHero ? '-10%' : '-16%',
          inlineSize: isHero ? 480 : 360,
          blockSize: isHero ? 480 : 360,
          background: 'radial-gradient(circle, rgba(127,224,212,.34) 0%, transparent 70%)'
        }}
        animate={shouldReduceMotion ? undefined : { scale: [1, 1.2, 1], x: [0, 34, 0], y: [0, -18, 0] }}
        transition={{ duration: 21, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
      />
    </Box>
  )
}

export default AirBackdrop
