import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { D } from '../../lib/money.js'
import { pageQueryShape } from '../../lib/pagination.js'
import { ok } from '../../lib/response.js'
import { nameField, parse, uuidParams } from '../../lib/validation.js'
import { actorFromReq, clientMeta, requireAdmin, requireRoles } from '../../plugins/auth.js'
import { createService, deleteTaxRate, listServices, listTaxRates, putTaxRate, updateService } from './catalog.service.js'
import { taxCodeField } from './contract.schemas.js'
import { serializeService, serializeTaxRate } from './serializers.js'

const activeQuery = z.enum(['true', 'false']).transform(value => value === 'true')
const descriptionField = z.string().trim().max(500)

const listServicesQuery = z.strictObject({
  ...pageQueryShape,
  q: z.string().trim().min(1).max(100).optional(),
  active: activeQuery.optional()
})

const createServiceBody = z.strictObject({
  name: nameField,
  description: descriptionField.nullable().optional(),
  active: z.boolean().optional()
})

const updateServiceBody = z
  .strictObject({
    name: nameField.optional(),
    description: descriptionField.nullable().optional(),
    active: z.boolean().optional()
  })
  .refine(value => Object.keys(value).length > 0, 'Provide at least one field to update.')

/** 0 - 100 with at most 3 decimals ("8.250"). */
const ratePercentField = z
  .union([z.string().trim(), z.number()])
  .transform(value => String(value))
  .refine(value => /^\d{1,3}(\.\d{1,3})?$/.test(value), 'Enter a percentage with at most 3 decimals, e.g. "8.250".')
  .transform(value => D(value))
  .refine(value => value.lte(100), 'A tax rate cannot exceed 100%.')

const putTaxRateBody = z.strictObject({ ratePercent: ratePercentField })
const taxCodeParams = z.strictObject({ code: taxCodeField })

/** Services and tax rates: the small lookup tables that contract lines point at. */
export const catalogRoutes: FastifyPluginAsync = async app => {
  const ctx = app.ctx

  app.get('/services', { preHandler: requireRoles('ADMIN', 'SUPERVISOR') }, async (req, reply) => {
    const query = parse(listServicesQuery, req.query)
    const { items, meta } = await listServices(ctx, actorFromReq(req), query)

    return reply.send(ok({ services: items.map(serializeService) }, meta))
  })

  app.post('/services', { preHandler: requireAdmin }, async (req, reply) => {
    const input = parse(createServiceBody, req.body)
    const service = await createService(ctx, actorFromReq(req), input, clientMeta(req))

    return reply.status(201).send(ok({ service: serializeService(service) }))
  })

  app.patch('/services/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const input = parse(updateServiceBody, req.body)
    const service = await updateService(ctx, actorFromReq(req), id, input, clientMeta(req))

    return reply.send(ok({ service: serializeService(service) }))
  })

  app.get('/tax-rates', { preHandler: requireAdmin }, async (req, reply) => {
    const rates = await listTaxRates(ctx, actorFromReq(req))

    return reply.send(ok({ taxRates: rates.map(serializeTaxRate) }))
  })

  app.put('/tax-rates/:code', { preHandler: requireAdmin }, async (req, reply) => {
    const { code } = parse(taxCodeParams, req.params)
    const { ratePercent } = parse(putTaxRateBody, req.body)
    const rate = await putTaxRate(ctx, actorFromReq(req), code, ratePercent, clientMeta(req))

    return reply.send(ok({ taxRate: serializeTaxRate(rate) }))
  })

  app.delete('/tax-rates/:code', { preHandler: requireAdmin }, async (req, reply) => {
    const { code } = parse(taxCodeParams, req.params)

    await deleteTaxRate(ctx, actorFromReq(req), code, clientMeta(req))

    return reply.send(ok({ deleted: true }))
  })
}
