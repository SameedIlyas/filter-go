import type { AppContext, ClientMeta } from '../../context.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import { recordAudit } from '../audit/record.js'
import { entryInclude, lockScopedEntry, reviveNoShowShift } from './entries.js'
import type { EntryRow } from './entries.js'
import { syncExceptions } from './exceptions.js'
import type { CorrectBody } from './schemas.js'
import { assertResubmittable, assertTransition } from './state.js'
import { describeTimes, resolveTimes } from './time-rules.js'

/**
 * The worker fixes a REJECTED entry: REJECTED -> CORRECTED. Times must stay within 12 hours of the scheduled shift.
 * The optional note is kept in the audit trail (the entry has no note column).
 */
export const correctEntry = async (ctx: AppContext, actor: Actor, entryId: string, input: CorrectBody, meta?: ClientMeta): Promise<EntryRow> =>
  ctx.prisma.$transaction(async tx => {
    const entry = await lockScopedEntry(tx, { orgId: actor.orgId, userId: actor.id }, entryId)

    assertTransition(entry.status, 'CORRECTED')

    const before = { clockInAt: entry.clockInAt, clockOutAt: entry.clockOutAt, breakMinutes: entry.breakMinutes, actualMinutes: entry.actualMinutes }
    const after = resolveTimes(before, { clockInAt: input.clockInAt, clockOutAt: input.clockOutAt, breakMinutes: input.breakMinutes }, entry.shift)

    const updated = await tx.timesheetEntry.updateMany({
      where: { id: entry.id, status: 'REJECTED' },
      data: { ...after, status: 'CORRECTED' }
    })

    if (updated.count !== 1) throw Errors.conflict('The timesheet changed while it was being corrected. Reload and try again.')

    const shiftRevived = await reviveNoShowShift(tx, entry, after.clockInAt !== null)

    await syncExceptions(ctx, tx, entry.id)
    await recordAudit(tx, actor, {
      entity: 'timesheet',
      entityId: entry.id,
      action: 'corrected',
      diff: { before: describeTimes(before), after: describeTimes(after), note: input.note ?? null, shiftRevived },
      meta
    })

    return tx.timesheetEntry.findUniqueOrThrow({ where: { id: entry.id }, include: entryInclude })
  })

/** The worker hands a corrected entry back: CORRECTED -> SUBMITTED, exceptions recomputed. */
export const resubmitEntry = async (ctx: AppContext, actor: Actor, entryId: string, meta?: ClientMeta): Promise<EntryRow> =>
  ctx.prisma.$transaction(async tx => {
    const entry = await lockScopedEntry(tx, { orgId: actor.orgId, userId: actor.id }, entryId)

    assertResubmittable(entry.status)

    // The rejection is history now (the audit trail keeps it); the reviewer judges the corrected numbers afresh
    await tx.timesheetEntry.updateMany({ where: { id: entry.id, status: 'CORRECTED' }, data: { status: 'SUBMITTED', rejectionReason: null } })
    await syncExceptions(ctx, tx, entry.id)
    await recordAudit(tx, actor, {
      entity: 'timesheet',
      entityId: entry.id,
      action: 'resubmitted',
      diff: { previousRejectionReason: entry.rejectionReason },
      meta
    })

    return tx.timesheetEntry.findUniqueOrThrow({ where: { id: entry.id }, include: entryInclude })
  })
