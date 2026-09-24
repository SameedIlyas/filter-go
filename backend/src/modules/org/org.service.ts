import { randomBytes } from 'node:crypto'

import type { AppContext, ClientMeta } from '../../context.js'
import type { Organization, Prisma } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import type { Db } from '../../lib/prisma.js'
import { recordAudit } from '../audit/record.js'

export interface OrgUpdate {
  name?: string
  timezone?: string
  defaultLeadOwnerId?: string | null
}

export const getOrg = async (ctx: AppContext, orgId: string): Promise<Organization> => {
  const org = await ctx.prisma.organization.findUnique({ where: { id: orgId } })

  if (!org) throw Errors.notFound('organization')

  return org
}

/** The default lead owner receives new website leads, so it must be someone who can act on them. */
const assertLeadOwner = async (db: Db, orgId: string, userId: string): Promise<void> => {
  const owner = await db.user.findFirst({
    where: { id: userId, orgId, status: 'ACTIVE', role: { in: ['ADMIN', 'SUPERVISOR'] } },
    select: { id: true }
  })

  if (!owner) {
    throw Errors.invalidField('defaultLeadOwnerId', 'invalid_owner', 'Choose an active admin or supervisor of this organization, or null.')
  }
}

/** Only the fields whose value actually changes, as before/after maps (the after map is also the update data). */
const diffOf = (before: Organization, input: OrgUpdate) => {
  const changed = (Object.keys(input) as Array<keyof OrgUpdate>).filter(field => input[field] !== undefined && input[field] !== before[field])

  return {
    before: Object.fromEntries(changed.map(field => [field, before[field]])),
    after: Object.fromEntries(changed.map(field => [field, input[field]])),
    isEmpty: changed.length === 0
  }
}

export const updateOrg = async (ctx: AppContext, actor: Actor, input: OrgUpdate, meta: ClientMeta): Promise<Organization> =>
  ctx.prisma.$transaction(async tx => {
    const before = await tx.organization.findUnique({ where: { id: actor.orgId } })

    if (!before) throw Errors.notFound('organization')

    if (input.defaultLeadOwnerId) await assertLeadOwner(tx, actor.orgId, input.defaultLeadOwnerId)

    const diff = diffOf(before, input)

    if (diff.isEmpty) return before

    const updated = await tx.organization.update({ where: { id: actor.orgId }, data: diff.after })

    await recordAudit(tx, actor, {
      entity: 'org',
      entityId: actor.orgId,
      action: 'updated',
      diff: { before: diff.before, after: diff.after } as Prisma.InputJsonValue,
      meta
    })

    return updated
  })

/** 144 bits of randomness, URL-safe. The previous key stops working the moment this commits. */
const newLeadKey = (): string => randomBytes(18).toString('base64url')

export const rotateLeadKey = async (ctx: AppContext, actor: Actor, meta: ClientMeta): Promise<Organization> =>
  ctx.prisma.$transaction(async tx => {
    const updated = await tx.organization.update({ where: { id: actor.orgId }, data: { leadIntakeKey: newLeadKey() } })

    // The keys themselves are deliberately not written to the trail
    await recordAudit(tx, actor, { entity: 'org', entityId: actor.orgId, action: 'lead_key_rotated', meta })

    return updated
  })
