import type { AppContext } from '../../context.js'
import { Errors } from '../../lib/errors.js'

/*
 * Failed-attempt throttling, stored in Postgres so it survives restarts and works with several
 * server instances. It is keyed by a hash of the *submitted* email, so an unknown address is
 * throttled exactly like a real one: the response never reveals whether an account exists.
 *
 * Three independent limits, each over a sliding window:
 *   - same email from the same IP   (stops one client guessing one account)
 *   - same email from any IP        (stops a distributed guess against one account)
 *   - same IP against any email     (stops password spraying)
 *
 * Race safety: an attempt is written BEFORE the password is checked and deleted only on success.
 * Checking first and recording later would let N parallel requests all see "0 failures so far".
 */

interface Scope {
  where: { emailKey?: string; ip?: string }
  max: number
}

const scopesFor = (ctx: AppContext, key: string, ip: string): Scope[] => [
  { where: { emailKey: key, ip }, max: ctx.config.login.maxFailsPerEmailIp },
  { where: { emailKey: key }, max: ctx.config.login.maxFailsPerEmail },
  { where: { ip }, max: ctx.config.login.maxFailsPerIp }
]

/**
 * Claims one attempt slot and returns its id, or throws TOO_MANY_ATTEMPTS (429).
 * Call BEFORE checking the password. The slot counts as a failure until you call
 * `releaseAttempt` (correct password) or `clearLoginFailures` (successful sign-in).
 */
export const reserveLoginAttempt = async (ctx: AppContext, key: string, ip: string): Promise<string> => {
  const attempt = await ctx.prisma.loginAttempt.create({ data: { emailKey: key, ip }, select: { id: true } })
  const windowMs = ctx.config.login.windowSeconds * 1000
  const since = new Date(Date.now() - windowMs)

  const waits = await Promise.all(
    scopesFor(ctx, key, ip).map(async scope => {
      const where = { ...scope.where, createdAt: { gt: since } }
      const count = await ctx.prisma.loginAttempt.count({ where })

      if (count <= scope.max) return 0

      // Over the limit. This attempt will be discarded, so count only the others: the caller may
      // retry once enough of them age out of the window to leave room for one more.
      const others = count - 1
      const [oldest] = await ctx.prisma.loginAttempt.findMany({
        where: { ...where, id: { not: attempt.id } },
        orderBy: { createdAt: 'asc' },
        skip: others - scope.max,
        take: 1,
        select: { createdAt: true }
      })

      const releaseAt = (oldest?.createdAt.getTime() ?? Date.now()) + windowMs

      return Math.max(1, Math.ceil((releaseAt - Date.now()) / 1000))
    })
  )

  const retryAfter = Math.max(...waits)

  if (retryAfter > 0) {
    // A blocked attempt must not extend its own lockout
    await releaseAttempt(ctx, attempt.id)
    throw Errors.tooManyAttempts(retryAfter)
  }

  return attempt.id
}

/** Gives the slot back (used when the password was right but the account can't sign in). */
export const releaseAttempt = async (ctx: AppContext, attemptId: string): Promise<void> => {
  await ctx.prisma.loginAttempt.deleteMany({ where: { id: attemptId } })
}

/** A successful login forgives that client's failures for that account (other IPs stay counted). */
export const clearLoginFailures = async (ctx: AppContext, key: string, ip: string): Promise<void> => {
  await ctx.prisma.loginAttempt.deleteMany({ where: { emailKey: key, ip } })
}
