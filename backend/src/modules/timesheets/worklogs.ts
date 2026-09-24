import type { AppContext, ClientMeta } from '../../context.js'
import type { Prisma } from '../../generated/prisma/client.js'
import { siteIdFilter } from '../../lib/access.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import { assertFilesInOrg } from '../../lib/file-refs.js'
import { pageArgs, pageMeta } from '../../lib/pagination.js'
import { recordAudit } from '../audit/record.js'
import { notify } from '../notifications/notify.js'
import { loadUserNames } from './entries.js'
import { siteSupervisorIds } from './recipients.js'
import type { WorkLogBody } from './schemas.js'
import { CLIENT_LOG_KINDS, serializeWorkLog } from './serializers.js'

const LATE_LOG_WINDOW_MS = 24 * 60 * 60 * 1000
const ISSUE_PREVIEW_CHARS = 300

/**
 * Which shifts this actor may see work logs for: staff at their sites, the assigned worker, the client at their
 * sites. Nothing is visible before the schedule is published.
 */
const shiftScope = async (ctx: AppContext, actor: Actor): Promise<Prisma.ShiftWhereInput> => {
  if (actor.role === 'FIELD_USER') return { orgId: actor.orgId, assignedUserId: actor.id, schedule: { status: { not: 'DRAFT' } } }

  const siteId = await siteIdFilter(ctx, actor)
  const base: Prisma.ShiftWhereInput = { orgId: actor.orgId, ...(siteId ? { siteId } : {}) }

  return actor.role === 'CLIENT_USER' ? { ...base, schedule: { status: { not: 'DRAFT' } } } : base
}

/** Workers may log while the shift is in progress, or up to 24 hours after it finished. Supervisors: any time. */
const assertWorkerMayLog = (shift: { status: string; scheduledEnd: Date; timesheet: { clockOutAt: Date | null } | null }, now: Date): void => {
  if (shift.status === 'IN_PROGRESS') return

  const finishedAt = shift.timesheet?.clockOutAt ?? shift.scheduledEnd

  if (shift.status === 'COMPLETED' && now.getTime() - finishedAt.getTime() <= LATE_LOG_WINDOW_MS) return

  throw Errors.conflict('Work logs can only be added while the shift is in progress or within 24 hours after it was completed.', { shiftStatus: shift.status })
}

export const createWorkLog = async (ctx: AppContext, actor: Actor, shiftId: string, input: WorkLogBody, meta?: ClientMeta, now: Date = new Date()) =>
  ctx.prisma.$transaction(async tx => {
    const shift = await tx.shift.findFirst({
      where: { AND: [{ id: shiftId }, await shiftScope(ctx, actor)] },
      include: { site: { select: { name: true } }, timesheet: { select: { clockOutAt: true } } }
    })

    if (!shift) throw Errors.notFound('shift')

    if (actor.role === 'FIELD_USER') assertWorkerMayLog(shift, now)

    if (input.kind === 'PHOTO') await assertFilesInOrg(tx, actor.orgId, [input.fileId], 'fileId')

    const log = await tx.workLog.create({
      data: {
        orgId: actor.orgId,
        shiftId: shift.id,
        userId: actor.id,
        kind: input.kind,
        fileId: input.kind === 'PHOTO' ? input.fileId : null,
        body: input.kind === 'CHECKLIST' ? null : (input.body ?? null),
        data: input.kind === 'CHECKLIST' ? input.data : undefined,
        at: now
      }
    })

    await recordAudit(tx, actor, { entity: 'work_log', entityId: log.id, action: 'created', diff: { shiftId: shift.id, kind: log.kind }, meta })

    if (input.kind === 'ISSUE') {
      const supervisors = (await siteSupervisorIds(tx, actor.orgId, shift.siteId)).filter(id => id !== actor.id)

      await notify(
        ctx,
        {
          orgId: actor.orgId,
          userIds: supervisors,
          type: 'work_log.issue',
          title: `Issue reported at ${shift.site.name}`,
          body: input.body.slice(0, ISSUE_PREVIEW_CHARS),
          data: { workLogId: log.id, shiftId: shift.id, siteId: shift.siteId }
        },
        tx
      )
    }

    return serializeWorkLog(log, actor, await loadUserNames(tx, actor.orgId, [actor.id]))
  })

export const listWorkLogs = async (ctx: AppContext, actor: Actor, shiftId: string, query: { page: number; limit: number }) => {
  const shift = await ctx.prisma.shift.findFirst({ where: { AND: [{ id: shiftId }, await shiftScope(ctx, actor)] }, select: { id: true } })

  if (!shift) throw Errors.notFound('shift')

  const where: Prisma.WorkLogWhereInput = {
    orgId: actor.orgId,
    shiftId: shift.id,
    ...(actor.role === 'CLIENT_USER' ? { kind: { in: CLIENT_LOG_KINDS } } : {})
  }

  const [total, rows] = await Promise.all([
    ctx.prisma.workLog.count({ where }),
    ctx.prisma.workLog.findMany({ where, orderBy: [{ at: 'asc' }, { id: 'asc' }], ...pageArgs(query) })
  ])

  const users = actor.role === 'CLIENT_USER' ? new Map() : await loadUserNames(ctx.prisma, actor.orgId, rows.map(row => row.userId))

  return { items: rows.map(row => serializeWorkLog(row, actor, users)), meta: pageMeta(query, total) }
}
