import type { FastifyPluginAsync } from 'fastify'

import { ok } from '../../lib/response.js'
import { parse, uuidParams } from '../../lib/validation.js'
import { actorFromReq, clientMeta, requireAuth, requireRoles } from '../../plugins/auth.js'
import { getUserCompliance, listExpiring } from './compliance.js'
import { getAvailability, replaceAvailability } from './availability.service.js'
import { listDirectory } from './directory.service.js'
import { createDocument, deleteDocument, listDocuments, updateDocument } from './documents.service.js'
import {
  availabilityBody,
  createDocumentBody,
  directoryQuery,
  documentParams,
  expiringQuery,
  siteAccessBody,
  updateDocumentBody
} from './platform.schemas.js'
import { serializeDocument, serializeDocumentWithStatus, serializeSiteRef, serializeWindow } from './platform.serializers.js'
import { serializeUser } from './serializers.js'
import { listUserSites, replaceUserSites } from './site-access.service.js'
import { findVisibleUser } from './user-scope.js'

const staff = requireRoles('ADMIN', 'SUPERVISOR')
const adminOnly = requireRoles('ADMIN')

/**
 * Users module: /v1/users (directory), availability, site access, documents, compliance.
 * Registered in app.ts with prefix "/v1".
 *
 * Visibility rule used by every /users/:id route: ADMIN sees the whole organization, SUPERVISOR only themselves and
 * people sharing a site with them, everyone else only themselves. Anything outside that is a 404.
 */
export const userRoutes: FastifyPluginAsync = async app => {
  const ctx = app.ctx

  // ------------------------------- directory -------------------------------

  app.get('/users', { preHandler: staff }, async (req, reply) => {
    const query = parse(directoryQuery, req.query)
    const actor = actorFromReq(req)
    const { items, meta } = await listDirectory(ctx, actor, query)

    return reply.send(ok({ users: items.map(user => serializeUser(user, actor)) }, meta))
  })

  app.get('/users/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const actor = actorFromReq(req)

    return reply.send(ok({ user: serializeUser(await findVisibleUser(ctx, actor, id), actor) }))
  })

  // ------------------------------- availability -------------------------------

  app.get('/users/:id/availability', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const actor = actorFromReq(req)
    const target = await findVisibleUser(ctx, actor, id)
    const { timezone, windows } = await getAvailability(ctx, actor.orgId, target.id)

    return reply.send(ok({ userId: target.id, timezone, windows: windows.map(serializeWindow) }))
  })

  app.put('/users/:id/availability', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const body = parse(availabilityBody, req.body)
    const actor = actorFromReq(req)
    const target = await findVisibleUser(ctx, actor, id)

    await replaceAvailability(ctx, actor, target.id, body.windows, clientMeta(req))

    const { timezone, windows } = await getAvailability(ctx, actor.orgId, target.id)

    return reply.send(ok({ userId: target.id, timezone, windows: windows.map(serializeWindow) }))
  })

  // ------------------------------- site access -------------------------------

  app.get('/users/:id/sites', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const actor = actorFromReq(req)
    const target = await findVisibleUser(ctx, actor, id)
    const sites = await listUserSites(ctx, actor, target.id)

    return reply.send(ok({ userId: target.id, siteIds: sites.map(site => site.id), sites: sites.map(serializeSiteRef) }))
  })

  app.put('/users/:id/sites', { preHandler: adminOnly }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const body = parse(siteAccessBody, req.body)
    const actor = actorFromReq(req)
    const target = await findVisibleUser(ctx, actor, id)

    await replaceUserSites(ctx, actor, target, body.siteIds, clientMeta(req))

    const sites = await listUserSites(ctx, actor, target.id)

    return reply.send(ok({ userId: target.id, siteIds: sites.map(site => site.id), sites: sites.map(serializeSiteRef) }))
  })

  // ------------------------------- documents -------------------------------

  app.get('/users/:id/documents', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const actor = actorFromReq(req)
    const target = await findVisibleUser(ctx, actor, id)
    const documents = await listDocuments(ctx, actor.orgId, target.id)

    return reply.send(ok({ documents: documents.map(serializeDocument) }))
  })

  app.post('/users/:id/documents', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const body = parse(createDocumentBody, req.body)
    const actor = actorFromReq(req)
    const target = await findVisibleUser(ctx, actor, id)
    const document = await createDocument(ctx, actor, target.id, body, clientMeta(req))

    return reply.status(201).send(ok({ document: serializeDocument(document) }))
  })

  app.patch('/users/:id/documents/:documentId', { preHandler: staff }, async (req, reply) => {
    const { id, documentId } = parse(documentParams, req.params)
    const body = parse(updateDocumentBody, req.body)
    const actor = actorFromReq(req)
    const target = await findVisibleUser(ctx, actor, id)
    const document = await updateDocument(ctx, actor, target.id, documentId, body, clientMeta(req))

    return reply.send(ok({ document: serializeDocument(document) }))
  })

  app.delete('/users/:id/documents/:documentId', { preHandler: staff }, async (req, reply) => {
    const { id, documentId } = parse(documentParams, req.params)
    const actor = actorFromReq(req)
    const target = await findVisibleUser(ctx, actor, id)

    await deleteDocument(ctx, actor, target.id, documentId, clientMeta(req))

    return reply.send(ok({ deleted: true }))
  })

  // ------------------------------- compliance -------------------------------

  app.get('/users/:id/compliance', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const actor = actorFromReq(req)
    const target = await findVisibleUser(ctx, actor, id)
    const { today, overall, entries } = await getUserCompliance(ctx, actor, target)

    return reply.send(
      ok({
        userId: target.id,
        today,
        overall,
        documents: entries.map(entry => serializeDocumentWithStatus(entry.document, entry.status, entry.daysUntilExpiry))
      })
    )
  })

  app.get('/compliance/expiring', { preHandler: staff }, async (req, reply) => {
    const query = parse(expiringQuery, req.query)
    const { entries, meta, today } = await listExpiring(ctx, actorFromReq(req), query)

    return reply.send(
      ok(
        {
          today,
          days: query.days,
          documents: entries.map(entry => ({
            ...serializeDocumentWithStatus(entry.document, entry.status, entry.daysUntilExpiry),
            user: { id: entry.user.id, name: entry.user.name, role: entry.user.role }
          }))
        },
        meta
      )
    )
  })
}
