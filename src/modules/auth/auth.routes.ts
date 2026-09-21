import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { Errors } from '../../lib/errors.js'
import { ok } from '../../lib/response.js'
import { emailField, imageField, nameField, parse, passwordField, tokenField, uuidParams } from '../../lib/validation.js'
import { authOf, clientMeta, requireAuth } from '../../plugins/auth.js'
import { audit } from '../audit/audit.js'
import { listActiveSessions, revokeSession } from '../sessions/session.service.js'
import { serializeSession, serializeUser } from '../users/serializers.js'
import { updateOwnProfile } from '../users/users.service.js'
import * as authService from './auth.service.js'

const limit = (max: number, timeWindow: string) => ({ config: { rateLimit: { max, timeWindow } } })

const loginBody = z.strictObject({
  email: emailField,
  password: passwordField,
  rememberMe: z.boolean().default(false)
})

const acceptInviteBody = z.strictObject({ token: tokenField, password: passwordField, name: nameField.optional() })
const forgotPasswordBody = z.strictObject({ email: emailField })
const resetPasswordBody = z.strictObject({ token: tokenField, password: passwordField })
const verifyTokenBody = z.strictObject({ token: tokenField, purpose: z.enum(['invite', 'password_reset']) })
const changePasswordBody = z.strictObject({ currentPassword: passwordField, newPassword: passwordField })

const updateProfileBody = z
  .strictObject({ name: nameField.optional(), image: imageField.nullable().optional(), phone: z.string().trim().min(3).max(40).nullable().optional() })
  .refine(value => Object.keys(value).length > 0, 'Provide at least one field to update.')

export const authRoutes: FastifyPluginAsync = async app => {
  const ctx = app.ctx

  // ------------------------------- public -------------------------------

  app.post('/login', limit(30, '1 minute'), async (req, reply) => {
    const body = parse(loginBody, req.body)
    const result = await authService.login(ctx, body, clientMeta(req))

    return reply.send(ok(result))
  })

  app.post('/accept-invite', limit(10, '15 minutes'), async (req, reply) => {
    const body = parse(acceptInviteBody, req.body)
    const result = await authService.acceptInvite(ctx, body, clientMeta(req))

    return reply.send(ok(result))
  })

  app.post('/forgot-password', limit(5, '15 minutes'), async (req, reply) => {
    const { email } = parse(forgotPasswordBody, req.body)
    const meta = clientMeta(req)

    // Answer immediately and do the work afterwards so timing can't reveal whether the email exists
    ctx.background.run('forgot-password', () => authService.requestPasswordReset(ctx, email, meta))

    return reply.send(ok({ message: 'If an account exists for that email, a reset link is on its way.' }))
  })

  app.post('/reset-password', limit(10, '15 minutes'), async (req, reply) => {
    const body = parse(resetPasswordBody, req.body)

    await authService.resetPassword(ctx, body, clientMeta(req))

    return reply.send(ok({ message: 'Password updated. Sign in with your new password.' }))
  })

  app.post('/verify-token', limit(30, '1 minute'), async (req, reply) => {
    const body = parse(verifyTokenBody, req.body)
    const purpose = body.purpose === 'invite' ? 'INVITE' : 'PASSWORD_RESET'
    const result = await authService.inspectLinkToken(ctx, body.token, purpose)

    return reply.send(ok(result))
  })

  // --------------------------- signed-in users ---------------------------

  app.get('/me', { preHandler: requireAuth }, async (req, reply) => {
    const auth = authOf(req)

    return reply.send(ok({ user: serializeUser(auth.user, auth.user), session: serializeSession(auth.session, auth.session.id) }))
  })

  app.patch('/me', { preHandler: requireAuth }, async (req, reply) => {
    const auth = authOf(req)
    const body = parse(updateProfileBody, req.body)
    const user = await updateOwnProfile(ctx, auth.user.id, body, clientMeta(req))

    return reply.send(ok({ user: serializeUser(user, user) }))
  })

  app.post('/logout', { preHandler: requireAuth }, async (req, reply) => {
    await authService.logout(ctx, authOf(req), clientMeta(req))

    return reply.send(ok({ message: 'Signed out.' }))
  })

  app.post('/logout-all', { preHandler: requireAuth }, async (req, reply) => {
    const revoked = await authService.logoutEverywhere(ctx, authOf(req), clientMeta(req))

    return reply.send(ok({ revoked }))
  })

  app.post('/change-password', { preHandler: requireAuth, ...limit(10, '15 minutes') }, async (req, reply) => {
    const body = parse(changePasswordBody, req.body)
    const revoked = await authService.changePassword(ctx, authOf(req), body, clientMeta(req))

    return reply.send(ok({ message: 'Password changed.', otherSessionsRevoked: revoked }))
  })

  app.get('/sessions', { preHandler: requireAuth }, async (req, reply) => {
    const auth = authOf(req)
    const sessions = await listActiveSessions(ctx, auth.user.id)

    return reply.send(ok({ sessions: sessions.map(session => serializeSession(session, auth.session.id)) }))
  })

  app.delete('/sessions/:id', { preHandler: requireAuth }, async (req, reply) => {
    const auth = authOf(req)
    const { id } = parse(uuidParams, req.params)
    const revoked = await revokeSession(ctx, auth.user.id, id, 'revoked_by_user')

    // Someone else's session and a missing one look identical on purpose
    if (!revoked) throw Errors.sessionNotFound()

    await audit(ctx, { type: 'SESSION_REVOKED', userId: auth.user.id, meta: clientMeta(req), metadata: { sessionId: id } })

    return reply.send(ok({ message: 'Session revoked.', wasCurrent: id === auth.session.id }))
  })
}
