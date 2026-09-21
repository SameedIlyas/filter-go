import type { AppContext } from '../../context.js'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Deletes rows that can no longer matter. Dead sessions and used tokens are kept for a week
 * first, which keeps "why was I logged out?" investigations possible.
 * Audit events are kept for AUDIT_RETENTION_DAYS (default a year), then removed.
 */
export const purgeExpired = async (ctx: AppContext): Promise<{ sessions: number; tokens: number; attempts: number; audit: number }> => {
  const now = Date.now()
  const weekAgo = new Date(now - 7 * DAY_MS)
  const attemptCutoff = new Date(now - Math.max(ctx.config.login.windowSeconds * 1000, DAY_MS))

  const auditCutoff = new Date(now - ctx.config.auditRetentionDays * DAY_MS)

  const [sessions, tokens, attempts, audit] = await Promise.all([
    ctx.prisma.session.deleteMany({
      where: { OR: [{ revokedAt: { lt: weekAgo } }, { absoluteExpiresAt: { lt: weekAgo } }, { idleExpiresAt: { lt: weekAgo } }] }
    }),
    ctx.prisma.oneTimeToken.deleteMany({ where: { OR: [{ usedAt: { lt: weekAgo } }, { expiresAt: { lt: weekAgo } }] } }),
    ctx.prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: attemptCutoff } } }),
    ctx.prisma.auditEvent.deleteMany({ where: { createdAt: { lt: auditCutoff } } })
  ])

  return { sessions: sessions.count, tokens: tokens.count, attempts: attempts.count, audit: audit.count }
}
