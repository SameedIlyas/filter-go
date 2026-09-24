import type { FastifyPluginAsync } from 'fastify'

import type { AppContext } from '../../context.js'
import type { Actor } from '../../lib/access.js'
import { ok } from '../../lib/response.js'
import { parse, uuidParams } from '../../lib/validation.js'
import { actorFromReq, clientMeta, requireRoles } from '../../plugins/auth.js'
import { adjustEntry } from './adjust.js'
import { approveBatch, approveEntry, rejectEntry, resolveException } from './approval.js'
import { clockIn, clockOut } from './clocking.js'
import { correctEntry, resubmitEntry } from './corrections.js'
import { loadUserNames } from './entries.js'
import type { EntryRow } from './entries.js'
import { getEntryDetail, listEntries, listExceptionQueue, listMyEntries } from './queries.js'
import {
  adjustBody,
  approveBatchBody,
  clockInBody,
  clockOutBody,
  correctBody,
  emptyBody,
  listQuery,
  mineQuery,
  queueQuery,
  rejectBody,
  resolveBody
} from './schemas.js'
import { serializeEntry, serializeException } from './serializers.js'
import { workLogRoutes } from './worklogs.routes.js'

const staff = requireRoles('ADMIN', 'SUPERVISOR')
const worker = requireRoles('FIELD_USER')

/** One entry as the caller may see it (worker names resolved, rates per role). */
const present = async (ctx: AppContext, actor: Actor, row: EntryRow) => ({
  timesheet: serializeEntry(row, actor, await loadUserNames(ctx.prisma, actor.orgId, [row.userId]))
})

/**
 * Timesheets module (docs/ARCHITECTURE.md section 6). Registered in app.ts with prefix "/v1".
 * Every route has an explicit role guard; scoping to the caller's organization and sites happens in the services.
 */
export const timesheetRoutes: FastifyPluginAsync = async app => {
  const ctx = app.ctx

  await app.register(workLogRoutes)

  // ---- clocking (the worker)

  app.post('/shifts/:id/clock-in', { preHandler: worker }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const actor = actorFromReq(req)
    const entry = await clockIn(ctx, actor, id, parse(clockInBody, req.body), clientMeta(req))

    return reply.status(201).send(ok(await present(ctx, actor, entry)))
  })

  app.post('/timesheets/:id/clock-out', { preHandler: worker }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const actor = actorFromReq(req)
    const entry = await clockOut(ctx, actor, id, parse(clockOutBody, req.body), clientMeta(req))

    return reply.send(ok(await present(ctx, actor, entry)))
  })

  app.patch('/timesheets/:id/correct', { preHandler: worker }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const actor = actorFromReq(req)
    const entry = await correctEntry(ctx, actor, id, parse(correctBody, req.body), clientMeta(req))

    return reply.send(ok(await present(ctx, actor, entry)))
  })

  app.post('/timesheets/:id/resubmit', { preHandler: worker }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    parse(emptyBody, req.body)
    const actor = actorFromReq(req)

    return reply.send(ok(await present(ctx, actor, await resubmitEntry(ctx, actor, id, clientMeta(req)))))
  })

  // ---- reading

  app.get('/me/timesheets', { preHandler: worker }, async (req, reply) => {
    const { items, meta } = await listMyEntries(ctx, actorFromReq(req), parse(mineQuery, req.query))

    return reply.send(ok({ timesheets: items }, meta))
  })

  app.get('/timesheets', { preHandler: requireRoles('ADMIN', 'SUPERVISOR', 'CLIENT_USER') }, async (req, reply) => {
    const { items, meta } = await listEntries(ctx, actorFromReq(req), parse(listQuery, req.query))

    return reply.send(ok({ timesheets: items }, meta))
  })

  app.get('/timesheets/exceptions', { preHandler: staff }, async (req, reply) => {
    const { items, meta } = await listExceptionQueue(ctx, actorFromReq(req), parse(queueQuery, req.query))

    return reply.send(ok({ exceptions: items }, meta))
  })

  app.get('/timesheets/:id', { preHandler: requireRoles('ADMIN', 'SUPERVISOR', 'FIELD_USER', 'CLIENT_USER') }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)

    return reply.send(ok({ timesheet: await getEntryDetail(ctx, actorFromReq(req), id) }))
  })

  // ---- review (supervisors and admins)

  app.post('/timesheets/approve-batch', { preHandler: staff }, async (req, reply) => {
    const { ids } = parse(approveBatchBody, req.body)

    return reply.send(ok(await approveBatch(ctx, actorFromReq(req), ids, clientMeta(req))))
  })

  app.post('/timesheets/:id/approve', { preHandler: staff }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    parse(emptyBody, req.body)
    const actor = actorFromReq(req)

    return reply.send(ok(await present(ctx, actor, await approveEntry(ctx, actor, id, clientMeta(req)))))
  })

  app.post('/timesheets/:id/reject', { preHandler: staff }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const { reason } = parse(rejectBody, req.body)
    const actor = actorFromReq(req)

    return reply.send(ok(await present(ctx, actor, await rejectEntry(ctx, actor, id, reason, clientMeta(req)))))
  })

  app.post('/timesheets/:id/adjust', { preHandler: staff }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const actor = actorFromReq(req)
    const entry = await adjustEntry(ctx, actor, id, parse(adjustBody, req.body), clientMeta(req))

    return reply.send(ok(await present(ctx, actor, entry)))
  })

  app.post('/timesheet-exceptions/:id/resolve', { preHandler: staff }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const { note } = parse(resolveBody, req.body)
    const exception = await resolveException(ctx, actorFromReq(req), id, note, clientMeta(req))

    return reply.send(ok({ exception: serializeException(exception) }))
  })
}
