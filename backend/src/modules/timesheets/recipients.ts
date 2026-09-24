import type { Db } from '../../lib/prisma.js'

/** Active supervisors managing a site (users with site access whose role is SUPERVISOR). Nobody else. */
export const siteSupervisorIds = async (db: Db, orgId: string, siteId: string): Promise<string[]> => {
  const users = await db.user.findMany({
    where: { orgId, role: 'SUPERVISOR', status: 'ACTIVE', siteAccess: { some: { siteId } } },
    select: { id: true }
  })

  return users.map(user => user.id)
}

/** Who hears about problems at a site: its supervisors, or the organization's admins when it has none. */
export const siteAlertRecipients = async (db: Db, orgId: string, siteId: string): Promise<string[]> => {
  const supervisors = await siteSupervisorIds(db, orgId, siteId)

  if (supervisors.length > 0) return supervisors

  const admins = await db.user.findMany({ where: { orgId, role: 'ADMIN', status: 'ACTIVE' }, select: { id: true } })

  return admins.map(user => user.id)
}
