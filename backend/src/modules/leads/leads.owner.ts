import type { Db } from '../../lib/prisma.js'
import type { OwnerRef } from './leads.serializers.js'

/** Who may own a lead: an ACTIVE admin or supervisor of the organization. */
export const isEligibleOwner = async (db: Db, orgId: string, userId: string): Promise<boolean> => {
  const user = await db.user.findFirst({
    where: { id: userId, orgId, status: 'ACTIVE', role: { in: ['ADMIN', 'SUPERVISOR'] } },
    select: { id: true }
  })

  return user !== null
}

/**
 * Owner of a new website lead: the organization's default owner when that user is still an active
 * admin/supervisor, otherwise the oldest active admin. Null when the organization has neither.
 */
export const resolveDefaultOwnerId = async (db: Db, orgId: string, defaultLeadOwnerId: string | null): Promise<string | null> => {
  if (defaultLeadOwnerId && (await isEligibleOwner(db, orgId, defaultLeadOwnerId))) return defaultLeadOwnerId

  const admin = await db.user.findFirst({
    where: { orgId, status: 'ACTIVE', role: 'ADMIN' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true }
  })

  return admin?.id ?? null
}

/** id -> { id, name } for the given owners, so leads can show who owns them without a relation. */
export const loadOwnerMap = async (db: Db, orgId: string, ownerIds: Array<string | null>): Promise<Map<string, OwnerRef>> => {
  const ids = [...new Set(ownerIds.filter((id): id is string => id !== null))]
  const users = ids.length > 0 ? await db.user.findMany({ where: { id: { in: ids }, orgId }, select: { id: true, name: true } }) : []

  return new Map(users.map(user => [user.id, user]))
}
