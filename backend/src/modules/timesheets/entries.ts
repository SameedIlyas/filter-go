import type { AppContext } from '../../context.js'
import type { Prisma } from '../../generated/prisma/client.js'
import { siteIdFilter } from '../../lib/access.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import type { Db } from '../../lib/prisma.js'
import { CLIENT_VISIBLE } from './state.js'

/** What every entry read needs: the shift and its site, plus the exception rows. */
export const entryInclude = { shift: { include: { site: true } }, exceptions: { orderBy: { createdAt: 'asc' } } } as const satisfies Prisma.TimesheetEntryInclude

export type EntryRow = Prisma.TimesheetEntryGetPayload<{ include: typeof entryInclude }>

/**
 * Which entries this actor may read (the base of every read query):
 *   ADMIN / SUPERVISOR  entries of shifts at their sites (supervisors: only sites they manage)
 *   FIELD_USER          their own entries
 *   CLIENT_USER         APPROVED / INVOICED entries at their client's sites
 * Anything outside it is "not found" to the caller.
 */
export const readScope = async (ctx: AppContext, actor: Actor): Promise<Prisma.TimesheetEntryWhereInput> => {
  if (actor.role === 'FIELD_USER') return { orgId: actor.orgId, userId: actor.id }

  const siteId = await siteIdFilter(ctx, actor)
  const shift = siteId ? { shift: { siteId } } : {}

  return actor.role === 'CLIENT_USER'
    ? { orgId: actor.orgId, status: { in: CLIENT_VISIBLE }, ...shift }
    : { orgId: actor.orgId, ...shift }
}

/** Takes the row lock that serialises every writer of one entry. Re-read the entry AFTER this call. */
export const lockEntry = async (db: Db, id: string): Promise<void> => {
  await db.$queryRaw`SELECT id FROM timesheet_entries WHERE id = ${id} FOR UPDATE`
}

/** Finds an entry inside `scope` (404 if it isn't there), locks it, and returns its fresh row. */
export const lockScopedEntry = async (db: Db, scope: Prisma.TimesheetEntryWhereInput, id: string): Promise<EntryRow> => {
  const found = await db.timesheetEntry.findFirst({ where: { AND: [{ id }, scope] }, select: { id: true } })

  if (!found) throw Errors.notFound('timesheet')

  await lockEntry(db, id)

  return db.timesheetEntry.findUniqueOrThrow({ where: { id }, include: entryInclude })
}

/** id -> { id, name } for the workers named on a page of entries (there is no user relation on the entry). */
export const loadUserNames = async (db: Db, orgId: string, ids: string[]): Promise<Map<string, { id: string; name: string }>> => {
  const users = await db.user.findMany({ where: { orgId, id: { in: [...new Set(ids)] } }, select: { id: true, name: true } })

  return new Map(users.map(user => [user.id, user]))
}

/** A no-show entry that later gets real times (adjust / correct) turns its shift back into COMPLETED work. */
export const reviveNoShowShift = async (db: Db, entry: { shiftId: string; clockInAt: Date | null }, hasTimes: boolean): Promise<boolean> => {
  if (entry.clockInAt !== null || !hasTimes) return false

  const revived = await db.shift.updateMany({ where: { id: entry.shiftId, status: 'NO_SHOW' }, data: { status: 'COMPLETED' } })

  return revived.count === 1
}
