import type { ClientMeta } from '../../context.js'
import type { Prisma } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import type { Db } from '../../lib/prisma.js'

export interface DomainAudit {
  entity: string
  entityId: string
  /** Verb in past tense, dot-free: "created", "approved", "assign_override", ... */
  action: string
  /** Before/after or any small non-secret context. NEVER passwords, tokens or bank details. */
  diff?: Prisma.InputJsonValue
  meta?: ClientMeta
}

/**
 * Writes a domain audit_event (design doc "Shared" table).
 *
 * Unlike the auth `audit()` helper this does NOT swallow errors: call it with the SAME transaction client as
 * the change it describes, so a change and its audit record commit or roll back together.
 * Overrides of validation warnings MUST be recorded with this.
 */
export const recordAudit = async (db: Db, actor: Pick<Actor, 'id' | 'orgId'> | null, input: DomainAudit & { orgId?: string }): Promise<void> => {
  await db.auditEvent.create({
    data: {
      orgId: actor?.orgId ?? input.orgId ?? null,
      actorId: actor?.id ?? null,
      type: `${input.entity}.${input.action}`,
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      diff: input.diff,
      ip: input.meta?.ip ?? null,
      userAgent: input.meta?.userAgent ?? null
    }
  })
}
