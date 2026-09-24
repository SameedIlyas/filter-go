import { Prisma } from '../../generated/prisma/client.js'

/*
 * Row locks used to make check-then-write sequences safe under concurrent requests (docs/ARCHITECTURE.md 2.11).
 * Lock order everywhere in this module: schedule -> shift -> user. Keeping one order prevents deadlocks.
 *
 *  - a schedule is locked FOR UPDATE by status transitions and FOR SHARE by anything that edits its shifts, so a
 *    lock/unpublish can never interleave with an assignment
 *  - a shift is locked FOR UPDATE while it is assigned, offered, edited or cancelled
 *  - a user is locked FOR UPDATE while they are being placed on a shift, so the overlap check + write is atomic
 */

const lockedCount = async (tx: Prisma.TransactionClient, query: Prisma.Sql): Promise<number> => (await tx.$queryRaw<Array<{ id: string }>>(query)).length

export const lockScheduleForUpdate = (tx: Prisma.TransactionClient, id: string) =>
  lockedCount(tx, Prisma.sql`SELECT id FROM "schedules" WHERE id = ${id} FOR UPDATE`)

export const lockScheduleShared = (tx: Prisma.TransactionClient, id: string) =>
  lockedCount(tx, Prisma.sql`SELECT id FROM "schedules" WHERE id = ${id} FOR SHARE`)

export const lockShift = (tx: Prisma.TransactionClient, id: string) => lockedCount(tx, Prisma.sql`SELECT id FROM "shifts" WHERE id = ${id} FOR UPDATE`)

export const lockUser = (tx: Prisma.TransactionClient, id: string) => lockedCount(tx, Prisma.sql`SELECT id FROM "users" WHERE id = ${id} FOR UPDATE`)

/** Serialises schedule generation for one contract number + site so two requests can't both pass the overlap check. */
export const lockGeneration = async (tx: Prisma.TransactionClient, orgId: string, contractNumber: string, siteId: string): Promise<void> => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`schedule-generation:${orgId}:${contractNumber}:${siteId}`}, 0))`
}
