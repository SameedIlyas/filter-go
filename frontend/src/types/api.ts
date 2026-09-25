/**
 * FilterGO portal: TypeScript contract for the auth API.
 *
 * Copy this file into the frontend (e.g. src/types/api.ts). It has no imports and no runtime code.
 * It is type-checked together with the backend, so it cannot silently drift from the real responses.
 */

// ---------------------------------------------------------------------------
// Envelope: EVERY response, success or failure, has this shape
// ---------------------------------------------------------------------------

export interface PageMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface ApiSuccess<T> {
  success: true
  data: T

  /** Only present on paginated lists. */
  meta?: PageMeta
  error: null
}

export interface ApiFailure {
  success: false
  data: null
  error: ApiErrorBody
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure

export interface ApiErrorBody {

  /** Branch on this. Never on `message`, which may be reworded. */
  code: ErrorCode

  /** Safe to show to a human. */
  message: string
  details?: ErrorDetails

  /** Quote this when reporting a problem. Same value as the X-Request-Id response header. */
  requestId: string
}

export interface FieldIssue {

  /** Body field the problem belongs to (e.g. "email", "password", "newPassword"). Empty string = whole body. */
  field: string

  /** Machine code: "required", "too_short", "too_common", "unrecognized_key", ... */
  code: string
  message: string
}

/** A non-blocking problem the caller may override (see ASSIGNMENT_WARNINGS). */
export interface Warning {
  code: string
  message: string
  data?: Record<string, unknown>
}

export interface ErrorDetails {

  /** VALIDATION_ERROR: one entry per invalid field. */
  issues?: FieldIssue[]

  /** TOO_MANY_ATTEMPTS / RATE_LIMITED: seconds until it is worth retrying. */
  retryAfterSeconds?: number

  /** NOT_FOUND / INVALID_STATE / DUPLICATE: the kind of thing this is about ("contract", "shift", ...). */
  entity?: string

  /** INVALID_STATE: the current state, the requested state, and the states that are allowed from here. */
  from?: string
  to?: string
  allowed?: string[]

  /** ASSIGNMENT_WARNINGS: problems the caller may override by resending with overrideWarnings. */
  warnings?: Warning[]

  /** Anything else useful to a human, e.g. the id of the conflicting shift. */
  context?: Record<string, unknown>
}

export type ErrorCode =

  // generic / transport
  | 'VALIDATION_ERROR'
  | 'INVALID_JSON'
  | 'BAD_REQUEST'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'PAYLOAD_TOO_LARGE'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE'
  | 'INVALID_STATE'
  | 'DUPLICATE'
  | 'RATE_LIMITED'
  | 'INVALID_SERVICE_KEY'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR'

  // auth
  | 'UNAUTHENTICATED'
  | 'SESSION_EXPIRED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_DISABLED'
  | 'TOO_MANY_ATTEMPTS'
  | 'FORBIDDEN'
  | 'USER_NOT_FOUND'
  | 'SESSION_NOT_FOUND'
  | 'EMAIL_TAKEN'
  | 'INVALID_TOKEN'
  | 'INVALID_CURRENT_PASSWORD'
  | 'CANNOT_MODIFY_SELF'
  | 'USER_NOT_ACTIVATED'

  // files
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE_TYPE'

  // contracts
  | 'CONTRACT_NOT_EDITABLE'
  | 'CONTRACT_NOT_ACTIVE'

  // scheduling
  | 'SCHEDULE_LOCKED'
  | 'SCHEDULE_OVERLAP'
  | 'SHIFT_OVERLAP'
  | 'ASSIGNMENT_WARNINGS'

  // timesheets
  | 'CLOCK_STATE'
  | 'CLOCK_WINDOW'

  // invoices
  | 'INVOICE_NOT_EDITABLE'
  | 'NOTHING_TO_INVOICE'
  | 'WEBHOOK_SIGNATURE_INVALID'
  | 'INTEGRATION_ERROR'

  // leads
  | 'LEAD_ALREADY_CONVERTED'

// ---------------------------------------------------------------------------
// Domain objects
// ---------------------------------------------------------------------------

/**
 * ADMIN       everything in the organization, including contracts, rates and invoices
 * SUPERVISOR  the sites they manage: schedules, assignment, timesheet approval (sees pay rates, never bill rates)
 * FIELD_USER  own shifts, clock in/out, work logs, extra shifts (sees no rates)
 * CLIENT_USER read-only portal for their own client's sites, completed work and invoices
 */
export type Role = 'ADMIN' | 'SUPERVISOR' | 'FIELD_USER' | 'CLIENT_USER'
export type EmploymentType = 'EMPLOYEE' | 'CONTRACTOR'

/**
 * INVITED  = admin invited them, they have not chosen a password yet (cannot log in)
 * ACTIVE   = normal
 * DISABLED = blocked by an admin (cannot log in, all sessions were revoked)
 */
export type UserStatus = 'INVITED' | 'ACTIVE' | 'DISABLED'

export interface User {

  /** UUID string. NOT a number: the template's SessionUser.id (number) must change to string. */
  id: string

  /** The organization (tenant) the user belongs to. */
  orgId: string
  name: string
  email: string

  /** https URL or null. Fall back to an initials avatar when null. */
  image: string | null
  phone: string | null
  role: Role
  status: UserStatus
  employmentType: EmploymentType

  /** "YYYY-MM-DD" or null. */
  hiredAt: string | null

  /** Set for CLIENT_USER only: the client whose data they may read. */
  clientId: string | null

  /** Money string like "22.00". ONLY present when the viewer is an ADMIN or SUPERVISOR. */
  defaultPayRate?: string | null

  /** ISO-8601 UTC timestamp. */
  createdAt: string

  /** ISO-8601 UTC timestamp, or null if they never signed in. */
  lastLoginAt: string | null
}

/** One signed-in device / browser. */
export interface SessionInfo {
  id: string
  createdAt: string
  lastUsedAt: string

  /** Hard limit. Use this as the cookie expiry. */
  expiresAt: string

  /** Session also ends if unused past this moment. Moves forward while the user is active. */
  idleExpiresAt: string
  remember: boolean
  ip: string | null
  userAgent: string | null

  /** True for the session that made this request. */
  current: boolean
}

/** Returned once, by login / accept-invite. `token` is a secret: store it only in an httpOnly cookie. */
export interface IssuedSession {
  token: string
  id: string
  expiresAt: string
  idleExpiresAt: string
  remember: boolean
}

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

export interface LoginRequest {
  email: string

  /** 1-128 characters. Do NOT apply the "new password" policy here. */
  password: string

  /** Default false. true = long-lived session ("Remember me"). */
  rememberMe?: boolean
}

export interface VerifyTokenRequest {
  token: string
  purpose: 'invite' | 'password_reset'
}

export interface AcceptInviteRequest {
  token: string
  password: string

  /** Optional: lets the invitee correct their name. */
  name?: string
}

export interface ForgotPasswordRequest {
  email: string
}

export interface ResetPasswordRequest {
  token: string
  password: string
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

export interface UpdateProfileRequest {
  name?: string
  phone?: string | null

  /** https URL, or null to clear. */
  image?: string | null
}

export interface InviteUserRequest {
  email: string
  name: string

  /** Default FIELD_USER. */
  role?: Role

  /** REQUIRED for CLIENT_USER, forbidden for every other role. */
  clientId?: string
  phone?: string
  employmentType?: EmploymentType

  /** Money string, e.g. "22.00". */
  defaultPayRate?: string

  /** "YYYY-MM-DD" */
  hiredAt?: string
}

export interface UpdateUserRequest {
  name?: string
  role?: Role
  clientId?: string | null
  phone?: string | null
  employmentType?: EmploymentType
  defaultPayRate?: string | null
  hiredAt?: string | null

  /** Only ACTIVE <-> DISABLED. INVITED can't be set. */
  status?: 'ACTIVE' | 'DISABLED'
}

export interface ListUsersQuery {

  /** Default 1. */
  page?: number

  /** Default 20, max 100. */
  limit?: number

  /** Case-insensitive match on name or email. */
  q?: string
  role?: Role
  status?: UserStatus
  clientId?: string
}

// ---------------------------------------------------------------------------
// Response `data` payloads
// ---------------------------------------------------------------------------

/** POST /v1/auth/login and POST /v1/auth/accept-invite */
export interface LoginData {
  user: User
  session: IssuedSession
}

/** GET /v1/auth/me */
export interface MeData {
  user: User
  session: SessionInfo
}

/** PATCH /v1/auth/me */
export interface UserData {
  user: User
}

export interface MessageData {
  message: string
}

/** POST /v1/auth/verify-token */
export interface VerifyTokenData {
  purpose: 'INVITE' | 'PASSWORD_RESET'
  email: string
  name: string
  expiresAt: string
}

/** POST /v1/auth/logout-all and POST /v1/admin/users/:id/revoke-sessions */
export interface RevokedData {
  revoked: number
}

/** POST /v1/auth/change-password */
export interface ChangePasswordData extends MessageData {
  otherSessionsRevoked: number
}

/** GET /v1/auth/sessions */
export interface SessionsData {
  sessions: SessionInfo[]
}

/** DELETE /v1/auth/sessions/:id */
export interface RevokeSessionData extends MessageData {

  /** True if the revoked session was the caller's own (so they are now signed out). */
  wasCurrent: boolean
}

/** POST /v1/admin/users/invite */
export interface InviteData {
  user: User

  /** false = user was created but the mail server failed. Ask the admin to try again. */
  emailSent: boolean
}

/** GET /v1/admin/users  (ApiSuccess also carries `meta: PageMeta`) */
export interface UsersData {
  users: User[]
}
