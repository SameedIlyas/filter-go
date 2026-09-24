import type { AppContext, ClientMeta } from '../../context.js'
import type { Prisma } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { AppError, Errors } from '../../lib/errors.js'
import { pageArgs, pageMeta } from '../../lib/pagination.js'
import type { PageQuery } from '../../lib/pagination.js'
import { recordAudit } from '../audit/record.js'
import { evaluateAssignment, throwIfBlocked } from './assignment.js'
import { OUTSIDER_VISIBLE_STATUSES } from './constants.js'
import { lockScheduleShared, lockShift, lockUser } from './locks.js'
import { notifyShift, supervisorIdsForSite } from './notices.js'
import { presentShifts } from './presenters.js'
import { SHIFT_INCLUDE, serializeOffer, serializeOfferWithShift } from './serializers.js'
import { assertScheduleEditable, withLockedShift } from './shift-tx.js'

/** Offer an OPEN shift to several field users; the first to accept gets it. Re-offering someone who declined re-opens their offer. */
export const createOffers = async (ctx: AppContext, actor: Actor, shiftId: string, userIds: string[], meta: ClientMeta) => {
  const offers = await withLockedShift(ctx, actor, shiftId, async (tx, { shift, schedule }) => {
    assertScheduleEditable(schedule)

    if (schedule.status !== 'PUBLISHED') throw Errors.invalidState('schedule', schedule.status, 'PUBLISHED', ['PUBLISHED'])

    if (shift.status !== 'OPEN') {
      throw new AppError(409, 'INVALID_STATE', 'Only open shifts can be offered.', { details: { entity: 'shift', from: shift.status, to: 'OPEN', allowed: [] } })
    }

    const eligible = await tx.user.findMany({ where: { id: { in: userIds }, orgId: actor.orgId, role: 'FIELD_USER', status: 'ACTIVE' }, select: { id: true } })
    const eligibleIds = new Set(eligible.map(user => user.id))
    const invalid = userIds.filter(id => !eligibleIds.has(id))

    if (invalid.length > 0) throw Errors.unprocessable('Shifts can only be offered to active field users of this organization.', { userIds: invalid })

    const pending = await tx.shiftOffer.findMany({ where: { shiftId, userId: { in: userIds }, status: 'OFFERED' }, select: { userId: true } })
    const pendingIds = new Set(pending.map(offer => offer.userId))
    const fresh = userIds.filter(id => !pendingIds.has(id))

    for (const userId of fresh) {
      await tx.shiftOffer.upsert({
        where: { shiftId_userId: { shiftId, userId } },
        create: { shiftId, userId },
        update: { status: 'OFFERED', at: new Date() }
      })
    }

    await recordAudit(tx, actor, { entity: 'shift', entityId: shiftId, action: 'offered', diff: { userIds: fresh }, meta })
    await notifyShift(ctx, tx, { orgId: actor.orgId, userIds: fresh, type: 'shift.offered', title: 'Shift offer', body: 'A shift is open and you are invited to take it.', shift })

    return tx.shiftOffer.findMany({ where: { shiftId, userId: { in: userIds } }, orderBy: [{ at: 'asc' }, { id: 'asc' }] })
  })

  return offers.map(serializeOffer)
}

/** The caller's open offers with their shifts. Offers on unpublished schedules or already-filled shifts are not shown. */
export const listMyOffers = async (ctx: AppContext, actor: Actor, query: PageQuery) => {
  const where: Prisma.ShiftOfferWhereInput = {
    userId: actor.id,
    status: 'OFFERED',
    shift: { orgId: actor.orgId, status: 'OPEN', schedule: { status: 'PUBLISHED' } }
  }

  const [rows, total] = await Promise.all([
    ctx.prisma.shiftOffer.findMany({ where, include: { shift: { include: SHIFT_INCLUDE } }, orderBy: [{ at: 'desc' }, { id: 'asc' }], ...pageArgs(query) }),
    ctx.prisma.shiftOffer.count({ where })
  ])

  const shifts = await presentShifts(
    ctx,
    actor,
    rows.map(row => row.shift)
  )

  return {
    items: rows.flatMap((row, index) => {
      const shift = shifts[index]

      return shift ? [serializeOfferWithShift(row, shift)] : []
    }),
    meta: pageMeta(query, total)
  }
}

/** The offer must be the caller's, on a shift of a schedule they can see; anything else is a 404. */
const findOwnOffer = async (ctx: AppContext, actor: Actor, offerId: string) => {
  const offer = await ctx.prisma.shiftOffer.findFirst({
    where: { id: offerId, userId: actor.id, shift: { orgId: actor.orgId, schedule: { status: { in: OUTSIDER_VISIBLE_STATUSES } } } },
    include: { shift: { select: { id: true, scheduleId: true } } }
  })

  if (!offer) throw Errors.notFound('offer')

  return offer
}

const offerClosed = (status: string, to: string): AppError => Errors.invalidState('offer', status, to, [])

/**
 * Self-accept. Runs the same validation as a supervisor assignment: blocking rules refuse, warnings do not stop a
 * self-accept but are written to the audit trail. The shift row lock makes the first accept win; everyone else's
 * offer becomes WITHDRAWN and their later attempt finds it that way.
 */
export const acceptOffer = async (ctx: AppContext, actor: Actor, offerId: string, meta: ClientMeta) => {
  const offer = await findOwnOffer(ctx, actor, offerId)

  await withLockedShift(
    ctx,
    actor,
    offer.shift.id,
    async (tx, { shift, schedule }) => {
    await lockUser(tx, actor.id)

    const current = await tx.shiftOffer.findFirst({ where: { id: offerId, userId: actor.id } })

    if (!current) throw Errors.notFound('offer')
    if (current.status !== 'OFFERED') throw offerClosed(current.status, 'ACCEPTED')

    assertScheduleEditable(schedule)

    const check = await evaluateAssignment(tx, { orgId: actor.orgId, config: ctx.config, shift, scheduleStatus: schedule.status, userId: actor.id })

    throwIfBlocked(check)

    const claimed = await tx.shift.updateMany({ where: { id: shift.id, status: 'OPEN', assignedUserId: null }, data: { assignedUserId: actor.id, status: 'ASSIGNED' } })

    if (claimed.count !== 1) throw offerClosed(current.status, 'ACCEPTED')

    await tx.shiftOffer.update({ where: { id: offerId }, data: { status: 'ACCEPTED' } })
    await tx.shiftOffer.updateMany({ where: { shiftId: shift.id, status: 'OFFERED', id: { not: offerId } }, data: { status: 'WITHDRAWN' } })

    await recordAudit(tx, actor, {
      entity: 'shift',
      entityId: shift.id,
      action: 'assigned',
      diff: { userId: actor.id, previousUserId: null, viaOffer: offerId, warnings: check.warnings } as unknown as Prisma.InputJsonValue,
      meta
    })

    const supervisors = await supervisorIdsForSite(tx, actor.orgId, shift.siteId, schedule.supervisorId)

    await notifyShift(ctx, tx, { orgId: actor.orgId, userIds: supervisors, type: 'shift.offer_accepted', title: 'Shift offer accepted', body: 'An offered shift was accepted.', shift })
  }, { alreadyAuthorized: true })

  return { shiftId: offer.shift.id, offer: serializeOffer(await ctx.prisma.shiftOffer.findUniqueOrThrow({ where: { id: offerId } })) }
}

export const declineOffer = async (ctx: AppContext, actor: Actor, offerId: string, meta: ClientMeta) => {
  const offer = await findOwnOffer(ctx, actor, offerId)

  await ctx.prisma.$transaction(async tx => {
    await lockScheduleShared(tx, offer.shift.scheduleId)
    await lockShift(tx, offer.shift.id)

    const declined = await tx.shiftOffer.updateMany({ where: { id: offerId, userId: actor.id, status: 'OFFERED' }, data: { status: 'DECLINED' } })

    if (declined.count !== 1) {
      const current = await tx.shiftOffer.findFirst({ where: { id: offerId, userId: actor.id }, select: { status: true } })

      throw offerClosed(current?.status ?? 'UNKNOWN', 'DECLINED')
    }

    await recordAudit(tx, actor, { entity: 'shift', entityId: offer.shift.id, action: 'offer_declined', diff: { userId: actor.id, offerId }, meta })
  })

  return { shiftId: offer.shift.id, offer: serializeOffer(await ctx.prisma.shiftOffer.findUniqueOrThrow({ where: { id: offerId } })) }
}
