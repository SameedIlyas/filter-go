import type { ApproveBatchResponse, BatchSkipReason } from '@/types/timesheetTypes'

const REASON_TEXT: Record<BatchSkipReason, string> = {
  NOT_FOUND: 'no longer available',
  NOT_SUBMITTED: 'not waiting for approval',
  HAS_UNRESOLVED_EXCEPTIONS: 'have open exceptions',
  INVALID_STATE: 'changed status meanwhile',
  UNPROCESSABLE: 'cannot be priced from the schedule terms'
}

/** "Skipped 3: 2 have open exceptions, 1 not waiting for approval", or null when nothing was skipped. */
export const skippedSummary = (result: ApproveBatchResponse): string | null => {
  if (result.skipped.length === 0) return null

  const counts = new Map<BatchSkipReason, number>()

  result.skipped.forEach(({ reason }) => counts.set(reason, (counts.get(reason) ?? 0) + 1))

  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${count} ${REASON_TEXT[reason] ?? reason.toLowerCase()}`)

  return `Skipped ${result.skipped.length}: ${parts.join(', ')}`
}
