import type { AppContext } from '../../context.js'
import type { Prisma } from '../../generated/prisma/client.js'
import { assertSiteAccess } from '../../lib/access.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import { pageArgs, pageMeta } from '../../lib/pagination.js'
import { entryInclude, loadUserNames, readScope } from './entries.js'
import type { ListQuery, MineQuery, QueueQuery } from './schemas.js'
import { CLIENT_LOG_KINDS, serializeEntry, serializeEntryDetail, serializeQueueItem } from './serializers.js'

const MAX_DETAIL_WORK_LOGS = 200

const shiftRange = (from?: Date, to?: Date): Prisma.ShiftWhereInput => (from || to ? { scheduledStart: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {})

const openExceptions = (flag?: boolean): Prisma.TimesheetEntryWhereInput =>
  flag === undefined ? {} : { exceptions: flag ? { some: { resolved: false } } : { none: { resolved: false } } }

/** One page of entries inside `where` (already scoped), newest shift first, serialised for `actor`. */
const pageOfEntries = async (ctx: AppContext, actor: Actor, where: Prisma.TimesheetEntryWhereInput, query: { page: number; limit: number }) => {
  const [total, rows] = await Promise.all([
    ctx.prisma.timesheetEntry.count({ where }),
    ctx.prisma.timesheetEntry.findMany({
      where,
      include: entryInclude,
      orderBy: [{ shift: { scheduledStart: 'desc' } }, { id: 'asc' }],
      ...pageArgs(query)
    })
  ])

  const users = actor.role === 'CLIENT_USER' ? new Map() : await loadUserNames(ctx.prisma, actor.orgId, rows.map(row => row.userId))

  return { items: rows.map(row => serializeEntry(row, actor, users)), meta: pageMeta(query, total) }
}

/** GET /me/timesheets: a worker's own entries (never any rate). */
export const listMyEntries = async (ctx: AppContext, actor: Actor, query: MineQuery) =>
  pageOfEntries(
    ctx,
    actor,
    { AND: [await readScope(ctx, actor), { ...(query.status ? { status: query.status } : {}), shift: shiftRange(query.from, query.to) }] },
    query
  )

/**
 * GET /timesheets. Staff see entries at their sites; a client sees only APPROVED / INVOICED entries at their client's
 * sites and cannot filter by worker or exceptions.
 */
export const listEntries = async (ctx: AppContext, actor: Actor, query: ListQuery) => {
  if (query.siteId) await assertSiteAccess(ctx, actor, query.siteId)

  const isClient = actor.role === 'CLIENT_USER'
  const filters: Prisma.TimesheetEntryWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.userId && !isClient ? { userId: query.userId } : {}),
    ...(isClient ? {} : openExceptions(query.hasOpenExceptions)),
    shift: { ...(query.siteId ? { siteId: query.siteId } : {}), ...shiftRange(query.from, query.to) }
  }

  return pageOfEntries(ctx, actor, { AND: [await readScope(ctx, actor), filters] }, query)
}

/** GET /timesheets/:id: everything about one entry the caller may see. */
export const getEntryDetail = async (ctx: AppContext, actor: Actor, id: string) => {
  const entry = await ctx.prisma.timesheetEntry.findFirst({ where: { AND: [{ id }, await readScope(ctx, actor)] }, include: entryInclude })

  if (!entry) throw Errors.notFound('timesheet')

  const workLogs = await ctx.prisma.workLog.findMany({
    where: { orgId: actor.orgId, shiftId: entry.shiftId, ...(actor.role === 'CLIENT_USER' ? { kind: { in: CLIENT_LOG_KINDS } } : {}) },
    orderBy: [{ at: 'asc' }, { id: 'asc' }],
    take: MAX_DETAIL_WORK_LOGS
  })

  const users = actor.role === 'CLIENT_USER' ? new Map() : await loadUserNames(ctx.prisma, actor.orgId, [entry.userId, ...workLogs.map(log => log.userId)])

  return serializeEntryDetail(entry, actor, workLogs, users)
}

/** GET /timesheets/exceptions: the supervisor's queue. Unresolved only, oldest first. */
export const listExceptionQueue = async (ctx: AppContext, actor: Actor, query: QueueQuery) => {
  if (query.siteId) await assertSiteAccess(ctx, actor, query.siteId)

  const entryFilter: Prisma.TimesheetEntryWhereInput = {
    ...(query.userId ? { userId: query.userId } : {}),
    ...(query.siteId ? { shift: { siteId: query.siteId } } : {})
  }

  const where: Prisma.TimesheetExceptionWhereInput = {
    resolved: false,
    ...(query.type ? { type: query.type } : {}),
    entry: { AND: [await readScope(ctx, actor), entryFilter] }
  }

  const [total, rows] = await Promise.all([
    ctx.prisma.timesheetException.count({ where }),
    ctx.prisma.timesheetException.findMany({
      where,
      include: { entry: { include: entryInclude } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...pageArgs(query)
    })
  ])

  const users = await loadUserNames(ctx.prisma, actor.orgId, rows.map(row => row.entry.userId))

  return { items: rows.map(row => serializeQueueItem(row, actor, users)), meta: pageMeta(query, total) }
}
