// React Imports
import type { SVGAttributes } from 'react'

/**
 * Breeze mark (FilterGO).
 *
 * A rounded filter housing with a double chevron reading through it — the
 * chevrons double as filter pleats and as the "GO" in FilterGO. Drawn in
 * `currentColor` so it inherits the active primary colour in both light and
 * dark mode, and stays legible down to ~20px.
 */
const Logo = (props: SVGAttributes<SVGElement>) => {
  return (
    <svg width='1em' height='1em' viewBox='0 0 32 32' fill='none' xmlns='http://www.w3.org/2000/svg' {...props}>
      {/* Filter housing */}
      <rect width='32' height='32' rx='9' fill='currentColor' fillOpacity='0.16' />

      {/* Pleats / airflow */}
      <path
        d='M10.5 9.5L16 16L10.5 22.5'
        stroke='currentColor'
        strokeWidth='3'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
      <path
        d='M18 9.5L23.5 16L18 22.5'
        stroke='currentColor'
        strokeWidth='3'
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeOpacity='0.55'
      />
    </svg>
  )
}

export default Logo
