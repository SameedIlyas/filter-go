import type { Lead, LeadActivity, LeadSiteSurvey } from '../../generated/prisma/client.js'
import { storedUnits } from './leads.schemas.js'

export interface OwnerRef {
  id: string
  name: string
}

export type OwnerMap = ReadonlyMap<string, OwnerRef>

export const serializeLead = (lead: Lead, owners: OwnerMap) => ({
  id: lead.id,
  companyName: lead.companyName,
  contactName: lead.contactName,
  email: lead.email,
  phone: lead.phone,
  address: lead.address,
  source: lead.source,
  sourceUrl: lead.sourceUrl,
  utm: lead.utm,
  serviceInterest: lead.serviceInterest,
  message: lead.message,
  status: lead.status,
  ownerId: lead.ownerId,
  owner: (lead.ownerId && owners.get(lead.ownerId)) || null,
  lostReason: lead.lostReason,
  convertedClientId: lead.convertedClientId,
  convertedContractId: lead.convertedContractId,
  createdAt: lead.createdAt.toISOString(),
  updatedAt: lead.updatedAt.toISOString()
})

export const serializeActivity = (activity: LeadActivity) => ({
  id: activity.id,
  leadId: activity.leadId,
  userId: activity.userId,
  type: activity.type,
  body: activity.body,
  at: activity.at.toISOString()
})

export const serializeSurvey = (survey: LeadSiteSurvey) => {
  const units = storedUnits.safeParse(survey.units)

  return {
    id: survey.id,
    leadId: survey.leadId,
    address: survey.address,
    units: units.success ? units.data : [],
    accessNotes: survey.accessNotes,
    photoFileIds: survey.photoFileIds,
    createdAt: survey.createdAt.toISOString()
  }
}

export const serializeConversion = (lead: Pick<Lead, 'convertedClientId' | 'convertedContractId'>) =>
  lead.convertedContractId ? { clientId: lead.convertedClientId, contractId: lead.convertedContractId } : null
