import type { PageMeta } from '@/types/api'

export type ContractStatus = 'DRAFT' | 'PENDING_SIGNATURE' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'CANCELLED'
export type BillingType = 'PER_VISIT' | 'HOURLY' | 'MONTHLY_FIXED'
export type BillingCycle = 'PER_VISIT' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'
export type PaymentTerms = 'NET15' | 'NET30' | 'DUE_ON_RECEIPT'
export type CoveragePattern = 'WEEKLY' | 'INTERVAL' | 'AD_HOC'

// ---- catalog ----------------------------------------------------------------------

export type Service = {
  id: string
  name: string
  description: string | null
  active: boolean
  createdAt: string
}

export type TaxRate = { code: string; ratePercent: string }

export type Client = {
  id: string
  legalName: string
  billingEmail: string
  billingAddress: string | null
  paymentTerms: PaymentTerms
  active: boolean
  accountingRef?: string | null
  stripeCustomerId?: string | null
  createdAt: string
  updatedAt: string
}

export type Site = {
  id: string
  clientId: string
  name: string
  address: string
  lat: number | null
  lng: number | null
  timezone: string | null
  accessNotes: string | null
  contactName: string | null
  contactPhone: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

// ---- contracts --------------------------------------------------------------------

export type ContractSummary = {
  id: string
  contractNumber: string
  version: number
  status: ContractStatus
  client: { id: string; legalName: string }
  startDate: string
  endDate: string | null
  autoRenew: boolean
  billingType: BillingType
  billingCycle: BillingCycle
  signedAt: string | null
  signedBy: string | null
  documentFileId: string | null
  supersedesContractId: string | null
  leadId: string | null
  createdAt: string
  updatedAt: string
}

/** Money is a string with two decimals. `billRate` is ADMIN-only and `payRate` ADMIN/SUPERVISOR-only: absent otherwise. */
export type ContractLine = {
  id: string
  siteId: string
  serviceId: string | null
  description: string
  qty: string
  billRate?: string
  payRate?: string | null
  estMinutes: number | null
  taxCode: string | null
}

export type ContractCoverage = {
  id: string
  siteId: string
  patternType: CoveragePattern

  /** 1 = Monday ... 7 = Sunday. WEEKLY only. */
  weekdays: number[]

  /** "HH:mm", site-local. WEEKLY only. */
  timeStart: string | null
  timeEnd: string | null
  intervalDays: number | null
  visitsPerPeriod: number | null
}

export type ContractDetail = ContractSummary & {
  lines: ContractLine[]
  coverage: ContractCoverage[]
  versions: Array<{ id: string; version: number; status: ContractStatus }>
}

export type ContractFilters = {
  page?: number
  limit?: number
  status?: ContractStatus
  clientId?: string
  q?: string
  latestOnly?: 'true' | 'false'
}

export type ContractList = { contracts: ContractSummary[]; meta: PageMeta }

export type LineInput = {
  siteId: string
  serviceId?: string | null
  description: string
  qty?: string
  billRate: string
  payRate?: string | null
  estMinutes?: number | null
  taxCode?: string | null
}

export type CoverageInput = {
  siteId: string
  patternType: CoveragePattern
  weekdays?: number[]
  timeStart?: string | null
  timeEnd?: string | null
  intervalDays?: number | null
  visitsPerPeriod?: number | null
}

export type ContractHeaderInput = {
  startDate: string
  endDate?: string | null
  autoRenew?: boolean
  billingType: BillingType
  billingCycle: BillingCycle
}

export type CreateContractInput = ContractHeaderInput & {
  clientId: string
  lines: LineInput[]
  coverage: CoverageInput[]
}

export type SignContractInput = { signedBy: string; signedAt?: string; documentFileId?: string | null }

export type CreateClientInput = {
  legalName: string
  billingEmail: string
  billingAddress?: string | null
  paymentTerms?: PaymentTerms
}

export type SiteInput = {
  name: string
  address: string
  timezone?: string | null
  accessNotes?: string | null
  contactName?: string | null
  contactPhone?: string | null
}

export type UpdateClientInput = Partial<CreateClientInput> & { active?: boolean }

export type UpdateSiteInput = Partial<SiteInput> & { active?: boolean }

export type AuditEvent = {
  id: string
  at: string
  actorId: string | null
  entity: string | null
  entityId: string | null
  action: string | null
  diff: Record<string, unknown> | null
  type: string
}
