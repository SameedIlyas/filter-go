import type { FileObject } from '../../generated/prisma/client.js'

/** The storage key and uploader are internal and never leave the API. */
export const serializeFile = (file: FileObject) => ({
  id: file.id,
  originalName: file.originalName,
  contentType: file.contentType,
  size: file.size,
  createdAt: file.createdAt
})
