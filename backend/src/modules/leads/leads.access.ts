import type { Lead, Prisma } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import type { Db } from '../../lib/prisma.js'

/**
 * Prisma `where` limiting leads to the actor's organization and visibility:
 * ADMIN sees every lead of the organization, SUPERVISOR only the ones they own.
 * (FIELD_USER and CLIENT_USER never reach the module: the routes reject them with 403.)
 */
export const leadScope = (actor: Actor): Prisma.LeadWhereInput =>
  actor.role === 'ADMIN' ? { orgId: actor.orgId } : { orgId: actor.orgId, ownerId: actor.id }

/** Loads a lead the actor may see; a missing, foreign-organization or not-owned lead is the same 404. */
export const loadVisibleLead = async (db: Db, actor: Actor, id: string): Promise<Lead> => {
  const lead = await db.lead.findFirst({ where: { AND: [{ id }, leadScope(actor)] } })

  if (!lead) throw Errors.notFound('lead')

  return lead
}
