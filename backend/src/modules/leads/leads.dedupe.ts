import type { Lead } from '../../generated/prisma/client.js'
import type { Db } from '../../lib/prisma.js'
import { OPEN_STATUSES } from './leads.status.js'

const MIN_PHONE_DIGITS = 7

/** Digits only; fewer than 7 digits is not a usable phone number for duplicate detection. */
export const normalizePhone = (phone: string | null | undefined): string | null => {
  const digits = (phone ?? '').replace(/\D/g, '')

  return digits.length >= MIN_PHONE_DIGITS ? digits : null
}

/**
 * Serialises concurrent writers that carry the same email or phone within one organization, so two
 * simultaneous submissions cannot both pass the duplicate check. Locks are held until the transaction ends
 * and are always taken in the same order (email, then phone), so they cannot deadlock.
 */
export const lockContactKeys = async (db: Db, orgId: string, email: string, phoneNorm: string | null): Promise<void> => {
  const keys = [`lead-email:${orgId}:${email}`, ...(phoneNorm ? [`lead-phone:${orgId}:${phoneNorm}`] : [])]

  for (const key of keys) {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`
  }
}

/** The oldest OPEN lead of the organization with the same email or the same normalised phone. */
export const findOpenDuplicate = (db: Db, orgId: string, email: string, phoneNorm: string | null): Promise<Lead | null> =>
  db.lead.findFirst({
    where: {
      orgId,
      status: { in: OPEN_STATUSES },
      OR: [{ email }, ...(phoneNorm ? [{ phoneNorm }] : [])]
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  })
