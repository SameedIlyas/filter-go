'use client'

// MUI Imports
import Box from '@mui/material/Box'

// Third-party Imports
import { motion, useReducedMotion } from 'motion/react'

export type AirGraphicVariant = 'filter' | 'schedule' | 'report'

type Props = {
  variant?: AirGraphicVariant

  /** Rendered width in px; the artwork is square. */
  width?: number
  className?: string
}

const FLOW = [
  { y: 46, length: 118, delay: 0 },
  { y: 78, length: 150, delay: 0.55 },
  { y: 110, length: 96, delay: 1.1 },
  { y: 142, length: 138, delay: 0.3 },
  { y: 174, length: 110, delay: 0.85 }
]

/**
 * CoolCraft's illustration: air moving through a filter frame.
 *
 * Drawn here rather than shipped as an asset so it inherits the theme's primary
 * colour, stays crisp at any size, and costs a couple of KB. The flow lines
 * sweep left to right on a stagger, which is the whole idea of the product in
 * one loop — air passing through, cleanly, on a rhythm.
 *
 * `variant` changes what sits inside the frame so the same composition can
 * carry three different sections without repeating itself.
 */
const AirGraphic = ({ variant = 'filter', width = 320, className }: Props) => {
  const shouldReduceMotion = useReducedMotion()

  return (
    <Box
      component='svg'
      viewBox='0 0 260 220'
      role='presentation'
      aria-hidden
      className={className}
      sx={{ inlineSize: '100%', maxInlineSize: width, blockSize: 'auto', color: 'primary.main' }}
    >
      {/* Air moving toward the frame */}
      <g stroke='currentColor' strokeWidth='5' strokeLinecap='round' opacity='0.42'>
        {FLOW.map(line => (
          <Box
            key={line.y}
            component={motion.line}
            x1={2}
            y1={line.y}
            x2={line.length}
            y2={line.y}
            initial={shouldReduceMotion ? undefined : { pathLength: 0.25, opacity: 0.25 }}
            animate={
              shouldReduceMotion
                ? undefined
                : { pathLength: [0.25, 1, 0.25], opacity: [0.25, 0.75, 0.25], x: [0, 18, 0] }
            }
            transition={{ duration: 4.6, repeat: Infinity, ease: 'easeInOut', delay: line.delay }}
          />
        ))}
      </g>

      {/* The filter frame */}
      <rect
        x='132'
        y='26'
        width='106'
        height='168'
        rx='18'
        fill='currentColor'
        fillOpacity='0.1'
        stroke='currentColor'
        strokeWidth='4'
      />

      {variant === 'filter' ? (

        // Pleated media
        <path
          d='M148 44 l14 22 -14 22 14 22 -14 22 14 22 -14 22'
          fill='none'
          stroke='currentColor'
          strokeWidth='4'
          strokeLinecap='round'
          strokeLinejoin='round'
          opacity='0.8'
        />
      ) : null}

      {variant === 'schedule' ? (

        // A calendar grid inside the frame
        <g stroke='currentColor' strokeWidth='3.5' strokeLinecap='round' opacity='0.8'>
          <path d='M152 62h66M152 90h66M152 118h66M152 146h66' />
          <path d='M174 52v106M196 52v106' opacity='0.45' />
          <circle cx='163' cy='132' r='8' fill='currentColor' stroke='none' />
        </g>
      ) : null}

      {variant === 'report' ? (

        // A checked-off report
        <g stroke='currentColor' strokeWidth='4' strokeLinecap='round' strokeLinejoin='round' opacity='0.85'>
          <path d='M154 70h40M154 92h62M154 114h48' opacity='0.5' />
          <path d='M158 148l14 14 28 -32' />
        </g>
      ) : null}

      {/* Clean air leaving the frame */}
      <g stroke='currentColor' strokeWidth='5' strokeLinecap='round'>
        {[70, 110, 150].map((y, index) => (
          <Box
            key={y}
            component={motion.line}
            x1={244}
            y1={y}
            x2={258}
            y2={y}
            initial={shouldReduceMotion ? undefined : { opacity: 0.2 }}
            animate={shouldReduceMotion ? undefined : { opacity: [0.2, 0.9, 0.2], x: [0, 6, 0] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut', delay: index * 0.4 }}
          />
        ))}
      </g>
    </Box>
  )
}

export default AirGraphic
