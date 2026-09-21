import type { AppContext, ClientMeta } from '../../context.js'
import type { Prisma } from '../../generated/prisma/client.js'

export type AuditType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGIN_THROTTLED'
  | 'LOGOUT'
  | 'LOGOUT_ALL'
  | 'SESSION_REVOKED'
  | 'SESSIONS_REVOKED_BY_ADMIN'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'INVITE_SENT'
  | 'INVITE_ACCEPTED'
  | 'USER_UPDATED'
  | 'USER_DISABLED'
  | 'USER_ENABLED'
  | 'PROFILE_UPDATED'

interface AuditInput {
  type: AuditType
  /** The account the event is about. */
  userId?: string | null
  /** Who did it, when different from userId (an admin acting on someone). */
  actorId?: string | null
  meta?: ClientMeta
  /** Small, non-secret context. NEVER put passwords or tokens here. */
  metadata?: Prisma.InputJsonValue
}

/** Records a security event. A failure to write the trail must never break the request itself. */
export const audit = async (ctx: AppContext, input: AuditInput): Promise<void> => {
  try {
    await ctx.prisma.auditEvent.create({
      data: {
        type: input.type,
        userId: input.userId ?? null,
        actorId: input.actorId ?? null,
        ip: input.meta?.ip ?? null,
        userAgent: input.meta?.userAgent ?? null,
        metadata: input.metadata
      }
    })
  } catch (error) {
    ctx.log.error({ err: error, auditType: input.type }, 'failed to write audit event')
  }
}
