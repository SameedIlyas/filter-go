import { setTimeout as sleep } from 'node:timers/promises'

import type { FastifyPluginAsync } from 'fastify'

import { ok } from '../../lib/response.js'
import { parse } from '../../lib/validation.js'
import { clientMeta } from '../../plugins/auth.js'
import { publicLeadBody } from './leads.schemas.js'
import { receivePublicLead } from './leads.public.service.js'

/** Every outcome that is not a validation error looks exactly like this. */
const RECEIVED = { received: true } as const

/** Floor for the response time, so the cheap paths (honeypot, unknown key) are not distinguishable from a stored lead. */
const MIN_RESPONSE_MS = 150

const IP_LIMIT = { max: 5, timeWindow: '1 hour' } as const

/** A real form leaves the honeypot empty: anything else (any type) is a bot. */
const isHoneypotHit = (payload: unknown): boolean => {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return false

  const value = (payload as Record<string, unknown>).website

  if (value === undefined || value === null) return false

  return typeof value !== 'string' || value.trim() !== ''
}

/**
 * Public lead intake for website forms. No session, no service key (see app.ts): protected by the honeypot,
 * a per-IP rate limit, a per-organization cap and the organization's public intake key.
 * Registered in app.ts with prefix "/public".
 */
export const publicLeadRoutes: FastifyPluginAsync = async app => {
  const ctx = app.ctx

  // app.ts already registers @fastify/cors at the root (origin: false) and that plugin cannot be registered twice
  // in one tree, so the /public policy is expressed as route-level `config.cors`, which the root plugin merges over
  // its own options. An empty PUBLIC_LEAD_ORIGINS list means `origin: false`: no CORS headers at all.
  const cors = {
    origin: ctx.config.publicLeadOrigins.length > 0 ? ctx.config.publicLeadOrigins : false,
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    exposedHeaders: [],
    credentials: false,
    maxAge: 600
  }

  // The root plugin's catch-all OPTIONS route carries no per-route policy, so preflights for this path need their own
  // route. The CORS hook answers the preflight itself (204); the handler only exists so the route matches.
  app.options('/leads', { config: { cors, rateLimit: false } }, async (_req, reply) => reply.status(204).send())

  app.post('/leads', { config: { cors, rateLimit: IP_LIMIT } }, async (req, reply) => {
    const startedAt = Date.now()

    if (!isHoneypotHit(req.body)) {
      await receivePublicLead(ctx, parse(publicLeadBody, req.body), clientMeta(req))
    }

    const remaining = MIN_RESPONSE_MS - (Date.now() - startedAt)

    if (remaining > 0) await sleep(remaining)

    return reply.status(202).send(ok(RECEIVED))
  })
}
