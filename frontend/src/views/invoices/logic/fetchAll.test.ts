import { describe, expect, it, vi } from 'vitest'

import { mapPooled } from './fetchAll'

describe('mapPooled', () => {
  it('keeps input order, caps concurrency and reports progress', async () => {
    let running = 0
    let peak = 0
    const progress = vi.fn()

    const results = await mapPooled(
      [30, 10, 20, 5, 15],
      2,
      async delay => {
        running++
        peak = Math.max(peak, running)
        await new Promise(resolve => setTimeout(resolve, delay))
        running--

        return delay * 2
      },
      progress
    )

    expect(results).toEqual([60, 20, 40, 10, 30])
    expect(peak).toBe(2)
    expect(progress).toHaveBeenLastCalledWith(5)
  })

  it('handles an empty list', async () => {
    expect(await mapPooled([], 4, async () => 1)).toEqual([])
  })
})
