import type { AppContext, ClientMeta } from '../../context.js'
import type { Lead, Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../lib/prisma.js'
import { recordAudit } from '../audit/record.js'
import { findOpenDuplicate, lockContactKeys, normalizePhone } from './leads.dedupe.js'
import { notifyDuplicateLead, notifyNewLead } from './leads.notifications.js'
import { resolveDefaultOwnerId } from './leads.owner.js'
import type { PublicLeadBody } from './leads.schemas.js'

/** Prefix of the note added to an existing lead; also how merged submissions are counted for the org cap. */
export const DUPLICATE_NOTE_TITLE = 'Duplicate website submission'

/** Per-organization ceiling on website submissions that are stored (new leads plus merged duplicates). */
export const ORG_HOURLY_CAP = 100

const HOUR_MS = 60 * 60 * 1000

interface OrgRef {
  id: string
  defaultLeadOwnerId: string | null
}

const isOverHourlyCap = async (db: Db, orgId: string): Promise<boolean> => {
  const since = new Date(Date.now() - HOUR_MS)

  const [created, merged] = await Promise.all([
    db.lead.count({ where: { orgId, source: 'WEBSITE', createdAt: { gte: since } } }),
    db.leadActivity.count({ where: { lead: { orgId }, userId: null, type: 'NOTE', body: { startsWith: DUPLICATE_NOTE_TITLE }, at: { gte: since } } })
  ])

  return created + merged >= ORG_HOURLY_CAP
}

const duplicateNoteBody = (body: PublicLeadBody): string =>
  [
    DUPLICATE_NOTE_TITLE,
    `Contact: ${body.contactName} <${body.email}>${body.phone ? ` ${body.phone}` : ''}`,
    body.message ? `Message: ${body.message}` : null,
    body.sourceUrl ? `Page: ${body.sourceUrl}` : null,
    body.utm && Object.keys(body.utm).length > 0
      ? `UTM: ${Object.entries(body.utm)
          .map(([key, value]) => `${key}=${value}`)
          .join(', ')}`
      : null
  ]
    .filter((line): line is string => line !== null)
    .join('\n')

type IntakeResult = { kind: 'created'; lead: Lead } | { kind: 'merged'; lead: Lead; ownerId: string | null }

const storeSubmission = async (ctx: AppContext, org: OrgRef, body: PublicLeadBody, phoneNorm: string | null, meta: ClientMeta): Promise<IntakeResult> =>
  ctx.prisma.$transaction(async tx => {
    await lockContactKeys(tx, org.id, body.email, phoneNorm)

    const existing = await findOpenDuplicate(tx, org.id, body.email, phoneNorm)

    if (existing) {
      await tx.leadActivity.create({ data: { leadId: existing.id, userId: null, type: 'NOTE', body: duplicateNoteBody(body) } })
      await recordAudit(tx, null, { orgId: org.id, entity: 'lead', entityId: existing.id, action: 'duplicate_merged', meta })

      const ownerId = existing.ownerId ?? (await resolveDefaultOwnerId(tx, org.id, org.defaultLeadOwnerId))

      return { kind: 'merged', lead: existing, ownerId }
    }

    const ownerId = await resolveDefaultOwnerId(tx, org.id, org.defaultLeadOwnerId)

    const lead = await tx.lead.create({
      data: {
        orgId: org.id,
        companyName: body.companyName,
        contactName: body.contactName,
        email: body.email,
        phone: body.phone ?? null,
        phoneNorm,
        address: body.address ?? null,
        source: 'WEBSITE',
        sourceUrl: body.sourceUrl ?? null,
        utm: (body.utm ?? undefined) as Prisma.InputJsonValue | undefined,
        serviceInterest: body.serviceInterest ?? null,
        message: body.message ?? null,
        ownerId
      }
    })

    await recordAudit(tx, null, { orgId: org.id, entity: 'lead', entityId: lead.id, action: 'created', diff: { source: 'WEBSITE', ownerId }, meta })

    return { kind: 'created', lead }
  })

/**
 * Handles one validated website submission. Deliberately returns nothing: the route answers every outcome
 * (created, merged, unknown key, over the cap) with the same body so the endpoint is no oracle for valid keys or emails.
 */
export const receivePublicLead = async (ctx: AppContext, body: PublicLeadBody, meta: ClientMeta): Promise<void> => {
  const org = await ctx.prisma.organization.findUnique({
    where: { leadIntakeKey: body.orgKey },
    select: { id: true, defaultLeadOwnerId: true }
  })

  if (!org || (await isOverHourlyCap(ctx.prisma, org.id))) return

  const result = await storeSubmission(ctx, org, body, normalizePhone(body.phone), meta)

  if (result.kind === 'created') {
    if (result.lead.ownerId) await notifyNewLead(ctx, result.lead, result.lead.ownerId)

    return
  }

  if (result.ownerId) await notifyDuplicateLead(ctx, result.lead, result.ownerId, body.message)
}
