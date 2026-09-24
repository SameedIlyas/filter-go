import type { AppContext } from '../../context.js'
import type { AuditEvent, Prisma } from '../../generated/prisma/client.js'
import { pageArgs, pageMeta } from '../../lib/pagination.js'
import type { PageQuery } from '../../lib/pagination.js'
import type { PageMeta } from '../../lib/response.js'

export interface AuditQuery extends PageQuery {
  entity?: string
  entityId?: string
  actorId?: string
  action?: string
  from?: Date
  to?: Date
}

/** Newest first. Every query is limited to the caller's organization: rows without an orgId are never returned. */
export const listAuditEvents = async (ctx: AppContext, orgId: string, query: AuditQuery): Promise<{ items: AuditEvent[]; meta: PageMeta }> => {
  const where: Prisma.AuditEventWhereInput = {
    orgId,
    ...(query.entity ? { entity: query.entity } : {}),
    ...(query.entityId ? { entityId: query.entityId } : {}),
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {})
  }

  const [total, items] = await Promise.all([
    ctx.prisma.auditEvent.count({ where }),
    ctx.prisma.auditEvent.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...pageArgs(query) })
  ])

  return { items, meta: pageMeta(query, total) }
}
