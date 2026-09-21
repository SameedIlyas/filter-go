import type { AppContext } from '../../context.js'
import type { TokenPurpose, User } from '../../generated/prisma/client.js'
import { generateToken, LINK_TOKEN_PREFIX, sha256, TOKEN_PATTERN } from '../../lib/crypto.js'
import { Errors } from '../../lib/errors.js'

/** The user status a token of each purpose is allowed to act on. */
const REQUIRED_STATUS = { INVITE: 'INVITED', PASSWORD_RESET: 'ACTIVE' } as const

/**
 * Issues a fresh single-use token and voids any older unused ones of the same purpose,
 * so only the newest emailed link ever works.
 */
export const issueToken = async (
  ctx: AppContext,
  userId: string,
  purpose: TokenPurpose,
  ttlSeconds: number
): Promise<string> => {
  const token = generateToken(LINK_TOKEN_PREFIX)
  const now = new Date()

  await ctx.prisma.$transaction(async tx => {
    // Lock the user row so two simultaneous requests take turns. Without it both would void the
    // old tokens and each create its own, leaving two live links.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`
    await tx.oneTimeToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: now } })
    await tx.oneTimeToken.create({
      data: { userId, purpose, tokenHash: sha256(token), expiresAt: new Date(now.getTime() + ttlSeconds * 1000) }
    })
  })

  return token
}

export interface ValidToken {
  id: string
  expiresAt: Date
  user: User
}

/**
 * Read-only check. Every failure (unknown, used, expired, wrong purpose, wrong user state)
 * throws the same INVALID_TOKEN so the endpoint can't be used to probe.
 */
export const findValidToken = async (ctx: AppContext, raw: string, purpose: TokenPurpose): Promise<ValidToken> => {
  if (!TOKEN_PATTERN.test(raw)) {
    throw Errors.invalidToken()
  }

  const record = await ctx.prisma.oneTimeToken.findUnique({
    where: { tokenHash: sha256(raw) },
    include: { user: true }
  })

  if (
    !record ||
    record.purpose !== purpose ||
    record.usedAt ||
    record.expiresAt <= new Date() ||
    record.user.status !== REQUIRED_STATUS[purpose]
  ) {
    throw Errors.invalidToken()
  }

  return { id: record.id, expiresAt: record.expiresAt, user: record.user }
}
