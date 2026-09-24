import type { AppContext, ClientMeta } from '../../context.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import { recordAudit } from '../audit/record.js'
import { entryInclude, lockScopedEntry, readScope, reviveNoShowShift } from './entries.js'
import type { EntryRow } from './entries.js'
import { syncExceptions } from './exceptions.js'
import type { AdjustBody } from './schemas.js'
import { assertTransition } from './state.js'
import { describeTimes, resolveTimes, timesEqual } from './time-rules.js'

/**
 * A supervisor edits times / break / the billable and payable flags: SUBMITTED or ADJUSTED -> ADJUSTED.
 * Minutes and exceptions are recomputed; the audit row stores before and after plus the reason.
 * A request that changes nothing is refused so "adjusted" always means something changed.
 */
export const adjustEntry = async (ctx: AppContext, actor: Actor, entryId: string, input: AdjustBody, meta?: ClientMeta): Promise<EntryRow> =>
  ctx.prisma.$transaction(async tx => {
    const entry = await lockScopedEntry(tx, await readScope(ctx, actor), entryId)

    assertTransition(entry.status, 'ADJUSTED')

    const beforeTimes = { clockInAt: entry.clockInAt, clockOutAt: entry.clockOutAt, breakMinutes: entry.breakMinutes, actualMinutes: entry.actualMinutes }
    const afterTimes = resolveTimes(beforeTimes, { clockInAt: input.clockInAt, clockOutAt: input.clockOutAt, breakMinutes: input.breakMinutes }, entry.shift)
    const billable = input.billable ?? entry.billable
    const payable = input.payable ?? entry.payable

    if (timesEqual(beforeTimes, afterTimes) && billable === entry.billable && payable === entry.payable) {
      throw Errors.unprocessable('Nothing would change: the values match the current timesheet.')
    }

    const updated = await tx.timesheetEntry.updateMany({
      where: { id: entry.id, status: entry.status },
      data: { ...afterTimes, billable, payable, status: 'ADJUSTED', adjustmentReason: input.reason }
    })

    if (updated.count !== 1) throw Errors.conflict('The timesheet changed while it was being adjusted. Reload and try again.')

    const shiftRevived = await reviveNoShowShift(tx, entry, afterTimes.clockInAt !== null)

    await syncExceptions(ctx, tx, entry.id)
    await recordAudit(tx, actor, {
      entity: 'timesheet',
      entityId: entry.id,
      action: 'adjusted',
      diff: {
        reason: input.reason,
        before: { ...describeTimes(beforeTimes), billable: entry.billable, payable: entry.payable, status: entry.status },
        after: { ...describeTimes(afterTimes), billable, payable, status: 'ADJUSTED' },
        shiftRevived
      },
      meta
    })

    return tx.timesheetEntry.findUniqueOrThrow({ where: { id: entry.id }, include: entryInclude })
  })
