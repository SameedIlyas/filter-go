import { randomUUID, timingSafeEqual } from 'node:crypto'

import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import type { FastifyInstance, FastifyReply, FastifyServerOptions } from 'fastify'

import type { Config } from './config/env.js'
import type { AppContext } from './context.js'
import { createBackgroundTasks } from './lib/background.js'
import { AppError, Errors } from './lib/errors.js'
import { createPasswordHasher } from './lib/password.js'
import type { PasswordHasher } from './lib/password.js'
import type { PrismaClient } from './lib/prisma.js'
import { fail, ok } from './lib/response.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { contractRoutes } from './modules/contracts/contracts.routes.js'
import { fileRoutes } from './modules/files/files.routes.js'
import { invoiceRoutes } from './modules/invoices/invoices.routes.js'
import { webhookRoutes } from './modules/invoices/webhooks.routes.js'
import { leadRoutes } from './modules/leads/leads.routes.js'
import { publicLeadRoutes } from './modules/leads/leads.public.routes.js'
import { notificationRoutes } from './modules/notifications/notifications.routes.js'
import { orgRoutes } from './modules/org/org.routes.js'
import { schedulingRoutes } from './modules/scheduling/scheduling.routes.js'
import { timesheetRoutes } from './modules/timesheets/timesheets.routes.js'
import { userRoutes } from './modules/users/users.routes.js'
import { createMailer } from './modules/mail/mailer.js'
import type { Mailer } from './modules/mail/mailer.js'
import { adminUserRoutes } from './modules/users/admin.routes.js'
import { registerErrorHandling } from './plugins/error-handler.js'

const BODY_LIMIT_BYTES = 16 * 1024

/** Paths called directly by third parties (website forms, Stripe): authenticated some other way, so no X-Service-Key. */
const SERVICE_KEY_EXEMPT_PREFIXES = ['/public/', '/webhooks/']

declare module 'fastify' {
  interface FastifyRequest {
    /** Exact JSON text of the request body. Webhook signature checks need the original bytes, not re-serialised JSON. */
    rawBody?: string
  }
}
const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/

export interface AppDependencies {
  config: Config
  prisma: PrismaClient
  /** Defaults to the driver named in config. Tests inject an in-memory one. */
  mailer?: Mailer
  hasher?: PasswordHasher
}

export interface BuiltApp {
  app: FastifyInstance
  ctx: AppContext
}

// Fastify's typings omit the numeric form, so express "trust N hops" as the equivalent function
const toTrustProxy = (value: Config['trustProxy']): FastifyServerOptions['trustProxy'] =>
  typeof value === 'number' ? (_address: string, hop: number) => hop < value : value

export const buildApp = async ({ config, prisma, mailer, hasher }: AppDependencies): Promise<BuiltApp> => {
  const options: FastifyServerOptions = {
    logger:
      config.nodeEnv === 'test'
        ? false
        : { level: config.logLevel, redact: ['req.headers.authorization', 'req.headers.cookie'] },
    trustProxy: toTrustProxy(config.trustProxy),
    bodyLimit: BODY_LIMIT_BYTES,
    // Errors raised before routing (e.g. a malformed URL) bypass setErrorHandler, so wrap them here too
    frameworkErrors: (error, req, reply) => {
      const response: FastifyReply = reply as unknown as FastifyReply

      return response.status(error.statusCode ?? 400).send(fail('BAD_REQUEST', 'The request could not be processed.', req.id))
    },
    // Only accept a caller-supplied request id if it looks harmless; otherwise mint our own
    genReqId: req => {
      const supplied = req.headers['x-request-id']

      return typeof supplied === 'string' && REQUEST_ID.test(supplied) ? supplied : randomUUID()
    }
  }

  const app = Fastify(options)

  const ctx: AppContext = {
    config,
    prisma,
    mailer: mailer ?? createMailer(config, app.log),
    hasher: hasher ?? createPasswordHasher(config.passwordHash),
    background: createBackgroundTasks(app.log),
    log: app.log
  }

  app.decorate('ctx', ctx)
  app.decorateRequest('auth', undefined)

  // ---- security headers & CORS ------------------------------------------------
  await app.register(helmet)
  await app.register(cors, {
    // Empty list = no CORS headers at all: browsers on other origins cannot call us directly
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id', 'X-Service-Key'],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    credentials: false,
    maxAge: 600
  })

  // ---- service key: only our own Next.js server may call the API --------------
  if (config.serviceApiKey) {
    const expected = Buffer.from(config.serviceApiKey)

    app.addHook('onRequest', async req => {
      const path = req.url.split('?')[0] ?? ''

      if (req.method === 'OPTIONS' || path === '/health' || path === '/health/ready') return
      if (SERVICE_KEY_EXEMPT_PREFIXES.some(prefix => path.startsWith(prefix))) return

      const supplied = Buffer.from(String(req.headers['x-service-key'] ?? ''))

      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        throw Errors.invalidServiceKey()
      }
    })
  }

  if (config.rateLimit.enabled) {
    await app.register(rateLimit, {
      global: true,
      max: config.rateLimit.maxPerMinute,
      timeWindow: '1 minute',
      keyGenerator: req => req.ip,
      errorResponseBuilder: (_req, context) =>
        new AppError(429, 'RATE_LIMITED', 'Too many requests. Slow down and try again shortly.', {
          details: { retryAfterSeconds: Math.max(1, Math.ceil(context.ttl / 1000)) }
        })
    })
  }

  registerErrorHandling(app)

  // Multipart uploads (POST /v1/files). One file per request, size-capped.
  await app.register(multipart, { limits: { fileSize: config.storage.maxUploadBytes, files: 1, fields: 5, parts: 8 } })

  // ---- body parsing -----------------------------------------------------------
  // Fastify rejects an empty body sent with Content-Type: application/json. Frontends do that
  // constantly (e.g. logout), so treat it as `{}`. Malformed JSON is still a clean 400.
  app.removeContentTypeParser('application/json')
  app.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: BODY_LIMIT_BYTES }, (_req, body, done) => {
    const text = String(body).trim()

    if (text === '') return done(null, {})

    _req.rawBody = text

    try {
      done(null, JSON.parse(text))
    } catch {
      done(Errors.invalidJson(), undefined)
    }
  })

  // ---- every response ---------------------------------------------------------
  app.addHook('onRequest', async (_req, reply) => {
    // These responses contain session tokens: nothing may cache them
    reply.header('Cache-Control', 'no-store')
    reply.header('Pragma', 'no-cache')
  })

  app.addHook('onSend', async (req, reply) => {
    reply.header('X-Request-Id', req.id)
  })

  app.addHook('onClose', async () => {
    await ctx.background.flush()
  })

  // ---- routes -----------------------------------------------------------------
  app.get('/health', { config: { rateLimit: false } }, async (_req, reply) => reply.send(ok({ status: 'ok' })))

  app.get('/health/ready', { config: { rateLimit: false } }, async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`
    } catch (error) {
      app.log.error({ err: error }, 'readiness check failed')
      throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Database is unavailable.')
    }

    return reply.send(ok({ status: 'ready' }))
  })

  await app.register(authRoutes, { prefix: '/v1/auth' })
  await app.register(adminUserRoutes, { prefix: '/v1/admin/users' })

  // Module plugins define their own full sub-paths under /v1
  for (const plugin of [userRoutes, fileRoutes, orgRoutes, notificationRoutes, contractRoutes, schedulingRoutes, timesheetRoutes, invoiceRoutes, leadRoutes]) {
    await app.register(plugin, { prefix: '/v1' })
  }

  // Public entry points (authenticated by signature / honeypot, not by session)
  await app.register(publicLeadRoutes, { prefix: '/public' })
  await app.register(webhookRoutes, { prefix: '/webhooks' })

  return { app, ctx }
}
