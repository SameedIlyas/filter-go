import type { AuditEvent, Organization } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'

/** `leadIntakeKey` and `defaultLeadOwnerId` are settings: only an ADMIN viewer receives them. */
export const serializeOrg = (org: Organization, viewer: Pick<Actor, 'role'>) => ({
  id: org.id,
  name: org.name,
  timezone: org.timezone,
  ...(viewer.role === 'ADMIN' ? { leadIntakeKey: org.leadIntakeKey, defaultLeadOwnerId: org.defaultLeadOwnerId } : {})
})

/** Whitelist. `metadata` and `userAgent` are deliberately not part of it. */
export const serializeAuditEvent = (event: AuditEvent) => ({
  id: event.id,
  at: event.createdAt,
  actorId: event.actorId,
  entity: event.entity,
  entityId: event.entityId,
  action: event.action,
  diff: event.diff,
  type: event.type,
  userId: event.userId,
  ip: event.ip
})
