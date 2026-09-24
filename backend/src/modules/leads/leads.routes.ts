import type { FastifyPluginAsync } from 'fastify'

import type { Lead } from '../../generated/prisma/client.js'
import { ok } from '../../lib/response.js'
import { parse } from '../../lib/validation.js'
import { actorFromReq, clientMeta, requireRoles } from '../../plugins/auth.js'
import { convertLead } from './leads.convert.service.js'
import { loadOwnerMap } from './leads.owner.js'
import {
  activitiesQuery,
  activityBody,
  convertBody,
  createBody,
  leadParams,
  listQuery,
  patchBody,
  statusBody,
  surveyBody,
  surveyParams
} from './leads.schemas.js'
import { serializeActivity, serializeConversion, serializeLead, serializeSurvey } from './leads.serializers.js'
import { addActivity, changeLeadStatus, createLead, getLeadDetail, listActivities, listLeads, updateLead } from './leads.service.js'
import { createSurvey, deleteSurvey, replaceSurvey } from './leads.surveys.service.js'

/**
 * Leads module (authenticated): pipeline, activities, surveys, convert-to-contract.
 * Registered in app.ts with prefix "/v1". Every route is guarded; a lead outside the caller's organization or
 * visibility (a supervisor sees only the leads they own) is a 404, never a 403.
 */
export const leadRoutes: FastifyPluginAsync = async app => {
  const ctx = app.ctx
  const staff = { preHandler: requireRoles('ADMIN', 'SUPERVISOR') }
  const adminOnly = { preHandler: requireRoles('ADMIN') }

  const present = async (orgId: string, leads: Lead[]) => {
    const owners = await loadOwnerMap(ctx.prisma, orgId, leads.map(lead => lead.ownerId))

    return leads.map(lead => serializeLead(lead, owners))
  }

  app.get('/leads', staff, async (req, reply) => {
    const query = parse(listQuery, req.query)
    const actor = actorFromReq(req)
    const { items, meta } = await listLeads(ctx, actor, query)

    return reply.send(ok({ leads: await present(actor.orgId, items) }, meta))
  })

  app.post('/leads', staff, async (req, reply) => {
    const actor = actorFromReq(req)
    const lead = await createLead(ctx, actor, parse(createBody, req.body), clientMeta(req))

    return reply.status(201).send(ok({ lead: (await present(actor.orgId, [lead]))[0] }))
  })

  app.get('/leads/:id', staff, async (req, reply) => {
    const { id } = parse(leadParams, req.params)
    const actor = actorFromReq(req)
    const lead = await getLeadDetail(ctx, actor, id)

    return reply.send(
      ok({
        lead: (await present(actor.orgId, [lead]))[0],
        activities: lead.activities.map(serializeActivity),
        surveys: lead.surveys.map(serializeSurvey),
        conversion: serializeConversion(lead)
      })
    )
  })

  app.patch('/leads/:id', staff, async (req, reply) => {
    const { id } = parse(leadParams, req.params)
    const actor = actorFromReq(req)
    const lead = await updateLead(ctx, actor, id, parse(patchBody, req.body), clientMeta(req))

    return reply.send(ok({ lead: (await present(actor.orgId, [lead]))[0] }))
  })

  app.post('/leads/:id/status', staff, async (req, reply) => {
    const { id } = parse(leadParams, req.params)
    const actor = actorFromReq(req)
    const lead = await changeLeadStatus(ctx, actor, id, parse(statusBody, req.body), clientMeta(req))

    return reply.send(ok({ lead: (await present(actor.orgId, [lead]))[0] }))
  })

  app.get('/leads/:id/activities', staff, async (req, reply) => {
    const { id } = parse(leadParams, req.params)
    const { items, meta } = await listActivities(ctx, actorFromReq(req), id, parse(activitiesQuery, req.query))

    return reply.send(ok({ activities: items.map(serializeActivity) }, meta))
  })

  app.post('/leads/:id/activities', staff, async (req, reply) => {
    const { id } = parse(leadParams, req.params)
    const actor = actorFromReq(req)
    const { activity, lead } = await addActivity(ctx, actor, id, parse(activityBody, req.body), clientMeta(req))

    return reply.status(201).send(ok({ activity: serializeActivity(activity), lead: (await present(actor.orgId, [lead]))[0] }))
  })

  app.post('/leads/:id/surveys', staff, async (req, reply) => {
    const { id } = parse(leadParams, req.params)
    const survey = await createSurvey(ctx, actorFromReq(req), id, parse(surveyBody, req.body), clientMeta(req))

    return reply.status(201).send(ok({ survey: serializeSurvey(survey) }))
  })

  app.put('/leads/:id/surveys/:surveyId', staff, async (req, reply) => {
    const { id, surveyId } = parse(surveyParams, req.params)
    const survey = await replaceSurvey(ctx, actorFromReq(req), id, surveyId, parse(surveyBody, req.body), clientMeta(req))

    return reply.send(ok({ survey: serializeSurvey(survey) }))
  })

  app.delete('/leads/:id/surveys/:surveyId', staff, async (req, reply) => {
    const { id, surveyId } = parse(surveyParams, req.params)

    await deleteSurvey(ctx, actorFromReq(req), id, surveyId, clientMeta(req))

    return reply.send(ok({ deleted: true }))
  })

  app.post('/leads/:id/convert', adminOnly, async (req, reply) => {
    const { id } = parse(leadParams, req.params)
    const actor = actorFromReq(req)
    const result = await convertLead(ctx, actor, id, parse(convertBody, req.body), clientMeta(req))

    return reply.status(201).send(ok({ lead: (await present(actor.orgId, [result.lead]))[0], clientId: result.clientId, siteIds: result.siteIds, contractId: result.contractId }))
  })
}
