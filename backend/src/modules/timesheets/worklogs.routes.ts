import type { FastifyPluginAsync } from 'fastify'

import { ok } from '../../lib/response.js'
import { parse, uuidParams } from '../../lib/validation.js'
import { actorFromReq, clientMeta, requireRoles } from '../../plugins/auth.js'
import { workLogBody, workLogListQuery } from './schemas.js'
import { createWorkLog, listWorkLogs } from './worklogs.js'

/** /shifts/:id/work-logs: photos, notes, issues and checklists recorded during a shift. */
export const workLogRoutes: FastifyPluginAsync = async app => {
  const ctx = app.ctx

  app.post('/shifts/:id/work-logs', { preHandler: requireRoles('FIELD_USER', 'ADMIN', 'SUPERVISOR') }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const workLog = await createWorkLog(ctx, actorFromReq(req), id, parse(workLogBody, req.body), clientMeta(req))

    return reply.status(201).send(ok({ workLog }))
  })

  app.get('/shifts/:id/work-logs', { preHandler: requireRoles('ADMIN', 'SUPERVISOR', 'FIELD_USER', 'CLIENT_USER') }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const { items, meta } = await listWorkLogs(ctx, actorFromReq(req), id, parse(workLogListQuery, req.query))

    return reply.send(ok({ workLogs: items }, meta))
  })
}
