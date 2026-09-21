import { z } from 'zod'

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback)

const csv = z
  .string()
  .default('')
  .transform(value =>
    value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
  )

const schema = z.object({
  // Defaults to production so a forgotten NODE_ENV can never silently disable the hardening checks
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z
    .string()
    .refine(value => /^postgres(ql)?:\/\//.test(value), 'DATABASE_URL must be a postgresql:// connection string'),

  FRONTEND_URL: z.url(),
  CORS_ORIGINS: csv,
  TRUST_PROXY: z.string().default('false'),
  // Shared secret the Next.js server sends as X-Service-Key. Locks the API to that one caller.
  SERVICE_API_KEY: z.string().min(32, 'SERVICE_API_KEY must be at least 32 characters').optional(),

  SESSION_IDLE_SECONDS: positiveInt(8 * 60 * 60),
  SESSION_ABSOLUTE_SECONDS: positiveInt(24 * 60 * 60),
  SESSION_REMEMBER_IDLE_SECONDS: positiveInt(30 * 24 * 60 * 60),
  SESSION_REMEMBER_ABSOLUTE_SECONDS: positiveInt(90 * 24 * 60 * 60),
  SESSION_MAX_PER_USER: positiveInt(10),

  INVITE_TTL_SECONDS: positiveInt(72 * 60 * 60),
  PASSWORD_RESET_TTL_SECONDS: positiveInt(30 * 60),
  AUDIT_RETENTION_DAYS: positiveInt(365),

  LOGIN_WINDOW_SECONDS: positiveInt(15 * 60),
  LOGIN_MAX_FAILS_PER_EMAIL_IP: positiveInt(5),
  LOGIN_MAX_FAILS_PER_EMAIL: positiveInt(25),
  LOGIN_MAX_FAILS_PER_IP: positiveInt(50),

  RATE_LIMIT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(value => value === 'true'),
  RATE_LIMIT_MAX_PER_MINUTE: positiveInt(300),

  PASSWORD_HASH_MEMORY_KIB: positiveInt(19456),
  PASSWORD_HASH_TIME_COST: positiveInt(2),

  JOBS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform(value => value === 'true'),

  STORAGE_DIR: z.string().default('./storage'),
  MAX_UPLOAD_BYTES: positiveInt(10 * 1024 * 1024),

  // Browser origins allowed to POST website forms to /public/leads (comma separated). Empty = server-to-server only.
  PUBLIC_LEAD_ORIGINS: csv,

  // Work rules from the design doc, all overridable.
  LATE_IN_MINUTES: positiveInt(10),
  EARLY_OUT_MINUTES: positiveInt(10),
  OVERTIME_THRESHOLD_MINUTES: positiveInt(15),
  WEEKLY_OVERTIME_MINUTES: positiveInt(40 * 60),
  GEOFENCE_METERS: positiveInt(300),
  MISSING_CLOCK_OUT_HOURS: positiveInt(2),
  NO_SHOW_MINUTES: positiveInt(30),
  CLOCK_IN_EARLY_MINUTES: positiveInt(60),

  ACCOUNTING_PROVIDER: z.enum(['fake']).default('fake'),
  PAYMENT_PROVIDER: z.enum(['fake']).default('fake'),
  STRIPE_WEBHOOK_SECRET: z.string().min(16).optional(),

  MAIL_DRIVER: z.enum(['console', 'smtp', 'memory']).default('console'),
  MAIL_FROM: z.string().default('FilterGO Portal <no-reply@filter-go.com>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform(value => value === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional()
})

export type TrustProxy = boolean | number | string[]

export interface Config {
  nodeEnv: 'development' | 'test' | 'production'
  isProduction: boolean
  host: string
  port: number
  logLevel: string
  databaseUrl: string
  frontendUrl: string
  corsOrigins: string[]
  trustProxy: TrustProxy
  serviceApiKey: string | null
  session: {
    idleSeconds: number
    absoluteSeconds: number
    rememberIdleSeconds: number
    rememberAbsoluteSeconds: number
    maxPerUser: number
  }
  inviteTtlSeconds: number
  passwordResetTtlSeconds: number
  auditRetentionDays: number
  jobs: { enabled: boolean }
  storage: { dir: string; maxUploadBytes: number }
  publicLeadOrigins: string[]
  work: {
    lateInMinutes: number
    earlyOutMinutes: number
    overtimeThresholdMinutes: number
    weeklyOvertimeMinutes: number
    geofenceMeters: number
    missingClockOutHours: number
    noShowMinutes: number
    clockInEarlyMinutes: number
  }
  integrations: { accountingProvider: 'fake'; paymentProvider: 'fake'; stripeWebhookSecret: string | null }
  login: {
    windowSeconds: number
    maxFailsPerEmailIp: number
    maxFailsPerEmail: number
    maxFailsPerIp: number
  }
  rateLimit: { enabled: boolean; maxPerMinute: number }
  passwordHash: { memoryKib: number; timeCost: number }
  mail: {
    driver: 'console' | 'smtp' | 'memory'
    from: string
    smtp: { host: string; port: number; secure: boolean; user?: string; password?: string } | null
  }
}

// `true` would trust every hop and let any client spoof X-Forwarded-For, so it is not accepted.
const parseTrustProxy = (raw: string): TrustProxy => {
  const value = raw.trim().toLowerCase()

  if (value === '' || value === 'false') return false
  if (/^\d+$/.test(value)) return Number(value)
  if (value === 'true') {
    throw new Error('TRUST_PROXY=true is not allowed. Use a hop count (1) or a list of CIDRs (10.0.0.0/8).')
  }

  return raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

const parseTrustProxyOrFalse = (raw: string): TrustProxy => {
  try {
    return parseTrustProxy(raw)
  } catch {
    return false
  }
}

type Env = z.output<typeof schema>

/** Every production / cross-field rule. Collected (not thrown one by one) so the operator sees all problems at once. */
const findProblems = (env: Env): string[] => {
  const problems: string[] = []

  if (env.NODE_ENV === 'production') {
    if (!env.FRONTEND_URL.startsWith('https://')) problems.push('FRONTEND_URL must be https:// in production')
    if (env.MAIL_DRIVER !== 'smtp') problems.push('MAIL_DRIVER must be "smtp" in production (console/memory would leak links)')
    if (!env.RATE_LIMIT_ENABLED) problems.push('RATE_LIMIT_ENABLED cannot be false in production')
    if (env.PASSWORD_HASH_MEMORY_KIB < 19456) problems.push('PASSWORD_HASH_MEMORY_KIB must be >= 19456 in production')
    if (env.PASSWORD_HASH_TIME_COST < 2) problems.push('PASSWORD_HASH_TIME_COST must be >= 2 in production')
    if (!env.SERVICE_API_KEY) problems.push('SERVICE_API_KEY is required in production (generate: openssl rand -base64 48)')

    // Every request arrives via the Next.js server: without this all users would share one IP for rate limiting
    if (parseTrustProxyOrFalse(env.TRUST_PROXY) === false && env.TRUST_PROXY.trim().toLowerCase() !== 'true') {
      problems.push('TRUST_PROXY must be set in production (hop count like 1, or the CIDR of the Next.js server)')
    }
  }

  if (env.MAIL_DRIVER === 'smtp' && !env.SMTP_HOST) problems.push('SMTP_HOST is required when MAIL_DRIVER=smtp')
  if (env.CORS_ORIGINS.includes('*')) problems.push('CORS_ORIGINS cannot contain * (list explicit origins)')
  if (env.SESSION_ABSOLUTE_SECONDS < env.SESSION_IDLE_SECONDS) problems.push('SESSION_ABSOLUTE_SECONDS must be >= SESSION_IDLE_SECONDS')
  if (env.SESSION_REMEMBER_ABSOLUTE_SECONDS < env.SESSION_REMEMBER_IDLE_SECONDS) {
    problems.push('SESSION_REMEMBER_ABSOLUTE_SECONDS must be >= SESSION_REMEMBER_IDLE_SECONDS')
  }

  return problems
}

const toConfig = (env: Env, trustProxy: TrustProxy): Config => ({
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  host: env.HOST,
  port: env.PORT,
  logLevel: env.LOG_LEVEL,
  databaseUrl: env.DATABASE_URL,
  frontendUrl: env.FRONTEND_URL.replace(/\/+$/, ''),
  corsOrigins: env.CORS_ORIGINS,
  trustProxy,
  serviceApiKey: env.SERVICE_API_KEY ?? null,
  session: {
    idleSeconds: env.SESSION_IDLE_SECONDS,
    absoluteSeconds: env.SESSION_ABSOLUTE_SECONDS,
    rememberIdleSeconds: env.SESSION_REMEMBER_IDLE_SECONDS,
    rememberAbsoluteSeconds: env.SESSION_REMEMBER_ABSOLUTE_SECONDS,
    maxPerUser: env.SESSION_MAX_PER_USER
  },
  inviteTtlSeconds: env.INVITE_TTL_SECONDS,
  passwordResetTtlSeconds: env.PASSWORD_RESET_TTL_SECONDS,
  auditRetentionDays: env.AUDIT_RETENTION_DAYS,
  jobs: { enabled: env.JOBS_ENABLED },
  storage: { dir: env.STORAGE_DIR, maxUploadBytes: env.MAX_UPLOAD_BYTES },
  publicLeadOrigins: env.PUBLIC_LEAD_ORIGINS,
  work: {
    lateInMinutes: env.LATE_IN_MINUTES,
    earlyOutMinutes: env.EARLY_OUT_MINUTES,
    overtimeThresholdMinutes: env.OVERTIME_THRESHOLD_MINUTES,
    weeklyOvertimeMinutes: env.WEEKLY_OVERTIME_MINUTES,
    geofenceMeters: env.GEOFENCE_METERS,
    missingClockOutHours: env.MISSING_CLOCK_OUT_HOURS,
    noShowMinutes: env.NO_SHOW_MINUTES,
    clockInEarlyMinutes: env.CLOCK_IN_EARLY_MINUTES
  },
  integrations: {
    accountingProvider: env.ACCOUNTING_PROVIDER,
    paymentProvider: env.PAYMENT_PROVIDER,
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET ?? null
  },
  login: {
    windowSeconds: env.LOGIN_WINDOW_SECONDS,
    maxFailsPerEmailIp: env.LOGIN_MAX_FAILS_PER_EMAIL_IP,
    maxFailsPerEmail: env.LOGIN_MAX_FAILS_PER_EMAIL,
    maxFailsPerIp: env.LOGIN_MAX_FAILS_PER_IP
  },
  rateLimit: { enabled: env.RATE_LIMIT_ENABLED, maxPerMinute: env.RATE_LIMIT_MAX_PER_MINUTE },
  passwordHash: { memoryKib: env.PASSWORD_HASH_MEMORY_KIB, timeCost: env.PASSWORD_HASH_TIME_COST },
  mail: {
    driver: env.MAIL_DRIVER,
    from: env.MAIL_FROM,
    smtp: env.SMTP_HOST
      ? { host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE, user: env.SMTP_USER, password: env.SMTP_PASSWORD }
      : null
  }
})

const formatProblems = (problems: string[]) =>
  `Invalid environment configuration:\n${problems.map(problem => `  - ${problem}`).join('\n')}`

/** Validate an environment map and turn it into a typed, frozen config. Throws with every problem listed. */
export const loadConfig = (source: Record<string, string | undefined> = process.env): Config => {
  // Blank values (KEY=) are treated as "not set" so defaults apply
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined && value !== ''))
  const parsed = schema.safeParse(cleaned)

  if (!parsed.success) {
    throw new Error(formatProblems(parsed.error.issues.map(issue => `${issue.path.join('.') || 'env'}: ${issue.message}`)))
  }

  const problems = findProblems(parsed.data)
  let trustProxy: TrustProxy = false

  try {
    trustProxy = parseTrustProxy(parsed.data.TRUST_PROXY)
  } catch (error) {
    problems.push((error as Error).message)
  }

  if (problems.length > 0) {
    throw new Error(formatProblems(problems))
  }

  return Object.freeze(toConfig(parsed.data, trustProxy))
}
