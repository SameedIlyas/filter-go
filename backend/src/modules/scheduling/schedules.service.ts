import type { AppContext, ClientMeta } from '../../context.js'
import type { Prisma, Schedule, ScheduleStatus } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { AppError, Errors } from '../../lib/errors.js'
import { pageArgs, pageMeta } from '../../lib/pagination.js'
import { toDateOnly } from '../../lib/time.js'
import { recordAudit } from '../audit/record.js'
import { notify } from '../notifications/notify.js'
import { SCHEDULE_TRANSITIONS, TERMINAL_SHIFT_STATUSES, assertScheduleTransition } from './constants.js'
import { lockScheduleForUpdate } from './locks.js'
import { presentSchedule, presentSchedules } from './presenters.js'
import type { ScheduleListQuery } from './schemas.js'
import { assertScheduleVisible, scheduleScope } from './scope.js'
import { SCHEDULE_INCLUDE } from './serializers.js'

export const listSchedules = async (ctx: AppContext, actor: Actor, query: ScheduleListQuery) => {
  const filter: Prisma.ScheduleWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.contractId ? { contractId: query.contractId } : {}),
    ...(query.siteId ? { siteId: query.siteId } : {}),
    // period overlap: the schedule ends on/after `from` and starts on/before `to`
    ...(query.from ? { periodEnd: { gte: toDateOnly(query.from) } } : {}),
    ...(query.to ? { periodStart: { lte: toDateOnly(query.to) } } : {})
  }

  const where: Prisma.ScheduleWhereInput = { AND: [await scheduleScope(ctx, actor), filter] }

  const [rows, total] = await Promise.all([
    ctx.prisma.schedule.findMany({ where, include: SCHEDULE_INCLUDE, orderBy: [{ periodStart: 'desc' }, { id: 'asc' }], ...pageArgs(query) }),
    ctx.prisma.schedule.count({ where })
  ])

  return { items: await presentSchedules(ctx, actor, rows, false), meta: pageMeta(query, total) }
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

interface Transition {
  to: ScheduleStatus
  action: string
  /** Extra columns to set together with the status. */
  data: () => Prisma.ScheduleUpdateManyMutationInput
  /** Extra preconditions, evaluated under the schedule lock. */
  guard?: (tx: Prisma.TransactionClient, schedule: Schedule) => Promise<void>
  /** Side effects that must commit or roll back together with the transition. */
  after?: (ctx: AppContext, tx: Prisma.TransactionClient, schedule: Schedule, actor: Actor) => Promise<Prisma.InputJsonValue | undefined>
}

const guardUnpublish = async (tx: Prisma.TransactionClient, schedule: Schedule): Promise<void> => {
  const withTimesheets = await tx.shift.count({ where: { scheduleId: schedule.id, timesheet: { isNot: null } } })

  if (withTimesheets > 0) {
    throw new AppError(409, 'INVALID_STATE', 'This schedule cannot be unpublished: work has already been recorded against its shifts.', {
      details: { entity: 'schedule', from: schedule.status, to: 'DRAFT', allowed: ['LOCKED'], context: { shiftsWithTimesheets: withTimesheets } }
    })
  }
}

const guardClose = async (tx: Prisma.TransactionClient, schedule: Schedule): Promise<void> => {
  const unfinished = await tx.shift.count({ where: { scheduleId: schedule.id, status: { notIn: TERMINAL_SHIFT_STATUSES } } })

  if (unfinished > 0) {
    throw Errors.unprocessable('Every shift must be completed, a no-show or cancelled before the schedule can be closed.', { unfinishedShifts: unfinished })
  }
}

/** One notification per person who holds a shift on the schedule (not one per shift). */
const notifyPublished = async (ctx: AppContext, tx: Prisma.TransactionClient, schedule: Schedule, actor: Actor): Promise<Prisma.InputJsonValue> => {
  const rows = await tx.shift.findMany({
    where: { scheduleId: schedule.id, status: { in: ['ASSIGNED', 'CONFIRMED'] }, assignedUserId: { not: null } },
    select: { assignedUserId: true }
  })

  const userIds = [...new Set(rows.flatMap(row => (row.assignedUserId ? [row.assignedUserId] : [])))]
  const site = await tx.site.findFirst({ where: { id: schedule.siteId, orgId: actor.orgId }, select: { name: true } })
  const period = `${schedule.periodStart.toISOString().slice(0, 10)} to ${schedule.periodEnd.toISOString().slice(0, 10)}`

  await notify(
    ctx,
    {
      orgId: actor.orgId,
      userIds,
      type: 'schedule.published',
      title: 'Schedule published',
      body: `Your shifts at ${site?.name ?? 'your site'} for ${period} are now published.`,
      data: { scheduleId: schedule.id, siteId: schedule.siteId }
    },
    tx
  )

  return { notified: userIds.length, shifts: rows.length }
}

const TRANSITIONS = {
  publish: { to: 'PUBLISHED', action: 'published', data: () => ({ publishedAt: new Date() }), after: notifyPublished },
  unpublish: { to: 'DRAFT', action: 'unpublished', data: () => ({ publishedAt: null }), guard: guardUnpublish },
  lock: { to: 'LOCKED', action: 'locked', data: () => ({ lockedAt: new Date() }) },
  close: { to: 'CLOSED', action: 'closed', data: () => ({ closedAt: new Date() }), guard: guardClose }
} satisfies Record<string, Transition>

export type TransitionName = keyof typeof TRANSITIONS

/**
 * Moves a schedule along the state machine. The row is locked FOR UPDATE, so a double-clicked publish (or a publish
 * racing an unpublish) runs strictly one after the other and the loser gets INVALID_STATE. The status change, its
 * audit row and its notifications are one transaction.
 */
export const transitionSchedule = async (ctx: AppContext, actor: Actor, id: string, name: TransitionName, meta: ClientMeta) => {
  const transition: Transition = TRANSITIONS[name]

  await assertScheduleVisible(ctx, actor, id)

  await ctx.prisma.$transaction(async tx => {
    await lockScheduleForUpdate(tx, id)

    const schedule = await tx.schedule.findFirst({ where: { id, orgId: actor.orgId } })

    if (!schedule) throw Errors.notFound('schedule')

    assertScheduleTransition(schedule.status, transition.to)
    await transition.guard?.(tx, schedule)

    const moved = await tx.schedule.updateMany({ where: { id, orgId: actor.orgId, status: schedule.status }, data: { status: transition.to, ...transition.data() } })

    if (moved.count !== 1) throw Errors.invalidState('schedule', schedule.status, transition.to, SCHEDULE_TRANSITIONS[schedule.status])

    const outcome = await transition.after?.(ctx, tx, schedule, actor)

    await recordAudit(tx, actor, {
      entity: 'schedule',
      entityId: id,
      action: transition.action,
      diff: { from: schedule.status, to: transition.to, ...(outcome as Record<string, unknown> | undefined) } as Prisma.InputJsonValue,
      meta
    })
  })

  return presentSchedule(ctx, actor, id)
}

/** Only a DRAFT schedule can be deleted; its shifts (and their offers) go with it. */
export const deleteSchedule = async (ctx: AppContext, actor: Actor, id: string, meta: ClientMeta): Promise<void> => {
  await assertScheduleVisible(ctx, actor, id)

  await ctx.prisma.$transaction(async tx => {
    await lockScheduleForUpdate(tx, id)

    const schedule = await tx.schedule.findFirst({ where: { id, orgId: actor.orgId } })

    if (!schedule) throw Errors.notFound('schedule')

    if (schedule.status !== 'DRAFT') {
      throw new AppError(409, 'INVALID_STATE', 'Only a draft schedule can be deleted.', {
        details: { entity: 'schedule', from: schedule.status, to: 'DELETED', allowed: [] }
      })
    }

    const shiftCount = await tx.shift.count({ where: { scheduleId: id } })

    await tx.schedule.delete({ where: { id } })
    await recordAudit(tx, actor, { entity: 'schedule', entityId: id, action: 'deleted', diff: { shiftCount, contractId: schedule.contractId, siteId: schedule.siteId }, meta })
  })
}
