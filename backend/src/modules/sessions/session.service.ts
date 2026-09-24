import type { AppContext, ClientMeta } from '../../context.js'
import type { Session, User } from '../../generated/prisma/client.js'
import { generateToken, sha256, SESSION_TOKEN_PREFIX, TOKEN_PATTERN } from '../../lib/crypto.js'
import { Errors } from '../../lib/errors.js'

export interface Auth {
  user: User
  session: Session
}

// Extending the idle window on every request would mean a write per request; once a minute is plenty
const TOUCH_INTERVAL_MS = 60_000

const addSeconds = (date: Date, seconds: number) => new Date(date.getTime() + seconds * 1000)

const idleSecondsFor = (ctx: AppContext, remember: boolean) =>
  remember ? ctx.config.session.rememberIdleSeconds : ctx.config.session.idleSeconds

/** Creates a session and returns the raw token. This is the only moment the raw token exists server-side. */
export const createSession = async (
  ctx: AppContext,
  userId: string,
  options: { remember: boolean; meta: ClientMeta }
): Promise<{ token: string; session: Session }> => {
  const { session: limits } = ctx.config
  const now = new Date()
  const token = generateToken(SESSION_TOKEN_PREFIX)
  const absoluteExpiresAt = addSeconds(now, options.remember ? limits.rememberAbsoluteSeconds : limits.absoluteSeconds)
  const idleCandidate = addSeconds(now, idleSecondsFor(ctx, options.remember))

  const session = await ctx.prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      remember: options.remember,
      ip: options.meta.ip,
      userAgent: options.meta.userAgent,
      idleExpiresAt: idleCandidate < absoluteExpiresAt ? idleCandidate : absoluteExpiresAt,
      absoluteExpiresAt
    }
  })

  await enforceSessionLimit(ctx, userId)

  return { token, session }
}

const activeWhere = (now: Date) => ({
  revokedAt: null,
  idleExpiresAt: { gt: now },
  absoluteExpiresAt: { gt: now }
})

/** Keeps at most `maxPerUser` live sessions, revoking the oldest. */
const enforceSessionLimit = async (ctx: AppContext, userId: string): Promise<void> => {
  const stale = await ctx.prisma.session.findMany({
    where: { userId, ...activeWhere(new Date()) },
    orderBy: { createdAt: 'desc' },
    skip: ctx.config.session.maxPerUser,
    select: { id: true }
  })

  if (stale.length > 0) {
    await ctx.prisma.session.updateMany({
      where: { id: { in: stale.map(session => session.id) }, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'session_limit' }
    })
  }
}

/** Resolves a raw bearer token to its user and session, or throws 401. Also slides the idle window. */
export const authenticate = async (ctx: AppContext, token: string): Promise<Auth> => {
  if (!TOKEN_PATTERN.test(token)) {
    throw Errors.unauthenticated()
  }

  const found = await ctx.prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true }
  })

  if (!found || found.revokedAt) {
    throw Errors.unauthenticated()
  }

  const { user, ...session } = found
  const now = new Date()

  if (now >= session.absoluteExpiresAt || now >= session.idleExpiresAt) {
    throw Errors.sessionExpired()
  }

  // A user disabled after login loses access immediately, even if a revoke was missed
  if (user.status !== 'ACTIVE') {
    throw Errors.unauthenticated()
  }

  const idleSeconds = idleSecondsFor(ctx, session.remember)

  // Never touch less often than half the idle window, or a short idle timeout would expire an active user
  if (now.getTime() - session.lastUsedAt.getTime() < Math.min(TOUCH_INTERVAL_MS, (idleSeconds * 1000) / 2)) {
    return { user, session }
  }

  const idleCandidate = addSeconds(now, idleSeconds)
  const idleExpiresAt = idleCandidate < session.absoluteExpiresAt ? idleCandidate : session.absoluteExpiresAt

  // updateMany: if the row was revoked or purged since we read it this is a clean 401, not a P2025 crash
  const touched = await ctx.prisma.session.updateMany({
    where: { id: session.id, revokedAt: null },
    data: { lastUsedAt: now, idleExpiresAt }
  })

  if (touched.count === 0) {
    throw Errors.unauthenticated()
  }

  return { user, session: { ...session, lastUsedAt: now, idleExpiresAt } }
}

export const listActiveSessions = (ctx: AppContext, userId: string) =>
  ctx.prisma.session.findMany({
    where: { userId, ...activeWhere(new Date()) },
    orderBy: { lastUsedAt: 'desc' }
  })

/** Revokes one session belonging to `userId`. Returns false if it was not theirs or already dead. */
export const revokeSession = async (
  ctx: AppContext,
  userId: string,
  sessionId: string,
  reason: string
): Promise<boolean> => {
  const result = await ctx.prisma.session.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason }
  })

  return result.count > 0
}

/** Revokes every live session of a user, optionally sparing one. Returns how many were revoked. */
export const revokeAllSessions = async (
  ctx: AppContext,
  userId: string,
  options: { exceptSessionId?: string; reason: string }
): Promise<number> => {
  const result = await ctx.prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(options.exceptSessionId ? { id: { not: options.exceptSessionId } } : {})
    },
    data: { revokedAt: new Date(), revokedReason: options.reason }
  })

  return result.count
}
