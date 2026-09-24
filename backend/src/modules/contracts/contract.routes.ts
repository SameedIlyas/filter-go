import type { FastifyPluginAsync } from 'fastify'

import { ok } from '../../lib/response.js'
import { parse, uuidParams } from '../../lib/validation.js'
import { actorFromReq, clientMeta, requireAdmin, requireRoles } from '../../plugins/auth.js'
import { changeStatus, createNewVersion, signContract, submitContract } from './contract.lifecycle.js'
import {
  cancelBody,
  coverageBody,
  createContractBody,
  emptyBody,
  linesBody,
  listContractsQuery,
  parseBody,
  patchContractBody,
  signBody
} from './contract.schemas.js'
import { serializeContractDetail, serializeContractSummary } from './contract.serializers.js'
import { createContract, getContract, listContracts, patchContract, replaceCoverage, replaceLines } from './contract.service.js'

/** The app-wide 16 KB body limit is too small for 200 lines plus coverage; these routes take up to this much. */
const BIG_BODY = { bodyLimit: 256 * 1024 }

/** Contracts: CRUD (ADMIN writes, ADMIN + SUPERVISOR read) and the lifecycle actions (ADMIN). CLIENT_USER gets 403. */
export const contractCrudRoutes: FastifyPluginAsync = async app => {
  const ctx = app.ctx
  const readers = requireRoles('ADMIN', 'SUPERVISOR')

  app.get('/contracts', { preHandler: readers }, async (req, reply) => {
    const query = parse(listContractsQuery, req.query)
    const { items, meta } = await listContracts(ctx, actorFromReq(req), query)

    return reply.send(ok({ contracts: items.map(item => serializeContractSummary(item.contract, item.client)) }, meta))
  })

  app.post('/contracts', { ...BIG_BODY, preHandler: requireAdmin }, async (req, reply) => {
    const input = parseBody(createContractBody, req.body)
    const actor = actorFromReq(req)
    const detail = await createContract(ctx, actor, input, clientMeta(req))

    return reply.status(201).send(ok({ contract: serializeContractDetail(detail, actor) }))
  })

  app.get('/contracts/:id', { preHandler: readers }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const actor = actorFromReq(req)

    return reply.send(ok({ contract: serializeContractDetail(await getContract(ctx, actor, id), actor) }))
  })

  app.patch('/contracts/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const input = parseBody(patchContractBody, req.body)
    const actor = actorFromReq(req)

    return reply.send(ok({ contract: serializeContractDetail(await patchContract(ctx, actor, id, input, clientMeta(req)), actor) }))
  })

  app.put('/contracts/:id/lines', { ...BIG_BODY, preHandler: requireAdmin }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const { lines } = parseBody(linesBody, req.body)
    const actor = actorFromReq(req)

    return reply.send(ok({ contract: serializeContractDetail(await replaceLines(ctx, actor, id, lines, clientMeta(req)), actor) }))
  })

  app.put('/contracts/:id/coverage', { ...BIG_BODY, preHandler: requireAdmin }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const { coverage } = parseBody(coverageBody, req.body)
    const actor = actorFromReq(req)

    return reply.send(ok({ contract: serializeContractDetail(await replaceCoverage(ctx, actor, id, coverage, clientMeta(req)), actor) }))
  })

  app.post('/contracts/:id/submit', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)

    parse(emptyBody, req.body)

    const actor = actorFromReq(req)

    return reply.send(ok({ contract: serializeContractDetail(await submitContract(ctx, actor, id, clientMeta(req)), actor) }))
  })

  app.post('/contracts/:id/sign', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const input = parse(signBody, req.body)
    const actor = actorFromReq(req)

    return reply.send(ok({ contract: serializeContractDetail(await signContract(ctx, actor, id, input, clientMeta(req)), actor) }))
  })

  for (const [path, action] of [['suspend', 'suspended'], ['resume', 'resumed']] as const) {
    app.post(`/contracts/:id/${path}`, { preHandler: requireAdmin }, async (req, reply) => {
      const { id } = parse(uuidParams, req.params)

      parse(emptyBody, req.body)

      const actor = actorFromReq(req)

      return reply.send(ok({ contract: serializeContractDetail(await changeStatus(ctx, actor, id, action, {}, clientMeta(req)), actor) }))
    })
  }

  app.post('/contracts/:id/cancel', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const { reason } = parse(cancelBody, req.body)
    const actor = actorFromReq(req)

    return reply.send(ok({ contract: serializeContractDetail(await changeStatus(ctx, actor, id, 'cancelled', { reason }, clientMeta(req)), actor) }))
  })

  app.post('/contracts/:id/new-version', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)

    parse(emptyBody, req.body)

    const actor = actorFromReq(req)

    return reply.status(201).send(ok({ contract: serializeContractDetail(await createNewVersion(ctx, actor, id, clientMeta(req)), actor) }))
  })
}
