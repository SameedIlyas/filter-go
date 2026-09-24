import type { AppContext } from '../../context.js'
import type { Lead } from '../../generated/prisma/client.js'
import { notify } from '../notifications/notify.js'

const EXCERPT_LENGTH = 300

const excerpt = (text: string | null | undefined): string =>
  text ? ` Message: ${text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH)}...` : text}` : ''

/**
 * Notifications must never fail the operation that triggered them (least of all a public form post), so every
 * error is logged and swallowed here. Titles and bodies are plain text: `notify` escapes them for HTML email.
 */
const safeNotify = async (ctx: AppContext, input: Parameters<typeof notify>[1]): Promise<void> => {
  try {
    await notify(ctx, input)
  } catch (error) {
    ctx.log.error({ err: error, type: input.type }, 'lead notification failed')
  }
}

export const notifyNewLead = (ctx: AppContext, lead: Lead, ownerId: string): Promise<void> =>
  safeNotify(ctx, {
    orgId: lead.orgId,
    userIds: [ownerId],
    type: 'lead.new',
    title: `New website lead: ${lead.companyName}`,
    body: `${lead.contactName} (${lead.email}${lead.phone ? `, ${lead.phone}` : ''}) sent the website form.${excerpt(lead.message)}`,
    data: { leadId: lead.id },
    email: true
  })

export const notifyDuplicateLead = (ctx: AppContext, lead: Lead, ownerId: string, message: string | undefined): Promise<void> =>
  safeNotify(ctx, {
    orgId: lead.orgId,
    userIds: [ownerId],
    type: 'lead.duplicate',
    title: `Duplicate website submission: ${lead.companyName}`,
    body: `${lead.contactName} submitted the website form again.${excerpt(message)}`,
    data: { leadId: lead.id }
  })

export const notifyLeadAssigned = (ctx: AppContext, lead: Lead, newOwnerId: string): Promise<void> =>
  safeNotify(ctx, {
    orgId: lead.orgId,
    userIds: [newOwnerId],
    type: 'lead.assigned',
    title: `Lead assigned to you: ${lead.companyName}`,
    body: `${lead.contactName} (${lead.email}) is now yours to follow up.`,
    data: { leadId: lead.id }
  })
