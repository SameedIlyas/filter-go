import type { AppContext } from '../../context.js'
import type { Prisma, Shift } from '../../generated/prisma/client.js'
import type { Db } from '../../lib/prisma.js'
import { notify } from '../notifications/notify.js'
import { describeWindow, orgTimezone } from './timezones.js'

type ShiftForNotice = Pick<Shift, 'id' | 'scheduleId' | 'siteId' | 'scheduledStart' | 'scheduledEnd'>

/** Active supervisors who manage the site, plus the schedule's own supervisor. */
export const supervisorIdsForSite = async (db: Db, orgId: string, siteId: string, scheduleSupervisorId: string | null): Promise<string[]> => {
  const rows = await db.user.findMany({
    where: { orgId, role: 'SUPERVISOR', status: 'ACTIVE', siteAccess: { some: { siteId } } },
    select: { id: true }
  })

  return [...new Set([...rows.map(row => row.id), ...(scheduleSupervisorId ? [scheduleSupervisorId] : [])])]
}

/** "Riverside Plant: Mon, Mar 2, 6:00 PM - 2:00 AM", in the site's own timezone. */
export const describeShift = async (db: Db, orgId: string, shift: ShiftForNotice): Promise<string> => {
  const site = await db.site.findFirst({ where: { id: shift.siteId, orgId }, select: { name: true, timezone: true } })
  const zone = site?.timezone ?? (await orgTimezone(db, orgId))

  return `${site?.name ?? 'Site'}: ${describeWindow(shift.scheduledStart, shift.scheduledEnd, zone)}`
}

export const shiftNoticeData = (shift: ShiftForNotice): Prisma.InputJsonValue => ({
  shiftId: shift.id,
  scheduleId: shift.scheduleId,
  siteId: shift.siteId,
  scheduledStart: shift.scheduledStart.toISOString(),
  scheduledEnd: shift.scheduledEnd.toISOString()
})

export interface ShiftNotice {
  orgId: string
  userIds: string[]
  type: 'shift.assigned' | 'shift.unassigned' | 'shift.cancelled' | 'shift.updated' | 'shift.offered' | 'shift.extra_added' | 'shift.offer_accepted'
  title: string
  /** Sentence that follows the shift description. */
  body: string
  shift: ShiftForNotice
  email?: boolean
}

/** One shift-related notification, inside the caller's transaction. Text always names the site and local time. */
export const notifyShift = async (ctx: AppContext, db: Db, notice: ShiftNotice): Promise<void> => {
  const where = await describeShift(db, notice.orgId, notice.shift)

  await notify(
    ctx,
    {
      orgId: notice.orgId,
      userIds: notice.userIds,
      type: notice.type,
      title: notice.title,
      body: `${notice.body} ${where}.`,
      data: shiftNoticeData(notice.shift),
      email: notice.email
    },
    db
  )
}
