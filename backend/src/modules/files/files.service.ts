import { randomUUID } from 'node:crypto'

import type { AppContext, ClientMeta } from '../../context.js'
import type { FileObject } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { AppError, Errors } from '../../lib/errors.js'
import { recordAudit } from '../audit/record.js'
import { sanitizeFileName } from './file-name.js'
import { detectFileType } from './file-type.js'
import type { StorageDriver } from './storage.js'

export interface UploadInput {
  originalName: string
  bytes: Buffer
  purpose?: string
}

/** Verifies the type by magic bytes, stores the bytes under a server-generated key, then records the file. */
export const uploadFile = async (
  ctx: AppContext,
  storage: StorageDriver,
  actor: Actor,
  input: UploadInput,
  meta: ClientMeta
): Promise<FileObject> => {
  const detected = detectFileType(input.bytes)

  if (!detected) {
    throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'Only JPEG, PNG, WebP, HEIC and PDF files are accepted.')
  }

  // The key never contains anything the client sent
  const key = `${actor.orgId}/${new Date().getUTCFullYear()}/${randomUUID()}`

  await storage.put(key, input.bytes)

  try {
    return await ctx.prisma.$transaction(async tx => {
      const file = await tx.fileObject.create({
        data: {
          orgId: actor.orgId,
          key,
          originalName: sanitizeFileName(input.originalName),
          contentType: detected.contentType,
          size: input.bytes.length,
          uploadedById: actor.id
        }
      })

      await recordAudit(tx, actor, {
        entity: 'file',
        entityId: file.id,
        action: 'uploaded',
        diff: { contentType: file.contentType, size: file.size, purpose: input.purpose ?? null },
        meta
      })

      return file
    })
  } catch (error) {
    // No database row means nobody can ever download or delete these bytes: do not leave them behind
    await storage.delete(key).catch((cleanupError: unknown) => ctx.log.error({ err: cleanupError, key }, 'failed to remove orphaned upload'))

    throw error
  }
}

/** CLIENT_USER: only PHOTO work logs of shifts at one of their client's sites. */
const isClientPhoto = async (ctx: AppContext, actor: Actor, file: FileObject): Promise<boolean> => {
  if (!actor.clientId) return false

  const log = await ctx.prisma.workLog.findFirst({
    where: { orgId: actor.orgId, fileId: file.id, kind: 'PHOTO', shift: { site: { orgId: actor.orgId, clientId: actor.clientId } } },
    select: { id: true }
  })

  return log !== null
}

const mayRead = async (ctx: AppContext, actor: Actor, file: FileObject): Promise<boolean> => {
  if (actor.role === 'ADMIN' || actor.role === 'SUPERVISOR') return true
  if (file.uploadedById === actor.id) return true

  return actor.role === 'CLIENT_USER' ? isClientPhoto(ctx, actor, file) : false
}

/** A file of another organization and a file the caller may not read are both a plain 404. */
export const getReadableFile = async (ctx: AppContext, actor: Actor, id: string): Promise<FileObject> => {
  const file = await ctx.prisma.fileObject.findFirst({ where: { id, orgId: actor.orgId } })

  if (!file || !(await mayRead(ctx, actor, file))) throw Errors.notFound('file')

  return file
}
