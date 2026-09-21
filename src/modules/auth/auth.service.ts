import type { AppContext, ClientMeta } from '../../context.js'
import type { User } from '../../generated/prisma/client.js'
import { emailKey } from '../../lib/crypto.js'
import { Errors } from '../../lib/errors.js'
import { checkPasswordPolicy } from '../../lib/password-policy.js'
import { audit } from '../audit/audit.js'
import { passwordResetEmail } from '../mail/templates.js'
import { createSession, revokeAllSessions } from '../sessions/session.service.js'
import type { Auth } from '../sessions/session.service.js'
import { serializeLogin } from '../users/serializers.js'
import { clearLoginFailures, releaseAttempt, reserveLoginAttempt } from './login-throttle.js'
import { findValidToken, issueToken } from './one-time-token.js'

const MAX_RESET_EMAILS_PER_HOUR = 3

const assertPasswordAcceptable = (password: string, user: Pick<User, 'email' | 'name'>) => {
  const issues = checkPasswordPolicy(password, { email: user.email, name: user.name })

  if (issues.length > 0) {
    throw Errors.validation(issues)
  }
}

// ---------------------------------------------------------------------------
// Login / logout
// ---------------------------------------------------------------------------

export const login = async (
  ctx: AppContext,
  input: { email: string; password: string; rememberMe: boolean },
  meta: ClientMeta
) => {
  const key = emailKey(input.email)

  let attemptId: string

  try {
    attemptId = await reserveLoginAttempt(ctx, key, meta.ip)
  } catch (error) {
    await audit(ctx, { type: 'LOGIN_THROTTLED', meta })
    throw error
  }

  const user = await ctx.prisma.user.findUnique({ where: { email: input.email } })

  // Always burn one password verification so an unknown email takes as long as a wrong password
  const passwordOk =
    user?.passwordHash ? await ctx.hasher.verify(user.passwordHash, input.password) : await ctx.hasher.verifyAgainstDummy(input.password)

  if (!user || !passwordOk) {
    // The reserved attempt stays on record as a failure
    await audit(ctx, { type: 'LOGIN_FAILED', userId: user?.id, meta })
    throw Errors.invalidCredentials()
  }

  // Only said once the caller has proven they know the password
  if (user.status !== 'ACTIVE') {
    // Right password: that's not a guess, so it must not count towards a lockout
    await releaseAttempt(ctx, attemptId)
    await audit(ctx, { type: 'LOGIN_FAILED', userId: user.id, meta, metadata: { reason: 'account_not_active' } })
    throw Errors.accountDisabled()
  }

  const { token, session } = await createSession(ctx, user.id, { remember: input.rememberMe, meta })
  const updated = await ctx.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

  await clearLoginFailures(ctx, key, meta.ip)
  await audit(ctx, { type: 'LOGIN_SUCCESS', userId: user.id, meta })

  return serializeLogin(updated, session, token)
}

export const logout = async (ctx: AppContext, auth: Auth, meta: ClientMeta) => {
  await ctx.prisma.session.updateMany({
    where: { id: auth.session.id, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: 'logout' }
  })
  await audit(ctx, { type: 'LOGOUT', userId: auth.user.id, meta })
}

export const logoutEverywhere = async (ctx: AppContext, auth: Auth, meta: ClientMeta) => {
  const revoked = await revokeAllSessions(ctx, auth.user.id, { reason: 'logout_all' })

  await audit(ctx, { type: 'LOGOUT_ALL', userId: auth.user.id, meta, metadata: { revoked } })

  return revoked
}

// ---------------------------------------------------------------------------
// Invite
// ---------------------------------------------------------------------------

/** Lets the frontend show "Welcome, <name>" before the user has typed anything. */
export const inspectLinkToken = async (ctx: AppContext, token: string, purpose: 'INVITE' | 'PASSWORD_RESET') => {
  const valid = await findValidToken(ctx, token, purpose)

  return { purpose, email: valid.user.email, name: valid.user.name, expiresAt: valid.expiresAt }
}

export const acceptInvite = async (
  ctx: AppContext,
  input: { token: string; password: string; name?: string },
  meta: ClientMeta
) => {
  const valid = await findValidToken(ctx, input.token, 'INVITE')
  const name = input.name ?? valid.user.name

  // Checked before the token is consumed so a weak password can simply be retried
  assertPasswordAcceptable(input.password, { email: valid.user.email, name })

  const passwordHash = await ctx.hasher.hash(input.password)
  const now = new Date()

  const user = await ctx.prisma.$transaction(async tx => {
    const consumed = await tx.oneTimeToken.updateMany({
      where: { id: valid.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now }
    })

    // Lost a race with a second click on the same link
    if (consumed.count !== 1) {
      throw Errors.invalidToken()
    }

    return tx.user.update({
      where: { id: valid.user.id },
      data: { passwordHash, passwordChangedAt: now, status: 'ACTIVE', name, lastLoginAt: now }
    })
  })

  const { token, session } = await createSession(ctx, user.id, { remember: false, meta })

  await audit(ctx, { type: 'INVITE_ACCEPTED', userId: user.id, meta })

  return serializeLogin(user, session, token)
}

// ---------------------------------------------------------------------------
// Forgot / reset password
// ---------------------------------------------------------------------------

/**
 * Always resolves the same way whether or not the email exists. The route answers first and this
 * runs in the background, so neither the body nor the response time leaks anything.
 */
export const requestPasswordReset = async (ctx: AppContext, email: string, meta: ClientMeta): Promise<void> => {
  const user = await ctx.prisma.user.findUnique({ where: { email } })

  if (!user || user.status !== 'ACTIVE') return

  const recent = await ctx.prisma.oneTimeToken.count({
    where: { userId: user.id, purpose: 'PASSWORD_RESET', createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } }
  })

  // Silent cap so someone can't use us to flood a colleague's inbox
  if (recent >= MAX_RESET_EMAILS_PER_HOUR) return

  const token = await issueToken(ctx, user.id, 'PASSWORD_RESET', ctx.config.passwordResetTtlSeconds)

  await audit(ctx, { type: 'PASSWORD_RESET_REQUESTED', userId: user.id, meta })
  await ctx.mailer.send(
    passwordResetEmail({
      to: user.email,
      name: user.name,
      url: `${ctx.config.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`,
      ttlSeconds: ctx.config.passwordResetTtlSeconds
    })
  )
}

export const resetPassword = async (ctx: AppContext, input: { token: string; password: string }, meta: ClientMeta) => {
  const valid = await findValidToken(ctx, input.token, 'PASSWORD_RESET')

  assertPasswordAcceptable(input.password, valid.user)

  const passwordHash = await ctx.hasher.hash(input.password)
  const now = new Date()

  await ctx.prisma.$transaction(async tx => {
    const consumed = await tx.oneTimeToken.updateMany({
      where: { id: valid.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now }
    })

    if (consumed.count !== 1) {
      throw Errors.invalidToken()
    }

    await tx.user.update({ where: { id: valid.user.id }, data: { passwordHash, passwordChangedAt: now } })
    // A reset means "I may have lost control of this account": kill every session, on every device
    await tx.session.updateMany({
      where: { userId: valid.user.id, revokedAt: null },
      data: { revokedAt: now, revokedReason: 'password_reset' }
    })
  })

  // Failed-login history for this account no longer matters once the owner has proven control
  await ctx.prisma.loginAttempt.deleteMany({ where: { emailKey: emailKey(valid.user.email) } })
  await audit(ctx, { type: 'PASSWORD_RESET_COMPLETED', userId: valid.user.id, meta })
}

// ---------------------------------------------------------------------------
// Change password (signed in)
// ---------------------------------------------------------------------------

export const changePassword = async (
  ctx: AppContext,
  auth: Auth,
  input: { currentPassword: string; newPassword: string },
  meta: ClientMeta
) => {
  const key = emailKey(auth.user.email)

  // A stolen session must not be able to brute-force the current password
  await reserveLoginAttempt(ctx, key, meta.ip)

  const currentOk = auth.user.passwordHash ? await ctx.hasher.verify(auth.user.passwordHash, input.currentPassword) : false

  if (!currentOk) {
    await audit(ctx, { type: 'LOGIN_FAILED', userId: auth.user.id, meta, metadata: { reason: 'change_password' } })
    throw Errors.invalidCurrentPassword()
  }

  if (input.newPassword === input.currentPassword) {
    throw Errors.validation([
      { field: 'newPassword', code: 'same_as_current', message: 'New password must be different from the current one.' }
    ])
  }

  const issues = checkPasswordPolicy(input.newPassword, { email: auth.user.email, name: auth.user.name }).map(issue => ({
    ...issue,
    field: 'newPassword'
  }))

  if (issues.length > 0) {
    throw Errors.validation(issues)
  }

  const passwordHash = await ctx.hasher.hash(input.newPassword)

  const now = new Date()

  const results = await ctx.prisma.$transaction([
    ctx.prisma.user.update({ where: { id: auth.user.id }, data: { passwordHash, passwordChangedAt: now } }),
    // Every other device is signed out; this one stays
    ctx.prisma.session.updateMany({
      where: { userId: auth.user.id, revokedAt: null, id: { not: auth.session.id } },
      data: { revokedAt: now, revokedReason: 'password_changed' }
    }),
    // A reset link emailed before the change must not be able to undo it
    ctx.prisma.oneTimeToken.updateMany({ where: { userId: auth.user.id, usedAt: null }, data: { usedAt: now } })
  ])

  const revoked = results[1].count

  await clearLoginFailures(ctx, key, meta.ip)
  await audit(ctx, { type: 'PASSWORD_CHANGED', userId: auth.user.id, meta, metadata: { otherSessionsRevoked: revoked } })

  return revoked
}
