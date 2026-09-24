import { randomUUID } from 'node:crypto'

import type { AppContext, ClientMeta } from '../../context.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import { parseTermsSnapshot } from '../../lib/terms-snapshot.js'
import { fromDateOnly, localDate } from '../../lib/time.js'
import { recordAudit } from '../audit/record.js'
import { blockingError, overlapBlocker } from './assignment.js'
import { OUTSIDER_VISIBLE_STATUSES } from './constants.js'
import { lockScheduleShared, lockUser } from './locks.js'
import { notifyShift, supervisorIdsForSite } from './notices.js'
import { presentShift } from './presenters.js'
import type { ExtraShiftInput } from './schemas.js'
import { shiftDefaults } from './shift-defaults.js'
import { assertScheduleEditable } from './shift-tx.js'
import { validateWindow } from './shift-window.js'
import { siteTimezone } from './timezones.js'

/**
 * Unplanned work reported by a field user: a shift on a PUBLISHED schedule at a site they may work at, assigned to
 * them, flagged `isExtra` so a supervisor reviews it. It may not overlap their other shifts. A draft schedule, or a
 * site they have no access to, is a 404 like any other thing they are not allowed to know about.
 */
export const addExtraShift = async (ctx: AppContext, actor: Actor, input: ExtraShiftInput, meta: ClientMeta) => {
  validateWindow(input.start, input.end)

  const shiftId = randomUUID()

  await ctx.prisma.$transaction(async tx => {
    await lockScheduleShared(tx, input.scheduleId)

    const schedule = await tx.schedule.findFirst({
      where: {
        id: input.scheduleId,
        orgId: actor.orgId,
        status: { in: OUTSIDER_VISIBLE_STATUSES },
        site: { accessRows: { some: { userId: actor.id } } }
      }
    })

    if (!schedule) throw Errors.notFound('schedule')

    assertScheduleEditable(schedule)

    const zone = await siteTimezone(tx, actor.orgId, schedule.siteId)
    const day = localDate(input.start, zone)

    if (day < fromDateOnly(schedule.periodStart) || day > fromDateOnly(schedule.periodEnd)) {
      throw Errors.unprocessable('An extra shift must start within the schedule period.', {
        periodStart: fromDateOnly(schedule.periodStart),
        periodEnd: fromDateOnly(schedule.periodEnd)
      })
    }

    await lockUser(tx, actor.id)

    const clash = await overlapBlocker(tx, {
      orgId: actor.orgId,
      config: ctx.config,
      shift: { id: shiftId, siteId: schedule.siteId, scheduledStart: input.start, scheduledEnd: input.end, status: 'OPEN' },
      scheduleStatus: schedule.status,
      userId: actor.id
    })

    if (clash) throw blockingError(clash)

    const defaults = shiftDefaults(parseTermsSnapshot(schedule.termsSnapshot))

    const shift = await tx.shift.create({
      data: {
        id: shiftId,
        orgId: actor.orgId,
        scheduleId: schedule.id,
        siteId: schedule.siteId,
        assignedUserId: actor.id,
        scheduledStart: input.start,
        scheduledEnd: input.end,
        status: 'ASSIGNED',
        serviceRef: defaults.serviceRef,
        billableQty: defaults.billableQty,
        notes: input.notes,
        isExtra: true,
        createdById: actor.id
      }
    })

    await recordAudit(tx, actor, {
      entity: 'shift',
      entityId: shift.id,
      action: 'extra_added',
      diff: { scheduleId: schedule.id, start: input.start.toISOString(), end: input.end.toISOString() },
      meta
    })

    const supervisors = await supervisorIdsForSite(tx, actor.orgId, schedule.siteId, schedule.supervisorId)

    await notifyShift(ctx, tx, {
      orgId: actor.orgId,
      userIds: supervisors,
      type: 'shift.extra_added',
      title: 'Extra shift added',
      body: 'A field user added an unplanned shift for review.',
      shift
    })
  })

  return presentShift(ctx, actor, shiftId)
}
