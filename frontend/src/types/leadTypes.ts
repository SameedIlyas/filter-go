import type { PageMeta } from '@/types/api'

export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL' | 'WON' | 'LOST'
export type LeadSource = 'WEBSITE' | 'PHONE' | 'REFERRAL' | 'FIELD' | 'MANUAL'
export type ManualLeadSource = Exclude<LeadSource, 'WEBSITE'>
export type LeadActivityType = 'CALL' | 'EMAIL' | 'SITE_VISIT' | 'NOTE'

export type Lead = {
  id: string
  companyName: string
  contactName: string
  email: string
  phone: string | null
  address: string | null
  source: LeadSource
  sourceUrl: string | null
  utm: Record<string, string> | null
  serviceInterest: string | null
  message: string | null
  status: LeadStatus
  ownerId: string | null
  owner: { id: string; name: string } | null
  lostReason: string | null
  convertedClientId: string | null
  convertedContractId: string | null
  createdAt: string
  updatedAt: string
}

export type LeadActivity = {
  id: string
  leadId: string
  userId: string | null
  type: LeadActivityType
  body: string
  at: string
}

export type SurveyUnit = {
  name: string
  serviceId?: string
  qty: string
  estMinutes?: number
  notes?: string
}

export type LeadSurvey = {
  id: string
  leadId: string
  address: string
  units: SurveyUnit[]
  accessNotes: string | null
  photoFileIds: string[]
  createdAt: string
}

export type LeadDetail = {
  lead: Lead
  activities: LeadActivity[]
  surveys: LeadSurvey[]
  conversion: { clientId: string | null; contractId: string } | null
}

export type LeadFilters = {
  page?: number
  limit?: number
  status?: LeadStatus
  source?: LeadSource
  ownerId?: string
  q?: string
  from?: string
  to?: string
}

export type LeadList = { leads: Lead[]; meta: PageMeta }

export type CreateLeadInput = {
  companyName: string
  contactName: string
  email: string
  phone?: string
  address?: string
  serviceInterest?: string
  message?: string
  source?: ManualLeadSource
  ownerId?: string
}

export type UpdateLeadInput = {
  companyName?: string
  contactName?: string
  email?: string
  phone?: string | null
  address?: string | null
  serviceInterest?: string | null
  ownerId?: string
}

export type SurveyInput = {
  address: string
  units: Array<{ name: string; qty: string; estMinutes?: number; notes?: string }>
  accessNotes?: string
}

export type ConvertLeadInput = {
  clientLegalName?: string
  billingEmail?: string
  paymentTerms: 'NET15' | 'NET30' | 'DUE_ON_RECEIPT'
  billingType: 'PER_VISIT' | 'HOURLY' | 'MONTHLY_FIXED'
  billingCycle: 'PER_VISIT' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'
  startDate: string
  endDate?: string
}

export type ConvertLeadResult = { lead: Lead; clientId: string; siteIds: string[]; contractId: string }

export type OwnerOption = { id: string; name: string; email: string; role: string }
