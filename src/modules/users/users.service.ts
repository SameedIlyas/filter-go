import type { AppContext, ClientMeta } from '../../context.js'
import { Prisma } from '../../generated/prisma/client.js'
import type { EmploymentType, Role, User, UserStatus } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import type { Decimal } from '../../lib/money.js'
import { pageArgs, pageMeta } from '../../lib/pagination.js'
import type { PageQuery } from '../../lib/pagination.js'
import type { PageMeta } from '../../lib/response.js'
import { toDateOnly } from '../../lib/time.js'
import { audit } from '../audit/audit.js'
import { issueToken } from '../auth/one-time-token.js'
import { inviteEmail } from '../mail/templates.js'
import { revokeAllSessions } from '../sessions/session.service.js'

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'

export const inviteLink = (ctx: AppContext, token: string) =>
  `${ctx.config.frontendUrl}/accept-invite?token=${encodeURIComponent(token)}`

/** CLIENT_USER must point at a client of this organization; every other role must not have a client. */
const assertRoleClient = async (ctx: AppContext, orgId: string, role: Role, clientId: string | null | undefined): Promise<string | null> => {
  if (role !== 'CLIENT_USER') {
    if (clientId) throw Errors.invalidField('clientId', 'not_allowed', 'Only client users belong to a client.')

    return null
  }

  if (!clientId) throw Errors.invalidField('clientId', 'required', 'A client user must be linked to a client.')

  const client = await ctx.prisma.client.findFirst({ where: { id: clientId, orgId }, select: { id: true } })

  if (!client) throw Errors.invalidField('clientId', 'client_not_found', 'That client does not exist.')

  return client.id
}

// ---------------------------------------------------------------------------
// Invite
// ---------------------------------------------------------------------------

export interface InviteInput {
  orgId: string
  email: string
  name: string
  role: Role
  clientId?: string | null
  phone?: string | null
  employmentType?: EmploymentType
  defaultPayRate?: Decimal | null
  hiredAt?: string | null
}

/**
 * Creates the user (status INVITED, no password) and a fresh invite token. Calling it again for
 * someone who has never set a password re-issues the invite and voids the old link.
 * Someone who already has a password (or belongs to another organization) gets EMAIL_TAKEN.
 */
export const createInvite = async (
  ctx: AppContext,
  actorId: string | null,
  input: InviteInput,
  meta?: ClientMeta
): Promise<{ user: User; token: string }> => {
  const clientId = await assertRoleClient(ctx, input.orgId, input.role, input.clientId)
  const existing = await ctx.prisma.user.findUnique({ where: { email: input.email } })

  if (existing && (existing.passwordHash || existing.orgId !== input.orgId)) {
    throw Errors.emailTaken()
  }

  const profile = {
    name: input.name,
    role: input.role,
    clientId,
    phone: input.phone ?? null,
    employmentType: input.employmentType ?? 'EMPLOYEE',
    defaultPayRate: input.defaultPayRate ?? null,
    hiredAt: input.hiredAt ? toDateOnly(input.hiredAt) : null
  } as const

  let user: User

  try {
    if (existing) {
      // Conditional on "still no password": an invite accepted a moment ago must never be reverted
      const updated = await ctx.prisma.user.updateMany({
        where: { id: existing.id, passwordHash: null },
        data: { ...profile, status: 'INVITED' }
      })

      if (updated.count === 0) throw Errors.emailTaken()

      user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: existing.id } })
    } else {
      user = await ctx.prisma.user.create({ data: { ...profile, orgId: input.orgId, email: input.email, status: 'INVITED' } })
    }
  } catch (error) {
    // Two admins inviting the same address at the same moment
    if (isUniqueViolation(error)) throw Errors.emailTaken()
    throw error
  }

  const token = await issueToken(ctx, user.id, 'INVITE', ctx.config.inviteTtlSeconds)

  await audit(ctx, { type: 'INVITE_SENT', userId: user.id, actorId, meta, metadata: { role: input.role } })

  return { user, token }
}

/** Returns whether the email was handed to the mail server. Never throws: the invite already exists. */
export const sendInviteEmail = async (ctx: AppContext, user: User, token: string): Promise<boolean> => {
  try {
    await ctx.mailer.send(
      inviteEmail({
        to: user.email,
        name: user.name,
        url: inviteLink(ctx, token),
        ttlSeconds: ctx.config.inviteTtlSeconds
      })
    )

    return true
  } catch (error) {
    ctx.log.error({ err: error, userId: user.id }, 'failed to send invite email')

    return false
  }
}

// ---------------------------------------------------------------------------
// Read (organization-scoped)
// ---------------------------------------------------------------------------

export interface ListUsersQuery extends PageQuery {
  q?: string
  role?: Role
  status?: UserStatus
  clientId?: string
}

export const listUsers = async (ctx: AppContext, orgId: string, query: ListUsersQuery): Promise<{ items: User[]; meta: PageMeta }> => {
  const where: Prisma.UserWhereInput = {
    orgId,
    ...(query.role ? { role: query.role } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.clientId ? { clientId: query.clientId } : {}),
    ...(query.q
      ? {
          OR: [
            { email: { contains: query.q, mode: 'insensitive' } },
            { name: { contains: query.q, mode: 'insensitive' } }
          ]
        }
      : {})
  }

  const [total, items] = await Promise.all([
    ctx.prisma.user.count({ where }),
    ctx.prisma.user.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], ...pageArgs(query) })
  ])

  return { items, meta: pageMeta(query, total) }
}

/** Looks a user up inside the organization. A user of another organization is indistinguishable from a missing one. */
export const getUser = async (ctx: AppContext, orgId: string, id: string): Promise<User> => {
  const user = await ctx.prisma.user.findFirst({ where: { id, orgId } })

  if (!user) throw Errors.userNotFound()

  return user
}

// ---------------------------------------------------------------------------
// Admin update
// ---------------------------------------------------------------------------

export interface AdminUpdateInput {
  name?: string
  role?: Role
  clientId?: string | null
  status?: 'ACTIVE' | 'DISABLED'
  phone?: string | null
  employmentType?: EmploymentType
  defaultPayRate?: Decimal | null
  hiredAt?: string | null
}

export const updateUserAsAdmin = async (
  ctx: AppContext,
  actor: Actor,
  targetId: string,
  input: AdminUpdateInput,
  meta: ClientMeta
): Promise<User> => {
  const target = await getUser(ctx, actor.orgId, targetId)

  // Admins can't lock themselves out or drop their own privileges by accident
  if (targetId === actor.id && (input.role !== undefined || input.status !== undefined)) {
    throw Errors.cannotModifySelf()
  }

  if (input.status === 'ACTIVE' && !target.passwordHash) {
    throw Errors.userNotActivated()
  }

  const nextRole = input.role ?? target.role
  const roleTouched = input.role !== undefined || input.clientId !== undefined

  // Only re-validate the role/client pairing when one of the two is being changed
  const clientId = roleTouched
    ? await assertRoleClient(ctx, actor.orgId, nextRole, input.clientId === undefined ? (nextRole === 'CLIENT_USER' ? target.clientId : null) : input.clientId)
    : undefined

  const data: Prisma.UserUncheckedUpdateInput = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.role !== undefined ? { role: input.role } : {}),
    ...(clientId !== undefined ? { clientId } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.employmentType !== undefined ? { employmentType: input.employmentType } : {}),
    ...(input.defaultPayRate !== undefined ? { defaultPayRate: input.defaultPayRate } : {}),
    ...(input.hiredAt !== undefined ? { hiredAt: input.hiredAt ? toDateOnly(input.hiredAt) : null } : {})
  }

  const disabling = input.status === 'DISABLED' && target.status !== 'DISABLED'

  const updated = await ctx.prisma.$transaction(async tx => {
    const result = await tx.user.update({ where: { id: targetId }, data })

    if (disabling) {
      // Cut off every device now, and void any invite / reset link still floating around
      const now = new Date()

      await tx.session.updateMany({ where: { userId: targetId, revokedAt: null }, data: { revokedAt: now, revokedReason: 'user_disabled' } })
      await tx.oneTimeToken.updateMany({ where: { userId: targetId, usedAt: null }, data: { usedAt: now } })
    }

    return result
  })

  if (disabling) {
    await audit(ctx, { type: 'USER_DISABLED', userId: targetId, actorId: actor.id, meta })
  } else if (input.status === 'ACTIVE' && target.status === 'DISABLED') {
    await audit(ctx, { type: 'USER_ENABLED', userId: targetId, actorId: actor.id, meta })
  }

  const changed = Object.keys(data).filter(field => field !== 'status')

  if (changed.length > 0) {
    await audit(ctx, { type: 'USER_UPDATED', userId: targetId, actorId: actor.id, meta, metadata: { fields: changed } })
  }

  return updated
}

export const revokeUserSessions = async (ctx: AppContext, actor: Actor, targetId: string, meta: ClientMeta) => {
  await getUser(ctx, actor.orgId, targetId)

  const revoked = await revokeAllSessions(ctx, targetId, { reason: 'revoked_by_admin' })

  await audit(ctx, { type: 'SESSIONS_REVOKED_BY_ADMIN', userId: targetId, actorId: actor.id, meta, metadata: { revoked } })

  return revoked
}

// ---------------------------------------------------------------------------
// Own profile
// ---------------------------------------------------------------------------

export const updateOwnProfile = async (
  ctx: AppContext,
  userId: string,
  input: { name?: string; image?: string | null; phone?: string | null },
  meta: ClientMeta
): Promise<User> => {
  const updated = await ctx.prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.image !== undefined ? { image: input.image } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {})
    }
  })

  await audit(ctx, { type: 'PROFILE_UPDATED', userId, meta, metadata: { fields: Object.keys(input) } })

  return updated
}
