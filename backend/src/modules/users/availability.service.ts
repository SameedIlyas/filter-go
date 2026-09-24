import type { AppContext, ClientMeta } from '../../context.js'
import type { UserAvailability } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { recordAudit } from '../audit/record.js'
import { compareWindows } from './platform.schemas.js'
import type { AvailabilityWindow } from './platform.schemas.js'
import { lockUser } from './user-scope.js'

const byWindow = (a: AvailabilityWindow, b: AvailabilityWindow) => compareWindows(a, b)

const shape = ({ weekday, startTime, endTime }: UserAvailability): AvailabilityWindow => ({ weekday, startTime, endTime })

/** Times are wall clock in the organization's timezone, which is returned alongside so the UI can label them. */
export const getAvailability = async (ctx: AppContext, orgId: string, userId: string) => {
  const [org, windows] = await Promise.all([
    ctx.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { timezone: true } }),
    ctx.prisma.userAvailability.findMany({ where: { userId }, orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }, { id: 'asc' }] })
  ])

  return { timezone: org.timezone, windows }
}

/** Replace-all: the previous windows and the new ones change together, and the change is audited in the same transaction. */
export const replaceAvailability = async (
  ctx: AppContext,
  actor: Actor,
  userId: string,
  windows: AvailabilityWindow[],
  meta: ClientMeta
): Promise<void> => {
  await ctx.prisma.$transaction(async tx => {
    await lockUser(tx, userId)

    const before = await tx.userAvailability.findMany({ where: { userId } })
    const after = [...windows].sort(byWindow)

    await tx.userAvailability.deleteMany({ where: { userId } })
    await tx.userAvailability.createMany({ data: after.map(window => ({ userId, ...window })) })

    await recordAudit(tx, actor, {
      entity: 'user',
      entityId: userId,
      action: 'availability_replaced',
      diff: { before: before.map(shape).sort(byWindow), after },
      meta
    })
  })
}
