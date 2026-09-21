/**
 * Every error the API can return has a stable machine-readable `code`.
 * The frontend must branch on `code`, never on `message` (messages may be reworded).
 *
 * The list is closed on purpose: docs/api-types.ts is compile-checked against it. To add a code, add it
 * here AND in docs/api-types.ts.
 */
export type ErrorCode =
  // ---- generic / transport
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
  // ---- auth
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
  // ---- files
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE_TYPE'
  // ---- contracts
  | 'CONTRACT_NOT_EDITABLE'
  | 'CONTRACT_NOT_ACTIVE'
  // ---- scheduling
  | 'SCHEDULE_LOCKED'
  | 'SCHEDULE_OVERLAP'
  | 'SHIFT_OVERLAP'
  | 'ASSIGNMENT_WARNINGS'
  // ---- timesheets
  | 'CLOCK_STATE'
  | 'CLOCK_WINDOW'
  // ---- invoices
  | 'INVOICE_NOT_EDITABLE'
  | 'NOTHING_TO_INVOICE'
  | 'WEBHOOK_SIGNATURE_INVALID'
  | 'INTEGRATION_ERROR'
  // ---- leads
  | 'LEAD_ALREADY_CONVERTED'

export interface FieldIssue {
  field: string
  code: string
  message: string
}

/** A non-blocking problem found while validating an action. Shown to the user, who may override it. */
export interface Warning {
  code: string
  message: string
  /** Extra machine-readable context, e.g. { documentType: "license", expiresAt: "2026-10-01" }. */
  data?: Record<string, unknown>
}

export interface ErrorDetails {
  /** VALIDATION_ERROR: one entry per invalid field. */
  issues?: FieldIssue[]
  /** TOO_MANY_ATTEMPTS / RATE_LIMITED: seconds until it is worth retrying. */
  retryAfterSeconds?: number
  /** NOT_FOUND / INVALID_STATE / ...: which kind of thing this is about ("contract", "shift", ...). */
  entity?: string
  /** INVALID_STATE: the current state and the state that was requested. */
  from?: string
  to?: string
  /** INVALID_STATE: the states the entity could move to from `from`. */
  allowed?: string[]
  /** ASSIGNMENT_WARNINGS and friends: things the caller may override. */
  warnings?: Warning[]
  /** Anything else that helps a human, e.g. the conflicting shift id. */
  context?: Record<string, unknown>
}

export class AppError extends Error {
  // `statusCode` (not `status`) so Fastify and its plugins recognise it natively
  readonly statusCode: number
  readonly code: ErrorCode
  readonly details?: ErrorDetails
  readonly headers?: Record<string, string>

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    options: { details?: ErrorDetails; headers?: Record<string, string> } = {}
  ) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = options.details
    this.headers = options.headers
  }
}

const label = (entity: string) => entity.charAt(0).toUpperCase() + entity.slice(1)

export const Errors = {
  validation: (issues: FieldIssue[]) =>
    new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', { details: { issues } }),

  /** One-field convenience for business-rule validation failures. */
  invalidField: (field: string, code: string, message: string) =>
    new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', { details: { issues: [{ field, code, message }] } }),

  invalidJson: () => new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON.'),

  unauthenticated: () => new AppError(401, 'UNAUTHENTICATED', 'You are not signed in.'),

  sessionExpired: () => new AppError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.'),

  invalidCredentials: () => new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.'),

  accountDisabled: () =>
    new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled. Contact your administrator.'),

  tooManyAttempts: (retryAfterSeconds: number) =>
    new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many failed attempts. Try again later.', {
      details: { retryAfterSeconds },
      headers: { 'retry-after': String(retryAfterSeconds) }
    }),

  invalidServiceKey: () =>
    new AppError(403, 'INVALID_SERVICE_KEY', 'Missing or wrong X-Service-Key. This is a server configuration problem.'),

  forbidden: () => new AppError(403, 'FORBIDDEN', 'You do not have permission to do this.'),

  /**
   * Use for a missing thing AND for a thing outside the caller's organization / site scope:
   * the two must look identical so ids can't be probed across tenants.
   */
  notFound: (entity?: string) =>
    new AppError(404, 'NOT_FOUND', entity ? `${label(entity)} not found.` : 'Resource not found.', {
      details: entity ? { entity } : undefined
    }),

  userNotFound: () => new AppError(404, 'USER_NOT_FOUND', 'User not found.'),

  sessionNotFound: () => new AppError(404, 'SESSION_NOT_FOUND', 'Session not found.'),

  emailTaken: () => new AppError(409, 'EMAIL_TAKEN', 'A user with this email already exists.'),

  // One code and one message for unknown, used, expired and wrong-purpose tokens so it can't be used as an oracle
  invalidToken: () => new AppError(400, 'INVALID_TOKEN', 'This link is invalid or has expired.'),

  invalidCurrentPassword: () => new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect.'),

  cannotModifySelf: () =>
    new AppError(409, 'CANNOT_MODIFY_SELF', 'You cannot change your own role or status. Ask another admin.'),

  userNotActivated: () =>
    new AppError(409, 'USER_NOT_ACTIVATED', 'This user has not accepted their invite yet. Send a new invite instead.'),

  /** A state-machine violation: the entity is in `from` and can only go to `allowed`. */
  invalidState: (entity: string, from: string, to: string, allowed: string[] = []) =>
    new AppError(409, 'INVALID_STATE', `${label(entity)} is ${from.toLowerCase()} and cannot become ${to.toLowerCase()}.`, {
      details: { entity, from, to, allowed }
    }),

  conflict: (message: string, context?: Record<string, unknown>) =>
    new AppError(409, 'CONFLICT', message, { details: context ? { context } : undefined }),

  duplicate: (entity: string, message?: string) =>
    new AppError(409, 'DUPLICATE', message ?? `${label(entity)} already exists.`, { details: { entity } }),

  unprocessable: (message: string, context?: Record<string, unknown>) =>
    new AppError(422, 'UNPROCESSABLE', message, { details: context ? { context } : undefined }),

  internal: () => new AppError(500, 'INTERNAL_ERROR', 'Something went wrong on our side. Please try again.')
}
