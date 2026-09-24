'use client'

// React Imports
import type { ReactNode } from 'react'

// Third-party Imports
import { motion, useReducedMotion } from 'motion/react'

import type { Variants } from 'motion/react'

type Direction = 'up' | 'down' | 'left' | 'right' | 'none'

type Props = {
  children: ReactNode

  /** Seconds to wait before this element starts — stagger a group by increasing it per item. */
  delay?: number
  direction?: Direction

  /** Travel distance in px. Kept small; long slides read as jank, not polish. */
  distance?: number
  className?: string

  /** Animate every time it scrolls into view rather than only the first time. */
  repeat?: boolean
}

const offset = (direction: Direction, distance: number) => {
  switch (direction) {
    case 'up':
      return { y: distance }
    case 'down':
      return { y: -distance }
    case 'left':
      return { x: distance }
    case 'right':
      return { x: -distance }
    default:
      return {}
  }
}

/**
 * Scroll-triggered entrance used by every section on the public site.
 *
 * The easing is a strong ease-out: motion covers most of its distance
 * immediately and settles, which reads as responsive rather than slow. When the
 * visitor has asked for reduced motion we render the final state directly —
 * content still appears, it simply does not travel.
 */
const Reveal = ({ children, delay = 0, direction = 'up', distance = 28, className, repeat = false }: Props) => {
  const shouldReduceMotion = useReducedMotion()

  const variants: Variants = {
    hidden: shouldReduceMotion ? { opacity: 0 } : { opacity: 0, ...offset(direction, distance) },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: {
        duration: shouldReduceMotion ? 0.2 : 0.7,
        delay: shouldReduceMotion ? 0 : delay,
        ease: [0.22, 1, 0.36, 1]
      }
    }
  }

  return (
    <motion.div
      className={className}
      variants={variants}
      initial='hidden'
      whileInView='visible'
      viewport={{ once: !repeat, amount: 0.25, margin: '0px 0px -80px 0px' }}
    >
      {children}
    </motion.div>
  )
}

export default Reveal
