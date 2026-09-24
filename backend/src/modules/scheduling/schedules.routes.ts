import type { FastifyPluginAsync } from 'fastify'

import { ok } from '../../lib/response.js'
import { parse, uuidParams } from '../../lib/validation.js'
import { actorFromReq, clientMeta, requireRoles } from '../../plugins/auth.js'
import { coverage } from './coverage.service.js'
import { generateSchedule, regenerateSchedule } from './generation.service.js'
import { presentSchedule } from './presenters.js'
import { deleteSchedule, listSchedules, transitionSchedule } from './schedules.service.js'
import type { TransitionName } from './schedules.service.js'
import { coverageQuery, emptyBody, generateBody, scheduleListQuery } from './schemas.js'

const staffOnly = requireRoles('ADMIN', 'SUPERVISOR')
/** Everyone who may see schedules at all; the service narrows what each role actually gets (scope.ts). */
const anyViewer = requireRoles('ADMIN', 'SUPERVISOR', 'CLIENT_USER', 'FIELD_USER')

const TRANSITION_ROUTES: TransitionName[] = ['publish', 'unpublish', 'lock', 'close']

export const scheduleRoutes: FastifyPluginAsync = async app => {
  const ctx = app.ctx

  app.post('/schedules/generate', { preHandler: staffOnly }, async (req, reply) => {
    const body = parse(generateBody, req.body)
    const result = await generateSchedule(ctx, actorFromReq(req), body, clientMeta(req))

    return reply.status(201).send(ok(result))
  })

  app.get('/schedules', { preHandler: anyViewer }, async (req, reply) => {
    const query = parse(scheduleListQuery, req.query)
    const { items, meta } = await listSchedules(ctx, actorFromReq(req), query)

    return reply.send(ok({ schedules: items }, meta))
  })

  app.get('/schedules/:id', { preHandler: anyViewer }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)

    return reply.send(ok({ schedule: await presentSchedule(ctx, actorFromReq(req), id) }))
  })

  for (const name of TRANSITION_ROUTES) {
    app.post(`/schedules/:id/${name}`, { preHandler: staffOnly }, async (req, reply) => {
      const { id } = parse(uuidParams, req.params)

      parse(emptyBody, req.body)

      return reply.send(ok({ schedule: await transitionSchedule(ctx, actorFromReq(req), id, name, clientMeta(req)) }))
    })
  }

  app.post('/schedules/:id/regenerate', { preHandler: staffOnly }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)

    parse(emptyBody, req.body)

    return reply.send(ok(await regenerateSchedule(ctx, actorFromReq(req), id, clientMeta(req))))
  })

  app.delete('/schedules/:id', { preHandler: staffOnly }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)

    await deleteSchedule(ctx, actorFromReq(req), id, clientMeta(req))

    return reply.send(ok({ deleted: true }))
  })

  app.get('/coverage', { preHandler: staffOnly }, async (req, reply) => {
    const query = parse(coverageQuery, req.query)

    return reply.send(ok(await coverage(ctx, actorFromReq(req), query)))
  })
}
