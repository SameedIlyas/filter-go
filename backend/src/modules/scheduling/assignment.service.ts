import { randomUUID } from 'node:crypto'

import type { AppContext, ClientMeta } from '../../context.js'
import type { Prisma, Shift } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import type { Warning } from '../../lib/errors.js'
import { parseTermsSnapshot } from '../../lib/terms-snapshot.js'
import { recordAudit } from '../audit/record.js'
import { assignmentWarningsError, evaluateAssignment, throwIfBlocked } from './assignment.js'
import type { AssignmentCheck } from './assignment.js'
import { lockScheduleShared, lockUser } from './locks.js'
import { notifyShift } from './notices.js'
import { presentShift } from './presenters.js'
import type { AddShiftInput, AssignInput } from './schemas.js'
import { assertScheduleVisible, assertShiftVisible } from './scope.js'
import { assertScheduleEditable, withLockedShift } from './shift-tx.js'
import { shiftDefaults } from './shift-defaults.js'
import { validateWindow } from './shift-window.js'

/** The dry run behind the assignment board: nothing is saved and no lock is taken. */
export const validateAssignment = async (ctx: AppContext, actor: Actor, shiftId: string, userId: string): Promise<AssignmentCheck> => {
  await assertShiftVisible(ctx, actor, shiftId)

  const shift = await ctx.prisma.shift.findFirst({ where: { id: shiftId, orgId: actor.orgId }, include: { schedule: { select: { status: true } } } })

  if (!shift) throw Errors.notFound('shift')

  return evaluateAssignment(ctx.prisma, {
    orgId: actor.orgId,
    config: ctx.config,
    shift,
    scheduleStatus: shift.schedule.status,
    userId
  })
}

interface Override {
  overrideWarnings?: boolean
  reason?: string
}

/** Blocking problems always refuse; warnings refuse unless the caller explicitly overrides them. Returns the warnings that were overridden. */
const requireAcceptable = (check: AssignmentCheck, override: Override): Warning[] => {
  throwIfBlocked(check)

  if (check.warnings.length > 0 && override.overrideWarnings !== true) throw assignmentWarningsError(check.warnings)

  return check.warnings
}

/** Audit rows for an assignment: a normal `assigned`, or `assign_override` carrying the warnings and the reason. */
const auditAssignment = async (
  tx: Prisma.TransactionClient,
  actor: Actor,
  meta: ClientMeta,
  shift: Pick<Shift, 'id' | 'assignedUserId'>,
  userId: string,
  warnings: Warning[],
  reason: string | undefined
): Promise<void> => {
  const overridden = warnings.length > 0

  await recordAudit(tx, actor, {
    entity: 'shift',
    entityId: shift.id,
    action: overridden ? 'assign_override' : 'assigned',
    diff: overridden
      ? ({ warnings, reason: reason ?? null, userId } as unknown as Prisma.InputJsonValue)
      : { userId, previousUserId: shift.assignedUserId },
    meta
  })
}

/**
 * Assigns (or reassigns) a person to a shift. The shift and the person are both row-locked for the whole
 * check-and-write, so two supervisors can never both place the same person on overlapping shifts.
 */
export const assignShift = async (ctx: AppContext, actor: Actor, shiftId: string, input: AssignInput, meta: ClientMeta) => {
  await withLockedShift(ctx, actor, shiftId, async (tx, { shift, schedule }) => {
    await lockUser(tx, input.userId)

    if (shift.assignedUserId === input.userId && (shift.status === 'ASSIGNED' || shift.status === 'CONFIRMED')) return

    const check = await evaluateAssignment(tx, { orgId: actor.orgId, config: ctx.config, shift, scheduleStatus: schedule.status, userId: input.userId })
    const warnings = requireAcceptable(check, input)

    const updated = await tx.shift.update({ where: { id: shift.id }, data: { assignedUserId: input.userId, status: 'ASSIGNED' } })

    await tx.shiftOffer.updateMany({ where: { shiftId: shift.id, status: 'OFFERED' }, data: { status: 'WITHDRAWN' } })
    await auditAssignment(tx, actor, meta, shift, input.userId, warnings, input.reason)

    if (schedule.status === 'PUBLISHED') {
      if (shift.assignedUserId) {
        await notifyShift(ctx, tx, { orgId: actor.orgId, userIds: [shift.assignedUserId], type: 'shift.unassigned', title: 'Shift reassigned', body: 'You are no longer assigned to a shift.', shift: updated })
      }

      await notifyShift(ctx, tx, { orgId: actor.orgId, userIds: [input.userId], type: 'shift.assigned', title: 'New shift assigned', body: 'You have been assigned a shift.', shift: updated, email: true })
    }
  })

  return presentShift(ctx, actor, shiftId)
}

/** Locks the would-be assignee and runs the shared validation for a shift that does not exist yet. */
const checkNewAssignment = async (
  ctx: AppContext,
  tx: Prisma.TransactionClient,
  actor: Actor,
  args: { shiftId: string; siteId: string; scheduleStatus: 'DRAFT' | 'PUBLISHED' | 'LOCKED' | 'CLOSED'; input: AddShiftInput }
): Promise<Warning[]> => {
  const userId = args.input.assignedUserId ?? ''

  await lockUser(tx, userId)

  const check = await evaluateAssignment(tx, {
    orgId: actor.orgId,
    config: ctx.config,
    shift: { id: args.shiftId, siteId: args.siteId, scheduledStart: args.input.start, scheduledEnd: args.input.end, status: 'OPEN' },
    scheduleStatus: args.scheduleStatus,
    userId
  })

  return requireAcceptable(check, args.input)
}

/** Adds a shift to a schedule by hand (the only way AD_HOC coverage gets shifts). May be assigned in the same step. */
export const addShift = async (ctx: AppContext, actor: Actor, scheduleId: string, input: AddShiftInput, meta: ClientMeta) => {
  await assertScheduleVisible(ctx, actor, scheduleId)
  validateWindow(input.start, input.end)

  const shiftId = randomUUID()

  await ctx.prisma.$transaction(async tx => {
    await lockScheduleShared(tx, scheduleId)

    const schedule = await tx.schedule.findFirst({ where: { id: scheduleId, orgId: actor.orgId } })

    if (!schedule) throw Errors.notFound('schedule')

    assertScheduleEditable(schedule)

    const warnings = input.assignedUserId ? await checkNewAssignment(ctx, tx, actor, { shiftId, siteId: schedule.siteId, scheduleStatus: schedule.status, input }) : []
    const defaults = shiftDefaults(parseTermsSnapshot(schedule.termsSnapshot))

    const shift = await tx.shift.create({
      data: {
        id: shiftId,
        orgId: actor.orgId,
        scheduleId,
        siteId: schedule.siteId,
        assignedUserId: input.assignedUserId,
        scheduledStart: input.start,
        scheduledEnd: input.end,
        status: input.assignedUserId ? 'ASSIGNED' : 'OPEN',
        serviceRef: defaults.serviceRef,
        billableQty: input.billableQty === undefined ? defaults.billableQty : input.billableQty,
        notes: input.notes,
        isExtra: input.isExtra ?? false,
        createdById: actor.id
      }
    })

    await recordAudit(tx, actor, {
      entity: 'shift',
      entityId: shift.id,
      action: 'created',
      diff: { scheduleId, start: input.start.toISOString(), end: input.end.toISOString(), isExtra: shift.isExtra, assignedUserId: shift.assignedUserId },
      meta
    })

    if (input.assignedUserId) {
      await auditAssignment(tx, actor, meta, { id: shift.id, assignedUserId: null }, input.assignedUserId, warnings, input.reason)

      if (schedule.status === 'PUBLISHED') {
        await notifyShift(ctx, tx, { orgId: actor.orgId, userIds: [input.assignedUserId], type: 'shift.assigned', title: 'New shift assigned', body: 'You have been assigned a shift.', shift, email: true })
      }
    }
  })

  return presentShift(ctx, actor, shiftId)
}
