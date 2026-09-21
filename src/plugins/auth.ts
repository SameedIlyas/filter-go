import type { FastifyRequest } from 'fastify'

import type { AppContext, ClientMeta } from '../context.js'
import type { Role } from '../generated/prisma/client.js'
import { actorOf } from '../lib/access.js'
import type { Actor } from '../lib/access.js'
import { Errors } from '../lib/errors.js'
import { authenticate } from '../modules/sessions/session.service.js'
import type { Auth } from '../modules/sessions/session.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext
  }

  interface FastifyRequest {
    /** Set by `requireAuth`. Never read it in a route that doesn't use the guard. */
    auth?: Auth
  }
}

const BEARER = /^Bearer ([^\s]+)$/i

/** preHandler: the request must carry a valid `Authorization: Bearer <session token>`. */
export const requireAuth = async (req: FastifyRequest): Promise<void> => {
  const match = BEARER.exec(req.headers.authorization ?? '')

  if (!match?.[1]) {
    throw Errors.unauthenticated()
  }

  req.auth = await authenticate(req.server.ctx, match[1])
}

/** preHandler: signed in AND an admin. Ordered so a stranger gets 401, not 403. */
export const requireAdmin = async (req: FastifyRequest): Promise<void> => {
  await requireAuth(req)

  if (req.auth?.user.role !== 'ADMIN') {
    throw Errors.forbidden()
  }
}

/** The authenticated identity, for handlers behind `requireAuth`. */
export const authOf = (req: FastifyRequest): Auth => {
  if (!req.auth) {
    // Would mean a route forgot its guard: fail closed
    throw Errors.unauthenticated()
  }

  return req.auth
}

export const clientMeta = (req: FastifyRequest): ClientMeta => {
  const userAgent = req.headers['user-agent']

  return { ip: req.ip, userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 255) : null }
}

/** preHandler factory: signed in AND one of `roles`. Ordered so a stranger gets 401, not 403. */
export const requireRoles =
  (...roles: Role[]) =>
  async (req: FastifyRequest): Promise<void> => {
    await requireAuth(req)

    if (!req.auth || !roles.includes(req.auth.user.role)) {
      throw Errors.forbidden()
    }
  }

/** The authenticated actor (id, orgId, role, clientId) for handlers behind a guard. */
export const actorFromReq = (req: FastifyRequest): Actor => actorOf(authOf(req))
