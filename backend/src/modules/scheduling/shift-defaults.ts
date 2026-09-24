import { D } from '../../lib/money.js'
import type { Decimal } from '../../lib/money.js'
import type { TermsSnapshot } from '../../lib/terms-snapshot.js'

/**
 * What a new shift inherits from the frozen snapshot (docs/ARCHITECTURE.md 5.3): `serviceRef` is the line id when the
 * site has exactly one line, and per-visit contracts bill that line's quantity for each shift.
 */
export const shiftDefaults = (snapshot: TermsSnapshot): { serviceRef: string | null; billableQty: Decimal | null } => {
  const [item, other] = snapshot.serviceItems
  const single = item && !other ? item : undefined

  return {
    serviceRef: single?.lineId ?? null,
    billableQty: single && snapshot.billingType === 'PER_VISIT' ? D(single.qty) : null
  }
}
