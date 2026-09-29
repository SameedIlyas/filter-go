// Type Imports
import type { AvailabilityWindow } from '@/types/userTypes'

export const sortWindows = (windows: AvailabilityWindow[]) =>
  [...windows].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime))

/** Mirrors the server rules so problems show before saving: end after start, no overlap on the same day. */
export const windowProblems = (windows: AvailabilityWindow[]): Record<number, string> => {
  const problems: Record<number, string> = {}

  windows.forEach((window, index) => {
    if (window.startTime >= window.endTime) {
      problems[index] = 'End time must be after the start time.'

      return
    }

    const clash = windows.some(
      (other, j) =>
        j !== index &&
        other.weekday === window.weekday &&
        window.startTime < other.endTime &&
        other.startTime < window.endTime
    )

    if (clash) problems[index] = 'Overlaps another time on the same day.'
  })

  return problems
}
