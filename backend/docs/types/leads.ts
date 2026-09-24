/**
 * TypeScript contract for the Leads module: the public website form, the sales pipeline, activities, site surveys
 * and "convert to contract".
 *
 * Types only, no runtime code. Every authenticated response is wrapped in `ApiResponse<T>` from `../api-types`;
 * the `T` below is the `data` member. Lists also carry `meta: PageMeta` next to `data`.
 * Dates: instants are ISO-8601 UTC strings, calendar dates are "YYYY-MM-DD".
 */
import type { PageMeta } from '../api-types.js'

export type { PageMeta }

export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL' | 'WON' | 'LOST'
export type LeadSource = 'WEBSITE' | 'PHONE' | 'REFERRAL' | 'FIELD' | 'MANUAL'
/** Sources a person may pick when creating a lead by hand (WEBSITE is reserved for the public form). */
export type ManualLeadSource = Exclude<LeadSource, 'WEBSITE'>
export type LeadActivityType = 'CALL' | 'EMAIL' | 'SITE_VISIT' | 'NOTE'
export type PaymentTerms = 'NET15' | 'NET30' | 'DUE_ON_RECEIPT'
export type BillingType = 'PER_VISIT' | 'HOURLY' | 'MONTHLY_FIXED'
export type BillingCycle = 'PER_VISIT' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'

// ---------------------------------------------------------------------------
// Public website form: POST /public/leads  (no session, no X-Service-Key)
// ---------------------------------------------------------------------------

export interface PublicLeadRequest {
  /** The organization's public intake key (`leadIntakeKey`, ADMIN can read it from GET /v1/org). Not a secret. */
  orgKey: string
  /** 1..200 chars, one line. */
  companyName: string
  /** 1..200 chars, one line. */
  contactName: string
  /** Valid email, max 254. Lower-cased by the server. */
  email: string
  /** Max 40 chars. Digits are extracted for duplicate detection (at least 7 digits are needed to match). */
  phone?: string
  /** Max 500 chars. */
  address?: string
  /** Max 200 chars. */
  serviceInterest?: string
  /** Max 4000 chars. */
  message?: string
  /** http(s) URL of the page holding the form, max 2048. */
  sourceUrl?: string
  /** Campaign tags: at most 20 keys (letters, digits, `_ . -`), values at most 200 chars. */
  utm?: Record<string, string>
  /** Honeypot. Render it as a hidden input and always leave it empty. Anything else is treated as a bot. */
  website?: string
}

/**
 * Always the same body (HTTP 202) whether the lead was stored, merged into an existing one, ignored as spam or sent
 * with an unknown key. Do not try to infer anything from it. Real validation problems are ordinary 400s.
 */
export interface PublicLeadResponse {
  received: true
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export interface LeadOwner {
  id: string
  name: string
}

export interface Lead {
  id: string
  companyName: string
  contactName: string
  email: string
  phone: string | null
  address: string | null
  source: LeadSource
  sourceUrl: string | null
  /** Campaign tags from the website form. */
  utm: Record<string, string> | null
  serviceInterest: string | null
  message: string | null
  status: LeadStatus
  ownerId: string | null
  /** Null when the lead has no owner (the organization had no active admin when it arrived). */
  owner: LeadOwner | null
  /** Set only while status is LOST. */
  lostReason: string | null
  convertedClientId: string | null
  convertedContractId: string | null
  createdAt: string
  updatedAt: string
}

export interface LeadActivity {
  id: string
  leadId: string
  /** Null for entries the system wrote (a duplicate website submission). */
  userId: string | null
  type: LeadActivityType
  body: string
  at: string
}

export interface SurveyUnit {
  name: string
  serviceId?: string
  /** Canonical decimal string, e.g. "2", "1.5". */
  qty: string
  estMinutes?: number
  notes?: string
}

export interface LeadSurvey {
  id: string
  leadId: string
  address: string
  units: SurveyUnit[]
  accessNotes: string | null
  photoFileIds: string[]
  createdAt: string
}

/** Present once the lead was converted. */
export interface LeadConversion {
  clientId: string | null
  contractId: string
}

/** Query for GET /v1/leads (ADMIN: all leads; SUPERVISOR: only leads they own). */
export interface ListLeadsQuery {
  page?: number
  limit?: number
  status?: LeadStatus
  source?: LeadSource
  ownerId?: string
  /** Case-insensitive match on company, contact name or email. */
  q?: string
  /** Created on or after this calendar day (organization timezone). */
  from?: string
  /** Created on or before this calendar day (organization timezone). */
  to?: string
}

export interface ListLeadsResponse {
  leads: Lead[]
}

export interface CreateLeadRequest {
  companyName: string
  contactName: string
  email: string
  phone?: string
  address?: string
  serviceInterest?: string
  message?: string
  /** Default MANUAL. */
  source?: ManualLeadSource
  /** ADMIN only when it is not the caller. Defaults to the caller. */
  ownerId?: string
}

export interface LeadResponse {
  lead: Lead
}

/** 409 DUPLICATE details: `error.details.context` is `{ leadId }` (the existing open lead) when the caller may see it. */
export interface DuplicateLeadContext {
  leadId?: string
}

export interface LeadDetailResponse {
  lead: Lead
  /** Latest 50, newest first. Use GET /v1/leads/:id/activities for the full history. */
  activities: LeadActivity[]
  surveys: LeadSurvey[]
  conversion: LeadConversion | null
}

/** At least one field. `email` cannot be null. Only an ADMIN may change `ownerId` (the new owner is notified). */
export interface UpdateLeadRequest {
  companyName?: string
  contactName?: string
  email?: string
  phone?: string | null
  address?: string | null
  serviceInterest?: string | null
  ownerId?: string
}

export interface ChangeLeadStatusRequest {
  /** WON is never accepted here: use the convert endpoint. */
  status: Exclude<LeadStatus, 'WON'>
  /** Required (1..1000 chars) when status is LOST, forbidden otherwise. */
  lostReason?: string
}

export interface ListActivitiesQuery {
  page?: number
  limit?: number
}

export interface ListActivitiesResponse {
  activities: LeadActivity[]
}

export interface AddActivityRequest {
  type: LeadActivityType
  /** 1..4000 chars. */
  body: string
}

export interface AddActivityResponse {
  activity: LeadActivity
  /** Fresh copy: a first CALL/EMAIL/SITE_VISIT moves a NEW lead to CONTACTED. */
  lead: Lead
}

// ---------------------------------------------------------------------------
// Surveys: POST /v1/leads/:id/surveys, PUT/DELETE /v1/leads/:id/surveys/:surveyId
// ---------------------------------------------------------------------------

export interface SurveyUnitInput {
  /** 1..200 chars. */
  name: string
  /** A service of your organization. */
  serviceId?: string
  /** Greater than 0, at most 100000, at most 2 decimals. String or number. */
  qty: string | number
  /** 1..1440. */
  estMinutes?: number
  /** Max 1000 chars. */
  notes?: string
}

export interface SurveyRequest {
  /** 1..500 chars. Becomes the site address on conversion. */
  address: string
  /** 1..200 units. */
  units: SurveyUnitInput[]
  /** Max 2000 chars. */
  accessNotes?: string
  /** Ids from POST /v1/files, at most 20. */
  photoFileIds?: string[]
}

export interface SurveyResponse {
  survey: LeadSurvey
}

export interface DeleteSurveyResponse {
  deleted: true
}

// ---------------------------------------------------------------------------
// Convert: POST /v1/leads/:id/convert (ADMIN)
// ---------------------------------------------------------------------------

export interface ConvertLeadRequest {
  /** Defaults to the lead's company name. */
  clientLegalName?: string
  /** Defaults to the lead's email. */
  billingEmail?: string
  /** Default NET30. */
  paymentTerms?: PaymentTerms
  billingType: BillingType
  billingCycle: BillingCycle
  /** "YYYY-MM-DD". */
  startDate: string
  /** "YYYY-MM-DD", not before startDate. */
  endDate?: string
}

export interface ConvertLeadResponse {
  /** Status WON, with `convertedClientId` and `convertedContractId` set. */
  lead: Lead
  clientId: string
  /** One per survey (or a single one from the lead's address). */
  siteIds: string[]
  /** A DRAFT contract whose rates are all 0: an admin must price it before submitting. */
  contractId: string
}

/** 409 LEAD_ALREADY_CONVERTED: `error.details.context`. */
export interface AlreadyConvertedContext {
  clientId: string | null
  contractId: string | null
}
