import type { AppContext } from '../../context.js'
import type { Prisma, User, UserDocument } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { pageArgs, pageMeta } from '../../lib/pagination.js'
import type { PageQuery } from '../../lib/pagination.js'
import type { PageMeta } from '../../lib/response.js'
import { addDays, daysBetween, fromDateOnly, localDate, toDateOnly } from '../../lib/time.js'
import { visibleUsersWhere } from './user-scope.js'

export type ComplianceStatus = 'VALID' | 'EXPIRING' | 'EXPIRED'

/** A document counts as EXPIRING when it lapses within this many days (today included). */
export const EXPIRING_WITHIN_DAYS = 30

const SEVERITY: Record<ComplianceStatus, number> = { VALID: 0, EXPIRING: 1, EXPIRED: 2 }

/** `expiresAt` and `today` are "YYYY-MM-DD". Expiring today is still EXPIRING; the day after is EXPIRED. */
export const documentStatus = (expiresAt: string | null, today: string): ComplianceStatus => {
  if (expiresAt === null) return 'VALID'
  if (expiresAt < today) return 'EXPIRED'

  return expiresAt <= addDays(today, EXPIRING_WITHIN_DAYS) ? 'EXPIRING' : 'VALID'
}

/** The worst status of the set. No documents at all is VALID: there is nothing that is out of date. */
export const worstStatus = (statuses: ComplianceStatus[]): ComplianceStatus =>
  statuses.reduce<ComplianceStatus>((worst, status) => (SEVERITY[status] > SEVERITY[worst] ? status : worst), 'VALID')

/** "Today" is the organization's calendar day, not the server's. */
export const orgToday = async (ctx: AppContext, orgId: string): Promise<string> => {
  const org = await ctx.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { timezone: true } })

  return localDate(new Date(), org.timezone)
}

export interface ComplianceEntry {
  document: UserDocument
  status: ComplianceStatus
  daysUntilExpiry: number | null
}

const entryFor = (document: UserDocument, today: string): ComplianceEntry => {
  const expiresAt = document.expiresAt ? fromDateOnly(document.expiresAt) : null

  return { document, status: documentStatus(expiresAt, today), daysUntilExpiry: expiresAt ? daysBetween(today, expiresAt) : null }
}

export const getUserCompliance = async (ctx: AppContext, actor: Actor, target: User) => {
  const today = await orgToday(ctx, actor.orgId)
  const documents = await ctx.prisma.userDocument.findMany({
    where: { userId: target.id, orgId: actor.orgId },
    orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }]
  })
  const entries = documents.map(document => entryFor(document, today))

  return { today, overall: worstStatus(entries.map(entry => entry.status)), entries }
}

export interface ExpiringEntry extends ComplianceEntry {
  user: Pick<User, 'id' | 'name' | 'role'>
}

/** Documents that lapse within `days` (or already have), for the people this actor may see. Oldest expiry first. */
export const listExpiring = async (
  ctx: AppContext,
  actor: Actor,
  query: PageQuery & { days: number }
): Promise<{ entries: ExpiringEntry[]; meta: PageMeta; today: string }> => {
  const today = await orgToday(ctx, actor.orgId)
  const where: Prisma.UserDocumentWhereInput = {
    orgId: actor.orgId,
    expiresAt: { lte: toDateOnly(addDays(today, query.days)) },
    // Disabled people are gone: their paperwork is not a to-do
    user: { AND: [await visibleUsersWhere(ctx, actor), { status: { not: 'DISABLED' } }] }
  }

  const [total, documents] = await Promise.all([
    ctx.prisma.userDocument.count({ where }),
    ctx.prisma.userDocument.findMany({
      where,
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      ...pageArgs(query)
    })
  ])

  return {
    entries: documents.map(({ user, ...document }) => ({ ...entryFor(document, today), user })),
    meta: pageMeta(query, total),
    today
  }
}
