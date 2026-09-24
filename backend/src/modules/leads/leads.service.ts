import type { AppContext, ClientMeta } from '../../context.js'
import type { Lead, LeadActivityType, Prisma } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { AppError, Errors } from '../../lib/errors.js'
import { pageArgs, pageMeta } from '../../lib/pagination.js'
import type { PageQuery } from '../../lib/pagination.js'
import type { Db } from '../../lib/prisma.js'
import { addDays, zonedInstant } from '../../lib/time.js'
import { recordAudit } from '../audit/record.js'
import { leadScope, loadVisibleLead } from './leads.access.js'
import { findOpenDuplicate, lockContactKeys, normalizePhone } from './leads.dedupe.js'
import { notifyLeadAssigned } from './leads.notifications.js'
import { isEligibleOwner } from './leads.owner.js'
import type { ActivityBody, CreateBody, ListQuery, PatchBody, StatusBody } from './leads.schemas.js'
import { assertStatusTransition } from './leads.status.js'

const CONTACT_ACTIVITIES: LeadActivityType[] = ['CALL', 'EMAIL', 'SITE_VISIT']
const DETAIL_ACTIVITY_LIMIT = 50

const assertOwnerEligible = async (db: Db, orgId: string, ownerId: string): Promise<void> => {
  if (!(await isEligibleOwner(db, orgId, ownerId))) {
    throw Errors.invalidField('ownerId', 'not_eligible', 'The owner must be an active admin or supervisor of your organization.')
  }
}

const reloadLead = (db: Db, id: string) => db.lead.findUniqueOrThrow({ where: { id } })

const createdRange = async (ctx: AppContext, orgId: string, query: ListQuery): Promise<Prisma.DateTimeFilter | undefined> => {
  if (!query.from && !query.to) return undefined

  const org = await ctx.prisma.organization.findUnique({ where: { id: orgId }, select: { timezone: true } })
  const zone = org?.timezone ?? 'UTC'

  return {
    ...(query.from ? { gte: zonedInstant(query.from, '00:00', zone) } : {}),
    ...(query.to ? { lt: zonedInstant(addDays(query.to, 1), '00:00', zone) } : {})
  }
}

const searchFilter = (q: string): Prisma.LeadWhereInput => ({
  OR: [
    { companyName: { contains: q, mode: 'insensitive' } },
    { contactName: { contains: q, mode: 'insensitive' } },
    { email: { contains: q, mode: 'insensitive' } }
  ]
})

export const listLeads = async (ctx: AppContext, actor: Actor, query: ListQuery) => {
  const createdAt = await createdRange(ctx, actor.orgId, query)

  const where: Prisma.LeadWhereInput = {
    AND: [
      leadScope(actor),
      {
        ...(query.status ? { status: query.status } : {}),
        ...(query.source ? { source: query.source } : {}),
        ...(query.ownerId ? { ownerId: query.ownerId } : {}),
        ...(createdAt ? { createdAt } : {})
      },
      query.q ? searchFilter(query.q) : {}
    ]
  }

  const [items, total] = await Promise.all([
    ctx.prisma.lead.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...pageArgs(query) }),
    ctx.prisma.lead.count({ where })
  ])

  return { items, meta: pageMeta(query, total) }
}

export const getLeadDetail = async (ctx: AppContext, actor: Actor, id: string) => {
  const lead = await ctx.prisma.lead.findFirst({
    where: { AND: [{ id }, leadScope(actor)] },
    include: {
      activities: { orderBy: [{ at: 'desc' }, { id: 'desc' }], take: DETAIL_ACTIVITY_LIMIT },
      surveys: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }
    }
  })

  if (!lead) throw Errors.notFound('lead')

  return lead
}

const duplicateError = (actor: Actor, existing: Lead): AppError =>
  new AppError(409, 'DUPLICATE', 'An open lead with this email or phone already exists.', {
    details: {
      entity: 'lead',
      // A supervisor must not learn the id of a lead they cannot see
      ...(actor.role === 'ADMIN' || existing.ownerId === actor.id ? { context: { leadId: existing.id } } : {})
    }
  })

export const createLead = async (ctx: AppContext, actor: Actor, body: CreateBody, meta: ClientMeta) => {
  if (body.ownerId && actor.role !== 'ADMIN' && body.ownerId !== actor.id) throw Errors.forbidden()

  const ownerId = body.ownerId ?? actor.id
  const phoneNorm = normalizePhone(body.phone)

  const lead = await ctx.prisma.$transaction(async tx => {
    if (body.ownerId) await assertOwnerEligible(tx, actor.orgId, body.ownerId)

    await lockContactKeys(tx, actor.orgId, body.email, phoneNorm)

    const existing = await findOpenDuplicate(tx, actor.orgId, body.email, phoneNorm)

    if (existing) throw duplicateError(actor, existing)

    const created = await tx.lead.create({
      data: {
        orgId: actor.orgId,
        companyName: body.companyName,
        contactName: body.contactName,
        email: body.email,
        phone: body.phone ?? null,
        phoneNorm,
        address: body.address ?? null,
        serviceInterest: body.serviceInterest ?? null,
        message: body.message ?? null,
        source: body.source,
        ownerId
      }
    })

    await recordAudit(tx, actor, { entity: 'lead', entityId: created.id, action: 'created', diff: { source: body.source, ownerId }, meta })

    return created
  })

  if (ownerId !== actor.id) await notifyLeadAssigned(ctx, lead, ownerId)

  return lead
}

const CONTACT_FIELDS = ['companyName', 'contactName', 'email', 'phone', 'address', 'serviceInterest'] as const

const contactChanges = (lead: Lead, body: PatchBody): Record<string, { from: string | null; to: string | null }> =>
  Object.fromEntries(
    CONTACT_FIELDS.flatMap(field => {
      const next = body[field]

      return next !== undefined && next !== lead[field] ? [[field, { from: lead[field], to: next }]] : []
    })
  )

const contactData = (body: PatchBody): Prisma.LeadUpdateInput =>
  Object.fromEntries(CONTACT_FIELDS.flatMap(field => (body[field] !== undefined ? [[field, body[field]]] : [])))

export const updateLead = async (ctx: AppContext, actor: Actor, id: string, body: PatchBody, meta: ClientMeta) => {
  const { lead, reassignedTo } = await ctx.prisma.$transaction(async tx => {
    const current = await loadVisibleLead(tx, actor, id)
    const newOwnerId = body.ownerId !== undefined && body.ownerId !== current.ownerId ? body.ownerId : null

    if (newOwnerId) {
      // Reassigning is an admin decision: a supervisor may edit their own lead's details but not hand it off
      if (actor.role !== 'ADMIN') throw Errors.forbidden()

      await assertOwnerEligible(tx, actor.orgId, newOwnerId)
    }

    const changes = contactChanges(current, body)

    const updated = await tx.lead.update({
      where: { id: current.id },
      data: {
        ...contactData(body),
        ...(body.phone !== undefined ? { phoneNorm: normalizePhone(body.phone) } : {}),
        ...(newOwnerId ? { ownerId: newOwnerId } : {})
      }
    })

    if (Object.keys(changes).length > 0) {
      await recordAudit(tx, actor, { entity: 'lead', entityId: id, action: 'updated', diff: changes, meta })
    }

    if (newOwnerId) {
      await recordAudit(tx, actor, { entity: 'lead', entityId: id, action: 'assigned', diff: { from: current.ownerId, to: newOwnerId }, meta })
    }

    return { lead: updated, reassignedTo: newOwnerId }
  })

  if (reassignedTo && reassignedTo !== actor.id) await notifyLeadAssigned(ctx, lead, reassignedTo)

  return lead
}

export const changeLeadStatus = (ctx: AppContext, actor: Actor, id: string, body: StatusBody, meta: ClientMeta) =>
  ctx.prisma.$transaction(async tx => {
    const lead = await loadVisibleLead(tx, actor, id)

    assertStatusTransition(lead.status, body.status)

    // Conditional on the status we validated against: a concurrent change becomes a clean conflict, not a lost update
    const moved = await tx.lead.updateMany({
      where: { id: lead.id, orgId: actor.orgId, status: lead.status },
      data: { status: body.status, lostReason: body.status === 'LOST' ? (body.lostReason ?? null) : null }
    })

    if (moved.count === 0) throw Errors.conflict('The lead was changed by someone else. Reload it and try again.', { leadId: id })

    await recordAudit(tx, actor, {
      entity: 'lead',
      entityId: id,
      action: 'status_changed',
      diff: { from: lead.status, to: body.status, ...(body.lostReason ? { lostReason: body.lostReason } : {}) },
      meta
    })

    return reloadLead(tx, id)
  })

export const listActivities = async (ctx: AppContext, actor: Actor, id: string, query: PageQuery) => {
  await loadVisibleLead(ctx.prisma, actor, id)

  const where = { leadId: id }

  const [items, total] = await Promise.all([
    ctx.prisma.leadActivity.findMany({ where, orderBy: [{ at: 'desc' }, { id: 'desc' }], ...pageArgs(query) }),
    ctx.prisma.leadActivity.count({ where })
  ])

  return { items, meta: pageMeta(query, total) }
}

export const addActivity = (ctx: AppContext, actor: Actor, id: string, body: ActivityBody, meta: ClientMeta) =>
  ctx.prisma.$transaction(async tx => {
    const lead = await loadVisibleLead(tx, actor, id)
    const activity = await tx.leadActivity.create({ data: { leadId: id, userId: actor.id, type: body.type, body: body.body } })

    await recordAudit(tx, actor, { entity: 'lead', entityId: id, action: 'activity_added', diff: { type: body.type, activityId: activity.id }, meta })

    if (lead.status === 'NEW' && CONTACT_ACTIVITIES.includes(body.type)) {
      // Conditional: two simultaneous first calls must move the lead (and audit it) once
      const moved = await tx.lead.updateMany({ where: { id, orgId: actor.orgId, status: 'NEW' }, data: { status: 'CONTACTED' } })

      if (moved.count === 1) {
        await recordAudit(tx, actor, { entity: 'lead', entityId: id, action: 'status_changed', diff: { from: 'NEW', to: 'CONTACTED', trigger: 'first_activity' }, meta })
      }
    }

    return { activity, lead: await reloadLead(tx, id) }
  })
