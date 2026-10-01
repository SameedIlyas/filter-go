import { describe, expect, it } from 'vitest'

import { clampWindow, formatDayColumn, formatWindow, instantRange, shiftWindow, weekOf } from './window'

describe('hours window', () => {
  it('starts weeks on Monday', () => {
    expect(weekOf('2026-03-04')).toEqual({ from: '2026-03-02', to: '2026-03-08' })
    expect(weekOf('2026-03-08')).toEqual({ from: '2026-03-02', to: '2026-03-08' })
  })

  it('pages by the window length', () => {
    expect(shiftWindow({ from: '2026-03-02', to: '2026-03-08' }, 1)).toEqual({ from: '2026-03-09', to: '2026-03-15' })
    expect(shiftWindow({ from: '2026-03-01', to: '2026-03-14' }, -1)).toEqual({ from: '2026-02-15', to: '2026-02-28' })
  })

  it('keeps the window ordered and within 45 days', () => {
    expect(clampWindow({ from: '2026-03-10', to: '2026-03-02' })).toEqual({ from: '2026-03-10', to: '2026-03-10' })
    expect(clampWindow({ from: '2026-03-01', to: '2026-06-01' })).toEqual({ from: '2026-03-01', to: '2026-04-14' })
    expect(clampWindow({ from: '2026-03-01', to: '2026-03-31' })).toEqual({ from: '2026-03-01', to: '2026-03-31' })
  })

  it('widens the instant range by the largest zone offset', () => {
    expect(instantRange({ from: '2026-03-02', to: '2026-03-08' })).toEqual({ from: '2026-03-01T10:00:00.000Z', to: '2026-03-09T14:00:00.000Z' })
  })

  it('formats columns and the range', () => {
    expect(formatDayColumn('2026-03-02')).toBe('Mon 2')
    expect(formatWindow({ from: '2026-03-02', to: '2026-03-08' })).toBe('Mar 2 – Mar 8, 2026')
    expect(formatWindow({ from: '2025-12-29', to: '2026-01-04' })).toBe('Dec 29, 2025 – Jan 4, 2026')
  })
})
