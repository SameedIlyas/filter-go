import type { FastifyPluginAsync } from 'fastify'

import { ok } from '../../lib/response.js'
import { parse, uuidParams } from '../../lib/validation.js'
import { actorFromReq, clientMeta, requireRoles } from '../../plugins/auth.js'
import { addShift, assignShift, validateAssignment } from './assignment.service.js'
import { addExtraShift } from './extra-shift.service.js'
import { createOffers } from './offers.service.js'
import { presentShift } from './presenters.js'
import { addShiftBody, assignBody, cancelBody, emptyBody, extraShiftBody, offersBody, patchShiftBody, shiftListQuery, validateAssignmentBody } from './schemas.js'
import { cancelShift, confirmShift, unassignShift, updateShift } from './shifts.service.js'
import { listShifts } from './shifts.query.js'

const staffOnly = requireRoles('ADMIN', 'SUPERVISOR')
const anyViewer = requireRoles('ADMIN', 'SUPERVISOR', 'CLIENT_USER', 'FIELD_USER')
const fieldOnly = requireRoles('FIELD_USER')

export const shiftRoutes: FastifyPluginAsync = async app => {
  const ctx = app.ctx

  app.get('/shifts', { preHandler: anyViewer }, async (req, reply) => {
    const query = parse(shiftListQuery, req.query)
    const { items, meta } = await listShifts(ctx, actorFromReq(req), query)

    return reply.send(ok({ shifts: items }, meta))
  })

  // Registered before "/shifts/:id/..." so the literal path is unambiguous
  app.post('/shifts/extra', { preHandler: fieldOnly }, async (req, reply) => {
    const body = parse(extraShiftBody, req.body)
    const shift = await addExtraShift(ctx, actorFromReq(req), body, clientMeta(req))

    return reply.status(201).send(ok({ shift }))
  })

  app.get('/shifts/:id', { preHandler: anyViewer }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)

    return reply.send(ok({ shift: await presentShift(ctx, actorFromReq(req), id) }))
  })

  app.post('/schedules/:id/shifts', { preHandler: staffOnly }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const body = parse(addShiftBody, req.body)
    const shift = await addShift(ctx, actorFromReq(req), id, body, clientMeta(req))

    return reply.status(201).send(ok({ shift }))
  })

  app.patch('/shifts/:id', { preHandler: staffOnly }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const body = parse(patchShiftBody, req.body)

    return reply.send(ok({ shift: await updateShift(ctx, actorFromReq(req), id, body, clientMeta(req)) }))
  })

  app.post('/shifts/:id/validate-assignment', { preHandler: staffOnly }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const { userId } = parse(validateAssignmentBody, req.body)
    const { blocking, warnings } = await validateAssignment(ctx, actorFromReq(req), id, userId)

    return reply.send(ok({ blocking, warnings }))
  })

  app.post('/shifts/:id/assign', { preHandler: staffOnly }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const body = parse(assignBody, req.body)

    return reply.send(ok({ shift: await assignShift(ctx, actorFromReq(req), id, body, clientMeta(req)) }))
  })

  app.post('/shifts/:id/unassign', { preHandler: staffOnly }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)

    parse(emptyBody, req.body)

    return reply.send(ok({ shift: await unassignShift(ctx, actorFromReq(req), id, clientMeta(req)) }))
  })

  app.post('/shifts/:id/cancel', { preHandler: staffOnly }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const { reason } = parse(cancelBody, req.body)

    return reply.send(ok({ shift: await cancelShift(ctx, actorFromReq(req), id, reason, clientMeta(req)) }))
  })

  app.post('/shifts/:id/confirm', { preHandler: fieldOnly }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)

    parse(emptyBody, req.body)

    return reply.send(ok({ shift: await confirmShift(ctx, actorFromReq(req), id, clientMeta(req)) }))
  })

  app.post('/shifts/:id/offers', { preHandler: staffOnly }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const { userIds } = parse(offersBody, req.body)
    const offers = await createOffers(ctx, actorFromReq(req), id, userIds, clientMeta(req))

    return reply.status(201).send(ok({ offers }))
  })
}
