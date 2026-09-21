import { Errors } from './errors.js'
import type { Db } from './prisma.js'

/**
 * Validates that every file id exists and belongs to `orgId`. Call before storing a file reference
 * (documents, work logs, survey photos, contract documents). Throws VALIDATION_ERROR on `field`.
 */
export const assertFilesInOrg = async (db: Db, orgId: string, fileIds: string[], field = 'fileId'): Promise<void> => {
  const unique = [...new Set(fileIds)]

  if (unique.length === 0) return

  const found = await db.fileObject.count({ where: { id: { in: unique }, orgId } })

  if (found !== unique.length) {
    throw Errors.invalidField(field, 'file_not_found', 'One or more files do not exist. Upload the file first and use its id.')
  }
}
