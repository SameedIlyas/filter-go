import type { AppContext, ClientMeta } from '../../context.js'
import type { Prisma } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import { assertFilesInOrg } from '../../lib/file-refs.js'
import type { Db } from '../../lib/prisma.js'
import { recordAudit } from '../audit/record.js'
import { loadVisibleLead } from './leads.access.js'
import { alreadyConverted } from './leads.errors.js'
import type { SurveyBody } from './leads.schemas.js'

const assertServicesInOrg = async (db: Db, orgId: string, units: SurveyBody['units']): Promise<void> => {
  const ids = [...new Set(units.flatMap(unit => (unit.serviceId ? [unit.serviceId] : [])))]

  if (ids.length === 0) return

  if ((await db.service.count({ where: { id: { in: ids }, orgId } })) !== ids.length) {
    throw Errors.invalidField('units', 'service_not_found', 'One or more services do not exist in your organization.')
  }
}

/** Everything a survey write must check before touching the row. */
const validateSurvey = async (db: Db, orgId: string, body: SurveyBody): Promise<string[]> => {
  const photoFileIds = [...new Set(body.photoFileIds ?? [])]

  await assertServicesInOrg(db, orgId, body.units)
  await assertFilesInOrg(db, orgId, photoFileIds, 'photoFileIds')

  return photoFileIds
}

const surveyData = (body: SurveyBody, photoFileIds: string[]) => ({
  address: body.address,
  units: body.units as Prisma.InputJsonValue,
  accessNotes: body.accessNotes ?? null,
  photoFileIds
})

const summary = (body: SurveyBody, photoFileIds: string[]) => ({ address: body.address, units: body.units.length, photos: photoFileIds.length })

export const createSurvey = (ctx: AppContext, actor: Actor, leadId: string, body: SurveyBody, meta: ClientMeta) =>
  ctx.prisma.$transaction(async tx => {
    const lead = await loadVisibleLead(tx, actor, leadId)

    if (lead.status === 'WON') throw alreadyConverted(lead)

    const photoFileIds = await validateSurvey(tx, actor.orgId, body)
    const survey = await tx.leadSiteSurvey.create({ data: { leadId, ...surveyData(body, photoFileIds) } })

    await recordAudit(tx, actor, { entity: 'lead', entityId: leadId, action: 'survey_saved', diff: { surveyId: survey.id, created: true, ...summary(body, photoFileIds) }, meta })

    return survey
  })

export const replaceSurvey = (ctx: AppContext, actor: Actor, leadId: string, surveyId: string, body: SurveyBody, meta: ClientMeta) =>
  ctx.prisma.$transaction(async tx => {
    const lead = await loadVisibleLead(tx, actor, leadId)

    if (lead.status === 'WON') throw alreadyConverted(lead)

    const existing = await tx.leadSiteSurvey.findFirst({ where: { id: surveyId, leadId }, select: { id: true } })

    if (!existing) throw Errors.notFound('survey')

    const photoFileIds = await validateSurvey(tx, actor.orgId, body)
    const survey = await tx.leadSiteSurvey.update({ where: { id: surveyId }, data: surveyData(body, photoFileIds) })

    await recordAudit(tx, actor, { entity: 'lead', entityId: leadId, action: 'survey_saved', diff: { surveyId, created: false, ...summary(body, photoFileIds) }, meta })

    return survey
  })

export const deleteSurvey = (ctx: AppContext, actor: Actor, leadId: string, surveyId: string, meta: ClientMeta) =>
  ctx.prisma.$transaction(async tx => {
    const lead = await loadVisibleLead(tx, actor, leadId)

    if (lead.status === 'WON') throw alreadyConverted(lead)

    const removed = await tx.leadSiteSurvey.deleteMany({ where: { id: surveyId, leadId } })

    if (removed.count === 0) throw Errors.notFound('survey')

    await recordAudit(tx, actor, { entity: 'lead', entityId: leadId, action: 'survey_deleted', diff: { surveyId }, meta })
  })
