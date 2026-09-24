/**
 * TypeScript contract for the platform API: users directory, availability, site access, documents and
 * compliance, files, organization, audit events and notifications.
 *
 * Types only, no runtime code. Every response is wrapped in `ApiResponse<T>` from `../api-types`; the `T` below is
 * the `data` member. Lists also carry `meta: PageMeta` next to `data`.
 * Dates: instants are ISO-8601 UTC strings, calendar dates are "YYYY-MM-DD", times of day are "HH:mm".
 */
import type { PageMeta, Role, User, UserStatus } from '../api-types.js'

export type { PageMeta }

// ---------------------------------------------------------------------------
// Users directory: GET /v1/users, GET /v1/users/:id
// ---------------------------------------------------------------------------

/** Query for GET /v1/users (ADMIN, SUPERVISOR). A supervisor only sees people who share a site with them. */
export interface DirectoryQuery {
  /** Default 1. */
  page?: number
  /** Default 20, max 100. */
  limit?: number
  /** Case-insensitive match on name or email, max 100 chars. */
  q?: string
  role?: Role
  status?: UserStatus
  /** Only people with access to this site. 404 when the site is not in the caller's scope. */
  siteId?: string
}

/** `users` is sorted by name. `User.defaultPayRate` is present only for ADMIN and SUPERVISOR viewers. */
export interface DirectoryData {
  users: User[]
}

export interface DirectoryUserData {
  user: User
}

// ---------------------------------------------------------------------------
// Availability: GET / PUT /v1/users/:id/availability
// ---------------------------------------------------------------------------

/** 1 = Monday ... 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export interface AvailabilityWindowInput {
  weekday: Weekday
  /** "HH:mm", 24 hour, wall clock in the organization's timezone. */
  startTime: string
  /** "HH:mm", must be after startTime (use "23:59" for end of day). */
  endTime: string
}

/** Replaces every window. Max 70 windows, no overlap on one weekday (touching windows are fine). `[]` clears. */
export interface ReplaceAvailabilityRequest {
  windows: AvailabilityWindowInput[]
}

export interface AvailabilityWindow extends AvailabilityWindowInput {
  id: string
}

/** Sorted by weekday, then start time. */
export interface AvailabilityData {
  userId: string
  /** The organization's IANA timezone: the zone the times are expressed in. */
  timezone: string
  windows: AvailabilityWindow[]
}

// ---------------------------------------------------------------------------
// Site access: GET / PUT /v1/users/:id/sites
// ---------------------------------------------------------------------------

/** PUT is ADMIN only. Replaces the whole set (max 500, duplicates ignored). 422 for CLIENT_USER targets. */
export interface ReplaceSitesRequest {
  siteIds: string[]
}

export interface SiteRef {
  id: string
  name: string
  clientId: string
  active: boolean
}

/**
 * ADMIN and the user themselves see all of the user's sites. A supervisor only sees the sites they manage
 * themselves (the overlap), so they never learn about other sites.
 */
export interface UserSitesData {
  userId: string
  siteIds: string[]
  sites: SiteRef[]
}

// ---------------------------------------------------------------------------
// Documents: /v1/users/:id/documents
// ---------------------------------------------------------------------------

export interface CreateDocumentRequest {
  /** Free text, trimmed and lower-cased by the server ("Driver License" becomes "driver license"). 1-60 chars. */
  type: string
  /** A file id from POST /v1/files (must belong to your organization). */
  fileId?: string | null
  /** "YYYY-MM-DD". Null or omitted means it never expires. */
  expiresAt?: string | null
  /** Max 1000 chars. */
  notes?: string | null
}

/** At least one field. Only the fields you send change. */
export type UpdateDocumentRequest = Partial<CreateDocumentRequest>

export interface UserDocument {
  id: string
  userId: string
  type: string
  fileId: string | null
  expiresAt: string | null
  notes: string | null
  createdAt: string
}

export interface DocumentData {
  document: UserDocument
}

/** Sorted by expiry date (soonest first, no-expiry last). */
export interface DocumentsData {
  documents: UserDocument[]
}

export interface DeletedData {
  deleted: true
}

// ---------------------------------------------------------------------------
// Compliance: GET /v1/users/:id/compliance, GET /v1/compliance/expiring
// ---------------------------------------------------------------------------

/**
 * EXPIRED   expiresAt is before today (organization calendar day)
 * EXPIRING  expiresAt is today or within the next 30 days
 * VALID     later than that, or no expiry date
 */
export type ComplianceStatus = 'VALID' | 'EXPIRING' | 'EXPIRED'

export interface ComplianceDocument extends UserDocument {
  status: ComplianceStatus
  /** Whole days from today to expiresAt (negative once expired). Null when there is no expiry. */
  daysUntilExpiry: number | null
}

export interface ComplianceData {
  userId: string
  /** "YYYY-MM-DD": the organization's current calendar day the statuses were computed against. */
  today: string
  /** The worst status of all documents. "VALID" when the person has no documents. */
  overall: ComplianceStatus
  documents: ComplianceDocument[]
}

export interface ExpiringQuery {
  page?: number
  limit?: number
  /** 0-3650, default 30. Documents that expire within this many days, plus everything already expired. */
  days?: number
}

export interface ExpiringDocument extends ComplianceDocument {
  user: { id: string; name: string; role: Role }
}

/** Oldest expiry first. People with status DISABLED are left out. */
export interface ExpiringData {
  today: string
  days: number
  documents: ExpiringDocument[]
}

// ---------------------------------------------------------------------------
// Files: POST /v1/files, GET /v1/files/:id
// ---------------------------------------------------------------------------

/**
 * multipart/form-data. Field `file` is required; the optional text field `purpose` (letters, digits, `_`, `-`,
 * max 40) must be sent BEFORE the file part. Allowed: JPEG, PNG, WebP, HEIC/HEIF, PDF (checked by content).
 */
export interface UploadFileFields {
  purpose?: string
}

export interface FileInfo {
  id: string
  /** Sanitised name the client sent (never a path). */
  originalName: string
  /** Decided by the server from the bytes. */
  contentType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'image/heif' | 'application/pdf'
  /** Bytes. */
  size: number
  createdAt: string
}

export interface FileData {
  file: FileInfo
}

// ---------------------------------------------------------------------------
// Organization: /v1/org
// ---------------------------------------------------------------------------

export interface Org {
  id: string
  name: string
  /** IANA zone, e.g. "America/Chicago". */
  timezone: string
  /** ADMIN only. The public key website forms send to identify the organization. */
  leadIntakeKey?: string
  /** ADMIN only. Null means "the first active admin". */
  defaultLeadOwnerId?: string | null
}

export interface OrgData {
  org: Org
}

/** ADMIN only. At least one field. */
export interface UpdateOrgRequest {
  /** 1-120 chars. */
  name?: string
  /** A valid IANA timezone name. */
  timezone?: string
  /** An ACTIVE admin or supervisor of this organization, or null to clear. */
  defaultLeadOwnerId?: string | null
}

// ---------------------------------------------------------------------------
// Audit trail: GET /v1/audit-events (ADMIN)
// ---------------------------------------------------------------------------

export interface AuditEventsQuery {
  page?: number
  limit?: number
  /** e.g. "contract", "shift", "user", "user_document", "org", "file". */
  entity?: string
  entityId?: string
  actorId?: string
  /** e.g. "created", "assign_override", "sites_replaced". */
  action?: string
  /** ISO-8601 instant with timezone, inclusive. */
  from?: string
  /** ISO-8601 instant with timezone, inclusive. */
  to?: string
}

export interface AuditEvent {
  id: string
  at: string
  /** Who did it. Null for system actions. */
  actorId: string | null
  entity: string | null
  entityId: string | null
  action: string | null
  /** What changed: shape depends on the event (often `{ before, after }` or small facts). */
  diff: unknown
  /** "<entity>.<action>" for domain events. */
  type: string
  userId: string | null
  ip: string | null
}

/** Newest first. */
export interface AuditEventsData {
  events: AuditEvent[]
}

// ---------------------------------------------------------------------------
// Notifications: /v1/notifications
// ---------------------------------------------------------------------------

export interface NotificationsQuery {
  page?: number
  limit?: number
  /** "true" lists only unread ones. */
  unread?: 'true' | 'false'
}

export interface Notification {
  id: string
  /** Machine type such as "shift.assigned", "lead.new", "timesheet.no_show". Branch on this. */
  type: string
  title: string
  body: string
  /** Event-specific ids for deep links (shiftId, leadId, ...). */
  data: Record<string, unknown> | null
  readAt: string | null
  createdAt: string
}

/** Newest first. `unreadCount` counts every unread one, whatever the `unread` filter is. */
export interface NotificationsData {
  notifications: Notification[]
  unreadCount: number
}

export interface NotificationReadData {
  notification: Notification
  unreadCount: number
}

export interface ReadAllData {
  /** How many were newly marked read. */
  updated: number
  unreadCount: number
}
