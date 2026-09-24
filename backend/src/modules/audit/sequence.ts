import type { Db } from '../../lib/prisma.js'

/**
 * Atomically increments and returns a per-organization counter (single SQL statement, safe under concurrency).
 * Use inside the transaction that consumes the number so a rollback doesn't skip it more than necessary.
 */
export const nextSequence = async (db: Db, orgId: string, key: string): Promise<number> => {
  const rows = await db.$queryRaw<Array<{ value: number }>>`
    INSERT INTO sequences ("orgId", "key", "value") VALUES (${orgId}, ${key}, 1)
    ON CONFLICT ("orgId", "key") DO UPDATE SET "value" = sequences."value" + 1
    RETURNING "value"`

  const value = rows[0]?.value

  if (value === undefined) throw new Error('sequence increment returned no row')

  return Number(value)
}

/** "INV-2026-000042" */
export const formatNumber = (prefix: string, year: number | null, value: number, width = 6): string =>
  [prefix, year, String(value).padStart(width, '0')].filter(part => part !== null).join('-')
