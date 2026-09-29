import { describe, expect, it } from 'vitest'

import { sortWindows, windowProblems } from './availability'

describe('windowProblems', () => {
  it('accepts separate and touching windows on the same day', () => {
    expect(
      windowProblems([
        { weekday: 1, startTime: '08:00', endTime: '12:00' },
        { weekday: 1, startTime: '12:00', endTime: '16:00' },
        { weekday: 2, startTime: '08:00', endTime: '12:00' }
      ])
    ).toEqual({})
  })

  it('flags an end time that is not after the start time', () => {
    expect(windowProblems([{ weekday: 3, startTime: '10:00', endTime: '10:00' }])).toEqual({
      0: 'End time must be after the start time.'
    })
  })

  it('flags both windows that overlap on the same weekday only', () => {
    const problems = windowProblems([
      { weekday: 1, startTime: '08:00', endTime: '12:00' },
      { weekday: 1, startTime: '11:00', endTime: '14:00' },
      { weekday: 2, startTime: '11:00', endTime: '14:00' }
    ])

    expect(Object.keys(problems)).toEqual(['0', '1'])
  })
})

describe('sortWindows', () => {
  it('orders by weekday then start time without mutating the input', () => {
    const input = [
      { weekday: 2, startTime: '09:00', endTime: '10:00' },
      { weekday: 1, startTime: '13:00', endTime: '14:00' },
      { weekday: 1, startTime: '08:00', endTime: '09:00' }
    ]

    expect(sortWindows(input).map(w => `${w.weekday}-${w.startTime}`)).toEqual(['1-08:00', '1-13:00', '2-09:00'])
    expect(input[0].weekday).toBe(2)
  })
})
