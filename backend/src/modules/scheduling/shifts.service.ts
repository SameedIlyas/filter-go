import type { AppContext, ClientMeta } from '../../context.js'
import type { Prisma, Shift } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { AppError } from '../../lib/errors.js'
import { money } from '../../lib/money.js'
import { recordAudit } from '../audit/record.js'
import { blockingError, overlapBlocker } from './assignment.js'
import { EDITABLE_SHIFT_STATUSES, assertShiftTransition } from './constants.js'
import { lockUser } from './locks.js'
import { notifyShift } from './notices.js'
import { presentShift } from './presenters.js'
import type { PatchShiftInput } from './schemas.js'
import { assertScheduleEditable, notEditableError, withLockedShift } from './shift-tx.js'
import { validateWindow } from './shift-window.js'

const sameInstant = (a: Date, b: Date): boolean => a.getTime() === b.getTime()

const changedFields = (shift: Shift, input: PatchShiftInput): Prisma.InputJsonValue => {
  const before: Record<string, string | null> = {}
  const after: Record<string, string | null> = {}

  const track = (field: string, from: string | null, to: string | null) => {
    if (from !== to) {
      before[field] = from
      after[field] = to
    }
  }

  if (input.start) track('start', shift.scheduledStart.toISOString(), input.start.toISOString())
  if (input.end) track('end', shift.scheduledEnd.toISOString(), input.end.toISOString())
  if (input.notes !== undefined) track('notes', shift.notes, input.notes)
  if (input.billableQty !== undefined) track('billableQty', money(shift.billableQty), money(input.billableQty))

  return { before, after }
}

/**
 * Edits times, notes or billable quantity. Once the shift has left ASSIGNED/CONFIRMED (5.6) or the schedule is locked
 * it refuses. Moving an assigned shift re-checks the assignee for overlap; a confirmed shift falls back to ASSIGNED
 * because the person confirmed the old time.
 */
export const updateShift = async (ctx: AppContext, actor: Actor, shiftId: string, input: PatchShiftInput, meta: ClientMeta) => {
  await withLockedShift(ctx, actor, shiftId, async (tx, { shift, schedule }) => {
    assertScheduleEditable(schedule)

    if (!EDITABLE_SHIFT_STATUSES.includes(shift.status)) throw notEditableError(shift, 'edited')

    const start = input.start ?? shift.scheduledStart
    const end = input.end ?? shift.scheduledEnd
    const timesChanged = !sameInstant(start, shift.scheduledStart) || !sameInstant(end, shift.scheduledEnd)

    validateWindow(start, end)

    if (timesChanged && shift.assignedUserId) {
      await lockUser(tx, shift.assignedUserId)

      const clash = await overlapBlocker(tx, { orgId: actor.orgId, config: ctx.config, shift: { ...shift, scheduledStart: start, scheduledEnd: end }, scheduleStatus: schedule.status, userId: shift.assignedUserId })

      if (clash) throw blockingError(clash)
    }

    const updated = await tx.shift.update({
      where: { id: shift.id },
      data: {
        scheduledStart: start,
        scheduledEnd: end,
        notes: input.notes === undefined ? undefined : input.notes,
        billableQty: input.billableQty === undefined ? undefined : input.billableQty,
        ...(timesChanged && shift.status === 'CONFIRMED' ? { status: 'ASSIGNED' as const } : {})
      }
    })

    await recordAudit(tx, actor, { entity: 'shift', entityId: shift.id, action: 'updated', diff: changedFields(shift, input), meta })

    if (timesChanged && shift.assignedUserId && schedule.status === 'PUBLISHED') {
      await notifyShift(ctx, tx, { orgId: actor.orgId, userIds: [shift.assignedUserId], type: 'shift.updated', title: 'Shift time changed', body: 'One of your shifts was rescheduled.', shift: updated })
    }
  })

  return presentShift(ctx, actor, shiftId)
}

/** ASSIGNED / CONFIRMED -> OPEN. The previous assignee is told when the schedule is already published. */
export const unassignShift = async (ctx: AppContext, actor: Actor, shiftId: string, meta: ClientMeta) => {
  await withLockedShift(ctx, actor, shiftId, async (tx, { shift, schedule }) => {
    assertScheduleEditable(schedule)
    assertShiftTransition(shift.status, 'OPEN')

    const updated = await tx.shift.update({ where: { id: shift.id }, data: { assignedUserId: null, status: 'OPEN' } })

    await recordAudit(tx, actor, { entity: 'shift', entityId: shift.id, action: 'unassigned', diff: { userId: shift.assignedUserId, fromStatus: shift.status }, meta })

    if (shift.assignedUserId && schedule.status === 'PUBLISHED') {
      await notifyShift(ctx, tx, { orgId: actor.orgId, userIds: [shift.assignedUserId], type: 'shift.unassigned', title: 'Shift removed', body: 'You have been taken off a shift.', shift: updated })
    }
  })

  return presentShift(ctx, actor, shiftId)
}

/**
 * OPEN / ASSIGNED / CONFIRMED -> CANCELLED. Allowed on a LOCKED schedule (only), so leftovers can be cleaned up and the
 * schedule closed; a CLOSED schedule accepts nothing.
 */
export const cancelShift = async (ctx: AppContext, actor: Actor, shiftId: string, reason: string, meta: ClientMeta) => {
  await withLockedShift(ctx, actor, shiftId, async (tx, { shift, schedule }) => {
    if (schedule.status === 'CLOSED') throw new AppError(409, 'SCHEDULE_LOCKED', 'This schedule is closed and can no longer be changed.')

    assertShiftTransition(shift.status, 'CANCELLED')

    const updated = await tx.shift.update({ where: { id: shift.id }, data: { status: 'CANCELLED', cancelledReason: reason } })

    await tx.shiftOffer.updateMany({ where: { shiftId: shift.id, status: 'OFFERED' }, data: { status: 'WITHDRAWN' } })
    await recordAudit(tx, actor, {
      entity: 'shift',
      entityId: shift.id,
      action: 'cancelled',
      diff: { reason, fromStatus: shift.status, userId: shift.assignedUserId },
      meta
    })

    if (shift.assignedUserId && schedule.status === 'PUBLISHED') {
      await notifyShift(ctx, tx, { orgId: actor.orgId, userIds: [shift.assignedUserId], type: 'shift.cancelled', title: 'Shift cancelled', body: 'One of your shifts was cancelled.', shift: updated })
    }
  })

  return presentShift(ctx, actor, shiftId)
}

/** The assigned field user confirms they will be there: ASSIGNED -> CONFIRMED. */
export const confirmShift = async (ctx: AppContext, actor: Actor, shiftId: string, meta: ClientMeta) => {
  await withLockedShift(ctx, actor, shiftId, async (tx, { shift, schedule }) => {
    assertScheduleEditable(schedule)
    assertShiftTransition(shift.status, 'CONFIRMED')

    await tx.shift.update({ where: { id: shift.id }, data: { status: 'CONFIRMED' } })
    await recordAudit(tx, actor, { entity: 'shift', entityId: shift.id, action: 'confirmed', diff: { userId: actor.id }, meta })
  })

  return presentShift(ctx, actor, shiftId)
}
