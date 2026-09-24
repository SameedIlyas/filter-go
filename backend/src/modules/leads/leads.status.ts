import type { LeadStatus } from '../../generated/prisma/client.js'
import { Errors } from '../../lib/errors.js'

/**
 * The pipeline. Forward skips are allowed, going back is not (except reopening a LOST lead).
 * WON is listed for QUALIFIED and PROPOSAL because conversion may take those edges, but ONLY conversion may:
 * the status endpoint filters it out (see `allowedViaStatus`).
 */
export const LEAD_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NEW: ['CONTACTED', 'QUALIFIED', 'PROPOSAL', 'LOST'],
  CONTACTED: ['QUALIFIED', 'PROPOSAL', 'LOST'],
  QUALIFIED: ['PROPOSAL', 'WON', 'LOST'],
  PROPOSAL: ['WON', 'LOST'],
  WON: [],
  LOST: ['NEW']
}

export const OPEN_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL']

export const CONVERTIBLE_STATUSES: LeadStatus[] = ['QUALIFIED', 'PROPOSAL']

export const allowedViaStatus = (from: LeadStatus): LeadStatus[] => LEAD_TRANSITIONS[from].filter(status => status !== 'WON')

/** Throws INVALID_STATE unless `from -> to` is an edge the status endpoint may take (WON is never one of them). */
export const assertStatusTransition = (from: LeadStatus, to: LeadStatus): void => {
  const allowed = allowedViaStatus(from)

  if (!allowed.includes(to)) {
    throw Errors.invalidState('lead', from, to, allowed)
  }
}

/** Throws INVALID_STATE unless a lead in `from` may be converted; `allowed` lists the moves it can make instead. */
export const assertConvertible = (from: LeadStatus): void => {
  if (!CONVERTIBLE_STATUSES.includes(from)) {
    throw Errors.invalidState('lead', from, 'WON', allowedViaStatus(from))
  }
}
