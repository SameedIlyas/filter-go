import type { Decimal } from '../../lib/money.js'
import { round2, ZERO } from '../../lib/money.js'
import { Errors } from '../../lib/errors.js'
import { itemBillRate, itemPayRate, parseTermsSnapshot, primaryItem } from '../../lib/terms-snapshot.js'

export interface RateStamps {
  payRate: Decimal
  billRate: Decimal
}

/**
 * The rates an approved entry is stamped with (docs/ARCHITECTURE.md 6.6). They come ONLY from the schedule's frozen
 * terms snapshot, never from the live contract:
 *   bill rate = the snapshot line the shift points at (`serviceRef`), else the site's primary line
 *   pay rate  = that line's pay rate, else the worker's default pay rate, else 0
 * A snapshot with no line for the site cannot price work, so approval is refused rather than stamping a zero bill rate.
 */
export const resolveRates = (snapshotJson: unknown, serviceRef: string | null, workerDefaultPayRate: Decimal | null): RateStamps => {
  const snapshot = (() => {
    try {
      return parseTermsSnapshot(snapshotJson)
    } catch {
      throw Errors.unprocessable('The schedule terms for this shift are unreadable, so it cannot be priced.')
    }
  })()

  const item = (serviceRef ? snapshot.serviceItems.find(line => line.lineId === serviceRef) : undefined) ?? primaryItem(snapshot)

  if (!item) throw Errors.unprocessable('The schedule terms have no service line for this site, so this timesheet cannot be priced.')

  return {
    billRate: round2(itemBillRate(item)),
    payRate: round2(itemPayRate(item) ?? workerDefaultPayRate ?? ZERO)
  }
}
