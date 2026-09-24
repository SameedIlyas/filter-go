import { DateTime } from 'luxon'

import type { AppContext } from '../../context.js'
import type { Contract } from '../../generated/prisma/client.js'
import { fromDateOnly, localDate, toDateOnly } from '../../lib/time.js'
import { recordAudit } from '../audit/record.js'
import { assertTransition } from './contract.state.js'

const BATCH = 200

/**
 * Smallest whole number of years that moves `endDate` to `today` or later. Each candidate is computed from the
 * ORIGINAL date, so Feb 29 stays Feb 29 in leap years and is clamped to Feb 28 otherwise (Luxon clamps month ends).
 */
export const renewedEndDate = (endDate: string, today: string): string => {
  const origin = DateTime.fromISO(endDate, { zone: 'utc' })

  for (let years = 1; ; years += 1) {
    const candidate = origin.plus({ years }).toISODate() ?? endDate

    if (candidate >= today) return candidate
  }
}

/** One contract: renew or expire it, only if it is still ACTIVE with the end date we saw (a concurrent run loses). */
const settle = async (ctx: AppContext, contract: Contract, today: string): Promise<void> => {
  const endDate = fromDateOnly(contract.endDate ?? contract.startDate)
  const still = { id: contract.id, orgId: contract.orgId, status: 'ACTIVE' as const, endDate: contract.endDate }

  await ctx.prisma.$transaction(async tx => {
    if (contract.autoRenew) {
      const renewed = renewedEndDate(endDate, today)
      const result = await tx.contract.updateMany({ where: still, data: { endDate: toDateOnly(renewed) } })

      if (result.count === 1) {
        await recordAudit(tx, null, {
          orgId: contract.orgId,
          entity: 'contract',
          entityId: contract.id,
          action: 'auto_renewed',
          diff: { endDate: { from: endDate, to: renewed } }
        })
      }

      return
    }

    assertTransition('ACTIVE', 'EXPIRED')

    const result = await tx.contract.updateMany({ where: still, data: { status: 'EXPIRED' } })

    if (result.count === 1) {
      await recordAudit(tx, null, {
        orgId: contract.orgId,
        entity: 'contract',
        entityId: contract.id,
        action: 'expired',
        diff: { from: 'ACTIVE', to: 'EXPIRED', endDate }
      })
    }
  })
}

const settleOrganization = async (ctx: AppContext, orgId: string, today: string): Promise<void> => {
  let after: string | undefined

  for (;;) {
    const batch = await ctx.prisma.contract.findMany({
      where: { orgId, status: 'ACTIVE', endDate: { lt: toDateOnly(today) }, ...(after ? { id: { gt: after } } : {}) },
      orderBy: { id: 'asc' },
      take: BATCH
    })

    for (const contract of batch) {
      try {
        await settle(ctx, contract, today)
      } catch (error) {
        ctx.log.error({ err: error, contractId: contract.id }, 'contracts.expire failed for one contract')
      }
    }

    const last = batch.at(-1)

    if (!last || batch.length < BATCH) return

    after = last.id
  }
}

/**
 * ACTIVE contracts whose end date is before today (in the organization's timezone): auto-renewing ones get their end
 * date pushed out by whole years (audit `auto_renewed`), the rest become EXPIRED (audit `expired`). Idempotent:
 * a second run finds nothing left to do. `now` is a parameter so tests can pick the day.
 */
export const expireContracts = async (ctx: AppContext, now: Date = new Date()): Promise<void> => {
  const organizations = await ctx.prisma.organization.findMany({ select: { id: true, timezone: true } })

  for (const organization of organizations) {
    try {
      await settleOrganization(ctx, organization.id, localDate(now, organization.timezone))
    } catch (error) {
      ctx.log.error({ err: error, orgId: organization.id }, 'contracts.expire failed for one organization')
    }
  }
}
