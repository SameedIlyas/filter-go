import type { FastifyPluginAsync } from 'fastify'

import type { Actor } from '../../lib/access.js'
import { ok } from '../../lib/response.js'
import { parse, uuidParams } from '../../lib/validation.js'
import { actorFromReq, clientMeta, requireAdmin, requireRoles } from '../../plugins/auth.js'
import { emptyBody, lineBody, lineParams, listQuery, patchBody, paymentBody, runBody, voidBody } from './invoices.schemas.js'
import { getInvoiceDetail, listInvoices } from './invoices.queries.js'
import { addManualLine, approveInvoice, deleteDraft, removeLine, requestSend, retrySync, updateDraft, voidInvoice } from './invoices.service.js'
import { recordManualPayment } from './payments.service.js'
import { createInvoiceRun } from './run.service.js'
import { getInvoiceTrace } from './trace.service.js'

/**
 * Invoices module: invoice runs, lines, approval, sync, send, payments, trace.
 * Registered in app.ts with prefix "/v1". Define the full sub-paths inside this plugin.
 *
 * Guards: every mutation and the trace are ADMIN only; reading is ADMIN and CLIENT_USER (scoped to their client,
 * never DRAFT/VOID). SUPERVISOR and FIELD_USER get 403 everywhere.
 */
export const invoiceRoutes: FastifyPluginAsync = async app => {
  const ctx = app.ctx
  const adminOnly = { preHandler: requireAdmin }
  const readers = { preHandler: requireRoles('ADMIN', 'CLIENT_USER') }

  /** Every mutation answers with the fresh detail so the UI can re-render from one response. */
  const detail = async (actor: Actor, id: string) => ok({ invoice: await getInvoiceDetail(ctx, actor, id) })

  app.post('/invoices/runs', adminOnly, async (req, reply) => {
    const input = parse(runBody, req.body)
    const actor = actorFromReq(req)
    const invoice = await createInvoiceRun(ctx, actor, input, clientMeta(req))

    return reply.status(201).send(await detail(actor, invoice.id))
  })

  app.get('/invoices', readers, async (req, reply) => {
    const query = parse(listQuery, req.query)
    const { items, meta } = await listInvoices(ctx, actorFromReq(req), query)

    return reply.send(ok({ invoices: items }, meta))
  })

  app.get('/invoices/:id', readers, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)

    return reply.send(await detail(actorFromReq(req), id))
  })

  app.patch('/invoices/:id', adminOnly, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const patch = parse(patchBody, req.body)
    const actor = actorFromReq(req)

    await updateDraft(ctx, actor, id, patch, clientMeta(req))

    return reply.send(await detail(actor, id))
  })

  app.post('/invoices/:id/lines', adminOnly, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const input = parse(lineBody, req.body)
    const actor = actorFromReq(req)

    await addManualLine(ctx, actor, id, input, clientMeta(req))

    return reply.status(201).send(await detail(actor, id))
  })

  app.delete('/invoices/:id/lines/:lineId', adminOnly, async (req, reply) => {
    const { id, lineId } = parse(lineParams, req.params)
    const actor = actorFromReq(req)

    await removeLine(ctx, actor, id, lineId, clientMeta(req))

    return reply.send(await detail(actor, id))
  })

  app.delete('/invoices/:id', adminOnly, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)

    await deleteDraft(ctx, actorFromReq(req), id, clientMeta(req))

    return reply.send(ok({ deleted: true, id }))
  })

  app.post('/invoices/:id/approve', adminOnly, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const actor = actorFromReq(req)

    parse(emptyBody, req.body)
    await approveInvoice(ctx, actor, id, clientMeta(req))

    return reply.send(await detail(actor, id))
  })

  app.post('/invoices/:id/void', adminOnly, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const { reason } = parse(voidBody, req.body)
    const actor = actorFromReq(req)

    await voidInvoice(ctx, actor, id, reason, clientMeta(req))

    return reply.send(await detail(actor, id))
  })

  // 202: the status becomes SENT when the outbox worker has created the pay link and emailed it
  app.post('/invoices/:id/send', adminOnly, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const actor = actorFromReq(req)

    parse(emptyBody, req.body)
    await requestSend(ctx, actor, id, clientMeta(req))

    return reply.status(202).send(await detail(actor, id))
  })

  app.post('/invoices/:id/payments', adminOnly, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const input = parse(paymentBody, req.body)
    const actor = actorFromReq(req)

    await recordManualPayment(ctx, actor, id, { amount: input.amount, method: input.method, receivedAt: input.receivedAt ?? new Date(), externalRef: input.externalRef ?? null }, clientMeta(req))

    return reply.status(201).send(await detail(actor, id))
  })

  app.post('/invoices/:id/retry-sync', adminOnly, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const actor = actorFromReq(req)

    parse(emptyBody, req.body)
    await retrySync(ctx, actor, id, clientMeta(req))

    return reply.send(await detail(actor, id))
  })

  app.get('/invoices/:id/trace', adminOnly, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)

    return reply.send(ok(await getInvoiceTrace(ctx, actorFromReq(req), id)))
  })
}
