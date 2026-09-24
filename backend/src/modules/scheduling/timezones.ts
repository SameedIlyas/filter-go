import type { Db } from '../../lib/prisma.js'

export const orgTimezone = async (db: Db, orgId: string): Promise<string> => {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { timezone: true } })

  return org?.timezone ?? 'UTC'
}

/** Site timezone = `site.timezone ?? organization.timezone` (docs/ARCHITECTURE.md 2.4). */
export const siteTimezone = async (db: Db, orgId: string, siteId: string): Promise<string> => {
  const site = await db.site.findFirst({ where: { id: siteId, orgId }, select: { timezone: true } })

  return site?.timezone ?? (await orgTimezone(db, orgId))
}

/** "Mon, Mar 2, 6:00 PM - 2:00 AM" in the site's zone, for notification text. */
export const describeWindow = (start: Date, end: Date, zone: string): string => {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' }).format(start)
  const time = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' })

  return `${day}, ${time.format(start)} - ${time.format(end)}`
}
