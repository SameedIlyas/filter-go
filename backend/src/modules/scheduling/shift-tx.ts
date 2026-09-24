import type { AppContext } from '../../context.js'
import type { Prisma, Schedule, Shift } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { AppError, Errors } from '../../lib/errors.js'
import { lockScheduleShared, lockShift } from './locks.js'
import { assertShiftVisible } from './scope.js'

export interface LockedShift {
  shift: Shift
  schedule: Schedule
}

/**
 * Runs `work` in a transaction holding the shift's row lock (and a shared lock on its schedule), with the shift and
 * schedule re-read AFTER the locks were taken. Two requests acting on the same shift therefore run one after the
 * other and the second sees the first's result. A shift outside the actor's scope is a 404, unless the caller has
 * already authorised access another way (an offer addressed to the actor).
 */
export const withLockedShift = async <T>(
  ctx: AppContext,
  actor: Actor,
  shiftId: string,
  work: (tx: Prisma.TransactionClient, locked: LockedShift) => Promise<T>,
  options: { alreadyAuthorized?: boolean } = {}
): Promise<T> => {
  if (!options.alreadyAuthorized) await assertShiftVisible(ctx, actor, shiftId)

  return ctx.prisma.$transaction(async tx => {
    const ref = await tx.shift.findFirst({ where: { id: shiftId, orgId: actor.orgId }, select: { scheduleId: true } })

    if (!ref) throw Errors.notFound('shift')

    await lockScheduleShared(tx, ref.scheduleId)
    await lockShift(tx, shiftId)

    const [shift, schedule] = await Promise.all([
      tx.shift.findFirst({ where: { id: shiftId, orgId: actor.orgId } }),
      tx.schedule.findFirst({ where: { id: ref.scheduleId, orgId: actor.orgId } })
    ])

    if (!shift || !schedule) throw Errors.notFound('shift')

    return work(tx, { shift, schedule })
  })
}

/** LOCKED and CLOSED schedules accept no edits. */
export const assertScheduleEditable = (schedule: Pick<Schedule, 'status'>): void => {
  if (schedule.status === 'LOCKED' || schedule.status === 'CLOSED') {
    throw new AppError(409, 'SCHEDULE_LOCKED', 'This schedule is locked and can no longer be changed.')
  }
}

/** A shift that has left ASSIGNED/CONFIRMED (or was cancelled) is no longer Scheduling's to edit (5.6). */
export const notEditableError = (shift: Pick<Shift, 'status'>, action: string): AppError =>
  new AppError(409, 'INVALID_STATE', `This shift is ${shift.status.toLowerCase().replace('_', ' ')} and cannot be ${action}.`, {
    details: { entity: 'shift', from: shift.status, to: shift.status, allowed: [] }
  })
