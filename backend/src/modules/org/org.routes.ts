import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { pageQueryShape } from '../../lib/pagination.js'
import { ok } from '../../lib/response.js'
import { instantField, timezoneField } from '../../lib/time.js'
import { parse } from '../../lib/validation.js'
import { actorFromReq, clientMeta, requireAdmin, requireAuth } from '../../plugins/auth.js'
import { listAuditEvents } from './audit-events.service.js'
import { getOrg, rotateLeadKey, updateOrg } from './org.service.js'
import { serializeAuditEvent, serializeOrg } from './serializers.js'

const updateBody = z
  .strictObject({
    name: z.string().trim().min(1).max(120).refine(value => !/\p{C}/u.test(value), 'Name contains invalid characters.').optional(),
    timezone: timezoneField.optional(),
    defaultLeadOwnerId: z.uuid().nullable().optional()
  })
  .refine(value => Object.keys(value).length > 0, 'Provide at least one field to update.')

const noBody = z.strictObject({})

const short = z.string().trim().min(1).max(100)

const auditQuery = z.strictObject({
  ...pageQueryShape,
  entity: short.optional(),
  entityId: short.optional(),
  actorId: z.uuid().optional(),
  action: short.optional(),
  from: instantField.optional(),
  to: instantField.optional()
})

/** GET/PATCH /org, lead-key rotation and the audit trail. Registered with prefix "/v1". */
export const orgRoutes: FastifyPluginAsync = async app => {
  const ctx = app.ctx

  app.get('/org', { preHandler: requireAuth }, async (req, reply) => {
    const actor = actorFromReq(req)

    return reply.send(ok({ org: serializeOrg(await getOrg(ctx, actor.orgId), actor) }))
  })

  app.patch('/org', { preHandler: requireAdmin }, async (req, reply) => {
    const body = parse(updateBody, req.body)
    const actor = actorFromReq(req)
    const org = await updateOrg(ctx, actor, body, clientMeta(req))

    return reply.send(ok({ org: serializeOrg(org, actor) }))
  })

  app.post('/org/rotate-lead-key', { preHandler: requireAdmin }, async (req, reply) => {
    parse(noBody, req.body)

    const actor = actorFromReq(req)
    const org = await rotateLeadKey(ctx, actor, clientMeta(req))

    return reply.send(ok({ org: serializeOrg(org, actor) }))
  })

  app.get('/audit-events', { preHandler: requireAdmin }, async (req, reply) => {
    const query = parse(auditQuery, req.query)
    const { items, meta } = await listAuditEvents(ctx, actorFromReq(req).orgId, query)

    return reply.send(ok({ events: items.map(serializeAuditEvent) }, meta))
  })
}
