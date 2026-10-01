import { describe, expect, it } from 'vitest'

import { skippedSummary } from './batchSummary'

describe('skippedSummary', () => {
  it('is null when everything was approved', () => {
    expect(skippedSummary({ approved: ['a'], skipped: [] })).toBeNull()
  })

  it('counts the skipped entries by reason, most common first, in plain words', () => {
    expect(
      skippedSummary({
        approved: [],
        skipped: [
          { id: 'a', reason: 'NOT_SUBMITTED' },
          { id: 'b', reason: 'HAS_UNRESOLVED_EXCEPTIONS' },
          { id: 'c', reason: 'HAS_UNRESOLVED_EXCEPTIONS' }
        ]
      })
    ).toBe('Skipped 3: 2 have open exceptions, 1 not waiting for approval')
  })
})
