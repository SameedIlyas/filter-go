'use client'

// React Imports
import { useRef } from 'react'

import type { ReactNode } from 'react'

// Third-party Imports
import { motion, useMotionValue, useSpring, useReducedMotion } from 'motion/react'

type Props = {
  children: ReactNode

  /** How far the element may drift from centre, in px. */
  strength?: number
  className?: string
}

/**
 * Pulls its child gently toward the cursor and springs back on leave.
 *
 * Applied to primary CTAs only. The effect is pointer-driven, so it never fires
 * on touch, and it is disabled entirely under reduced motion.
 */
const Magnetic = ({ children, strength = 14, className }: Props) => {
  const ref = useRef<HTMLDivElement>(null)
  const shouldReduceMotion = useReducedMotion()

  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const springX = useSpring(x, { stiffness: 260, damping: 18, mass: 0.4 })
  const springY = useSpring(y, { stiffness: 260, damping: 18, mass: 0.4 })

  const handleMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (shouldReduceMotion || event.pointerType !== 'mouse' || !ref.current) {
      return
    }

    const rect = ref.current.getBoundingClientRect()

    // Offset from the element's centre, scaled so the edge maps to `strength`
    x.set(((event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2)) * strength)
    y.set(((event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2)) * strength)
  }

  const reset = () => {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ x: springX, y: springY, display: 'inline-flex' }}
      onPointerMove={handleMove}
      onPointerLeave={reset}
    >
      {children}
    </motion.div>
  )
}

export default Magnetic
