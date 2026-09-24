import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { pageQueryShape } from '../../lib/pagination.js'
import { ok } from '../../lib/response.js'
import { timezoneField } from '../../lib/time.js'
import { emailField, parse, uuidParams } from '../../lib/validation.js'
import { actorFromReq, clientMeta, requireAdmin, requireAuth, requireRoles } from '../../plugins/auth.js'
import { createClient, getClient, listClients, updateClient } from './clients.service.js'
import { serializeClient, serializeSite } from './serializers.js'
import { createSite, getSite, listSites, updateSite } from './sites.service.js'

const activeQuery = z.enum(['true', 'false']).transform(value => value === 'true')
const paymentTermsField = z.enum(['NET15', 'NET30', 'DUE_ON_RECEIPT'])
const legalNameField = z.string().trim().min(1, 'Legal name is required.').max(200)
const shortText = (max: number) => z.string().trim().min(1).max(max)

const listClientsQuery = z.strictObject({
  ...pageQueryShape,
  q: z.string().trim().min(1).max(100).optional(),
  active: activeQuery.optional()
})

const createClientBody = z.strictObject({
  legalName: legalNameField,
  billingEmail: emailField,
  billingAddress: shortText(500).nullable().optional(),
  paymentTerms: paymentTermsField.optional()
})

const updateClientBody = z
  .strictObject({
    legalName: legalNameField.optional(),
    billingEmail: emailField.optional(),
    billingAddress: shortText(500).nullable().optional(),
    paymentTerms: paymentTermsField.optional(),
    active: z.boolean().optional()
  })
  .refine(value => Object.keys(value).length > 0, 'Provide at least one field to update.')

const listSitesQuery = z.strictObject({
  ...pageQueryShape,
  clientId: z.uuid('Invalid id.').optional(),
  q: z.string().trim().min(1).max(100).optional(),
  active: activeQuery.optional()
})

const latField = z.number().min(-90, 'Latitude must be between -90 and 90.').max(90, 'Latitude must be between -90 and 90.')
const lngField = z.number().min(-180, 'Longitude must be between -180 and 180.').max(180, 'Longitude must be between -180 and 180.')

const siteFields = {
  name: shortText(200),
  address: shortText(500),
  timezone: timezoneField.nullable(),
  accessNotes: shortText(2000).nullable(),
  contactName: shortText(200).nullable(),
  contactPhone: shortText(40).nullable()
}

/** `lat` and `lng` travel together: both numbers, both null (clears the position) or both absent. */
const coordinatesTogether = (value: { lat?: number | null; lng?: number | null }) => (value.lat === undefined) === (value.lng === undefined) && (value.lat === null) === (value.lng === null)

const COORDINATES_MESSAGE = 'Send latitude and longitude together, or neither.'

const createSiteBody = z
  .strictObject({
    name: siteFields.name,
    address: siteFields.address,
    lat: latField.optional(),
    lng: lngField.optional(),
    timezone: siteFields.timezone.optional(),
    accessNotes: siteFields.accessNotes.optional(),
    contactName: siteFields.contactName.optional(),
    contactPhone: siteFields.contactPhone.optional()
  })
  .refine(coordinatesTogether, { message: COORDINATES_MESSAGE, path: ['lat'] })

const updateSiteBody = z
  .strictObject({
    name: siteFields.name.optional(),
    address: siteFields.address.optional(),
    lat: latField.nullable().optional(),
    lng: lngField.nullable().optional(),
    timezone: siteFields.timezone.optional(),
    accessNotes: siteFields.accessNotes.optional(),
    contactName: siteFields.contactName.optional(),
    contactPhone: siteFields.contactPhone.optional(),
    active: z.boolean().optional()
  })
  .refine(value => Object.keys(value).length > 0, 'Provide at least one field to update.')
  .refine(coordinatesTogether, { message: COORDINATES_MESSAGE, path: ['lat'] })

const clientIdParams = z.strictObject({ clientId: z.uuid('Invalid id.') })

export const clientRoutes: FastifyPluginAsync = async app => {
  const ctx = app.ctx
  const clientReaders = requireRoles('ADMIN', 'SUPERVISOR', 'CLIENT_USER')

  app.get('/clients', { preHandler: clientReaders }, async (req, reply) => {
    const query = parse(listClientsQuery, req.query)
    const actor = actorFromReq(req)
    const { items, meta } = await listClients(ctx, actor, query)

    return reply.send(ok({ clients: items.map(client => serializeClient(client, actor)) }, meta))
  })

  app.post('/clients', { preHandler: requireAdmin }, async (req, reply) => {
    const input = parse(createClientBody, req.body)
    const actor = actorFromReq(req)
    const client = await createClient(ctx, actor, input, clientMeta(req))

    return reply.status(201).send(ok({ client: serializeClient(client, actor) }))
  })

  app.get('/clients/:id', { preHandler: clientReaders }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const actor = actorFromReq(req)

    return reply.send(ok({ client: serializeClient(await getClient(ctx, actor, id), actor) }))
  })

  app.patch('/clients/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const input = parse(updateClientBody, req.body)
    const actor = actorFromReq(req)
    const client = await updateClient(ctx, actor, id, input, clientMeta(req))

    return reply.send(ok({ client: serializeClient(client, actor) }))
  })
}

export const siteRoutes: FastifyPluginAsync = async app => {
  const ctx = app.ctx

  app.get('/sites', { preHandler: requireAuth }, async (req, reply) => {
    const query = parse(listSitesQuery, req.query)
    const { items, meta } = await listSites(ctx, actorFromReq(req), query)

    return reply.send(ok({ sites: items.map(serializeSite) }, meta))
  })

  app.post('/clients/:clientId/sites', { preHandler: requireAdmin }, async (req, reply) => {
    const { clientId } = parse(clientIdParams, req.params)
    const input = parse(createSiteBody, req.body)
    const site = await createSite(ctx, actorFromReq(req), clientId, input, clientMeta(req))

    return reply.status(201).send(ok({ site: serializeSite(site) }))
  })

  app.get('/sites/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)

    return reply.send(ok({ site: serializeSite(await getSite(ctx, actorFromReq(req), id)) }))
  })

  app.patch('/sites/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const input = parse(updateSiteBody, req.body)
    const site = await updateSite(ctx, actorFromReq(req), id, input, clientMeta(req))

    return reply.send(ok({ site: serializeSite(site) }))
  })
}
