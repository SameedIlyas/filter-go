import type { AppContext } from '../../context.js'
import type { Notification, Prisma } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import { pageArgs, pageMeta } from '../../lib/pagination.js'
import type { PageQuery } from '../../lib/pagination.js'
import type { PageMeta } from '../../lib/response.js'

/** Every query is pinned to the caller: someone else's notification is indistinguishable from a missing one. */
const own = (actor: Actor): Prisma.NotificationWhereInput => ({ userId: actor.id, orgId: actor.orgId })

export const unreadCount = (ctx: AppContext, actor: Actor): Promise<number> =>
  ctx.prisma.notification.count({ where: { ...own(actor), readAt: null } })

export const listNotifications = async (
  ctx: AppContext,
  actor: Actor,
  query: PageQuery & { unread: boolean }
): Promise<{ items: Notification[]; meta: PageMeta; unreadCount: number }> => {
  const where: Prisma.NotificationWhereInput = { ...own(actor), ...(query.unread ? { readAt: null } : {}) }

  const [total, items, unread] = await Promise.all([
    ctx.prisma.notification.count({ where }),
    ctx.prisma.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...pageArgs(query) }),
    unreadCount(ctx, actor)
  ])

  return { items, meta: pageMeta(query, total), unreadCount: unread }
}

/** Idempotent: marking an already-read notification keeps its original `readAt`. */
export const markRead = async (ctx: AppContext, actor: Actor, id: string): Promise<{ notification: Notification; unreadCount: number }> => {
  await ctx.prisma.notification.updateMany({ where: { id, ...own(actor), readAt: null }, data: { readAt: new Date() } })

  const notification = await ctx.prisma.notification.findFirst({ where: { id, ...own(actor) } })

  if (!notification) throw Errors.notFound('notification')

  return { notification, unreadCount: await unreadCount(ctx, actor) }
}

export const markAllRead = async (ctx: AppContext, actor: Actor): Promise<{ updated: number }> => {
  const result = await ctx.prisma.notification.updateMany({ where: { ...own(actor), readAt: null }, data: { readAt: new Date() } })

  return { updated: result.count }
}
