import type { AppContext } from '../../context.js'
import { createStorageDriver } from './storage.js'

/** Uploads get this long to be attached to something (a survey, a signature, a work log) before they count as orphans. */
export const ORPHAN_GRACE_DAYS = 7

const BATCH = 200

/**
 * Deletes files that no record points to any more (a photo removed from a survey, an upload whose form was
 * abandoned). One statement both re-checks every reference and deletes the row, so a file attached between two
 * runs is never lost; the bytes are removed afterwards. Returns how many files were deleted.
 *
 * Every column that can hold a file id must be listed here: user_documents.fileId, contracts.documentFileId,
 * work_logs.fileId, lead_site_surveys.photoFileIds and users.image (a URL that may embed the id).
 */
export const sweepOrphanFiles = async (ctx: AppContext): Promise<number> => {
  const storage = createStorageDriver(ctx.config)
  const cutoff = new Date(Date.now() - ORPHAN_GRACE_DAYS * 24 * 3600 * 1000)
  let deleted = 0

  for (;;) {
    const rows = await ctx.prisma.$queryRaw<Array<{ id: string; key: string }>>`
      DELETE FROM files f
      WHERE f.id IN (
        SELECT c.id FROM files c
        WHERE c."createdAt" < ${cutoff}
          AND NOT EXISTS (SELECT 1 FROM user_documents d WHERE d."fileId" = c.id)
          AND NOT EXISTS (SELECT 1 FROM contracts k WHERE k."documentFileId" = c.id)
          AND NOT EXISTS (SELECT 1 FROM work_logs w WHERE w."fileId" = c.id)
          AND NOT EXISTS (SELECT 1 FROM lead_site_surveys s WHERE c.id = ANY (s."photoFileIds"))
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.image LIKE '%' || c.id || '%')
        ORDER BY c."createdAt"
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING f.id, f.key`

    for (const row of rows) {
      // A missing object is fine (already gone); anything else is logged and the bytes are left for manual cleanup
      await storage.delete(row.key).catch(error => ctx.log.error({ err: error, fileId: row.id }, 'could not delete orphan file bytes'))
    }

    deleted += rows.length

    if (rows.length < BATCH) return deleted
  }
}
