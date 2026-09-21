import type { Session, User } from '../../generated/prisma/client.js'
import { canSeePayRate } from '../../lib/access.js'
import type { Actor } from '../../lib/access.js'
import { money } from '../../lib/money.js'
import { fromDateOnlyOrNull } from '../../lib/time.js'

/**
 * The only shape of a user that ever leaves the API. passwordHash can never be added by accident.
 * `viewer` decides field visibility: defaultPayRate is only included for ADMIN and SUPERVISOR viewers.
 * Pass the person making the request; omit it only when you are sure nobody should see pay data.
 */
export const serializeUser = (user: User, viewer?: Pick<Actor, 'role'>) => ({
  id: user.id,
  orgId: user.orgId,
  name: user.name,
  email: user.email,
  image: user.image,
  phone: user.phone,
  role: user.role,
  status: user.status,
  employmentType: user.employmentType,
  hiredAt: fromDateOnlyOrNull(user.hiredAt),
  clientId: user.clientId,
  ...(viewer && canSeePayRate(viewer) ? { defaultPayRate: money(user.defaultPayRate) } : {}),
  createdAt: user.createdAt,
  lastLoginAt: user.lastLoginAt
})

export type PublicUser = ReturnType<typeof serializeUser>

export const serializeSession = (session: Session, currentSessionId?: string) => ({
  id: session.id,
  createdAt: session.createdAt,
  lastUsedAt: session.lastUsedAt,
  /** Hard limit. Use this for the cookie maxAge. */
  expiresAt: session.absoluteExpiresAt,
  /** Session also dies if unused past this moment (moves forward while the user is active). */
  idleExpiresAt: session.idleExpiresAt,
  remember: session.remember,
  ip: session.ip,
  userAgent: session.userAgent,
  current: session.id === currentSessionId
})

/** Login-style payload: user plus the one-time-visible raw token. The user is viewing themselves. */
export const serializeLogin = (user: User, session: Session, token: string) => ({
  user: serializeUser(user, user),
  session: {
    token,
    id: session.id,
    expiresAt: session.absoluteExpiresAt,
    idleExpiresAt: session.idleExpiresAt,
    remember: session.remember
  }
})
