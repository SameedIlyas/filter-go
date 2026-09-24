'use client'

// React Imports
import { useEffect, useRef, useState } from 'react'

// Third-party Imports
import { useInView, useReducedMotion } from 'motion/react'

type Props = {
  value: number
  suffix?: string

  /** Milliseconds for the full count. */
  duration?: number
}

/**
 * Counts up to `value` the first time it scrolls into view.
 *
 * Driven by rAF against elapsed wall-clock time rather than a fixed step per
 * frame, so the count takes the same duration on a 60Hz and a 120Hz display.
 * Reduced motion gets the final number immediately.
 */
const Counter = ({ value, suffix = '', duration = 1800 }: Props) => {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true, amount: 0.5 })
  const shouldReduceMotion = useReducedMotion()
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (!isInView) {
      return
    }

    if (shouldReduceMotion) {
      setDisplay(value)

      return
    }

    let frame = 0
    const start = performance.now()

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)

      // easeOutExpo — fast off the mark, gentle landing on the final number
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)

      setDisplay(Math.round(value * eased))

      if (progress < 1) {
        frame = requestAnimationFrame(tick)
      }
    }

    frame = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frame)
  }, [isInView, value, duration, shouldReduceMotion])

  return (
    <span ref={ref}>
      {display.toLocaleString('en-US')}
      {suffix}
    </span>
  )
}

export default Counter
