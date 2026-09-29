import type { EmploymentType, Role, User, UserStatus } from './api'

export type { EmploymentType, Role, User, UserStatus }

export type UserFilters = {
  q?: string
  role?: Role
  status?: UserStatus
  siteId?: string
  page?: number
  limit?: number
}

export type UserList = {
  users: User[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}

export type InviteUserInput = {
  email: string
  name: string
  role: Role
  clientId?: string
  phone?: string
  employmentType?: EmploymentType
  defaultPayRate?: string
  hiredAt?: string
}

export type UpdateUserInput = {
  name?: string
  role?: Role
  clientId?: string | null
  status?: 'ACTIVE' | 'DISABLED'
  phone?: string | null
  employmentType?: EmploymentType
  defaultPayRate?: string | null
  hiredAt?: string | null
}

/** Weekday 1 = Monday … 7 = Sunday; times are "HH:MM" in the organization's timezone. */
export type AvailabilityWindow = {
  id?: string
  weekday: number
  startTime: string
  endTime: string
}

export type Availability = {
  userId: string
  timezone: string
  windows: AvailabilityWindow[]
}

export type SiteRef = {
  id: string
  name: string
  clientId: string
  active: boolean
}

export type UserSites = {
  userId: string
  siteIds: string[]
  sites: SiteRef[]
}

export type UserDocument = {
  id: string
  userId: string
  type: string
  fileId: string | null

  /** "YYYY-MM-DD" or null when it never expires. */
  expiresAt: string | null
  notes: string | null
  createdAt: string
}

export type ComplianceStatus = 'VALID' | 'EXPIRING' | 'EXPIRED'

export type ComplianceDocument = UserDocument & {
  status: ComplianceStatus
  daysUntilExpiry: number | null
}

export type UserCompliance = {
  userId: string
  today: string
  overall: ComplianceStatus
  documents: ComplianceDocument[]
}

export type DocumentInput = {
  type: string
  expiresAt?: string | null
  notes?: string | null
}
