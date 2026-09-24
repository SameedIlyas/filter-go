import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { pageQueryShape } from '../../lib/pagination.js'
import { ok } from '../../lib/response.js'
import { parse, uuidParams } from '../../lib/validation.js'
import { actorFromReq, requireAuth } from '../../plugins/auth.js'
import { listNotifications, markAllRead, markRead, unreadCount } from './notifications.service.js'
import { serializeNotification } from './serializers.js'

const listQuery = z.strictObject({
  ...pageQueryShape,
  unread: z
    .enum(['true', 'false'])
    .default('false')
    .transform(value => value === 'true')
})

const noBody = z.strictObject({})

/** In-app notifications for the signed-in user. Registered with prefix "/v1". */
export const notificationRoutes: FastifyPluginAsync = async app => {
  const ctx = app.ctx

  app.addHook('preHandler', requireAuth)

  app.get('/notifications', async (req, reply) => {
    const query = parse(listQuery, req.query)
    const { items, meta, unreadCount: unread } = await listNotifications(ctx, actorFromReq(req), query)

    return reply.send(ok({ notifications: items.map(serializeNotification), unreadCount: unread }, meta))
  })

  app.post('/notifications/read-all', async (req, reply) => {
    parse(noBody, req.body)

    const actor = actorFromReq(req)
    const { updated } = await markAllRead(ctx, actor)

    return reply.send(ok({ updated, unreadCount: await unreadCount(ctx, actor) }))
  })

  app.post('/notifications/:id/read', async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    parse(noBody, req.body)

    const { notification, unreadCount: unread } = await markRead(ctx, actorFromReq(req), id)

    return reply.send(ok({ notification: serializeNotification(notification), unreadCount: unread }))
  })
}
