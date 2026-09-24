import type { FastifyPluginAsync } from 'fastify'

import { ok } from '../../lib/response.js'
import { parse, uuidParams } from '../../lib/validation.js'
import { actorFromReq, clientMeta, requireRoles } from '../../plugins/auth.js'
import { acceptOffer, declineOffer, listMyOffers } from './offers.service.js'
import { presentShift } from './presenters.js'
import { emptyBody, myShiftsQuery, pageOnlyQuery } from './schemas.js'
import { listMyShifts } from './shifts.query.js'

const fieldOnly = requireRoles('FIELD_USER')

/** The field user's own view: their shifts and the offers waiting for an answer. */
export const meRoutes: FastifyPluginAsync = async app => {
  const ctx = app.ctx

  app.get('/me/shifts', { preHandler: fieldOnly }, async (req, reply) => {
    const query = parse(myShiftsQuery, req.query)
    const { items, meta } = await listMyShifts(ctx, actorFromReq(req), query)

    return reply.send(ok({ shifts: items }, meta))
  })

  app.get('/me/offers', { preHandler: fieldOnly }, async (req, reply) => {
    const query = parse(pageOnlyQuery, req.query)
    const { items, meta } = await listMyOffers(ctx, actorFromReq(req), query)

    return reply.send(ok({ offers: items }, meta))
  })

  app.post('/shift-offers/:id/accept', { preHandler: fieldOnly }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)

    parse(emptyBody, req.body)

    const actor = actorFromReq(req)
    const { offer, shiftId } = await acceptOffer(ctx, actor, id, clientMeta(req))

    return reply.send(ok({ offer, shift: await presentShift(ctx, actor, shiftId) }))
  })

  app.post('/shift-offers/:id/decline', { preHandler: fieldOnly }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)

    parse(emptyBody, req.body)

    const { offer } = await declineOffer(ctx, actorFromReq(req), id, clientMeta(req))

    return reply.send(ok({ offer }))
  })
}
