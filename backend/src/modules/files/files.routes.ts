import type { MultipartFile } from '@fastify/multipart'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { AppError, Errors } from '../../lib/errors.js'
import { ok } from '../../lib/response.js'
import { parse, uuidParams } from '../../lib/validation.js'
import { actorFromReq, clientMeta, requireAuth } from '../../plugins/auth.js'
import { contentDisposition } from './file-name.js'
import { getReadableFile, uploadFile } from './files.service.js'
import { serializeFile } from './serializers.js'
import { createStorageDriver } from './storage.js'

const uploadFields = z.strictObject({
  purpose: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{1,40}$/, 'Use letters, digits, "_" or "-" (max 40).')
    .optional()
})

const tooLarge = (limit: number) => new AppError(413, 'FILE_TOO_LARGE', `The file is larger than the ${Math.floor(limit / 1024 / 1024)} MB limit.`)

/** Text fields sent before the file part (fields after it are not read). */
const textFields = (part: MultipartFile): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(part.fields).flatMap(([name, value]) =>
      value && !Array.isArray(value) && value.type === 'field' ? [[name, value.value]] : []
    )
  )

// Multipart limits (one file, few fields) surface as stream errors: answer them as a bad request, not a 500
const MALFORMED_UPLOAD_CODES = new Set(['FST_FILES_LIMIT', 'FST_PARTS_LIMIT', 'FST_FIELDS_LIMIT', 'ERR_STREAM_PREMATURE_CLOSE'])

const readUpload = async (req: FastifyRequest, maxBytes: number) => {
  if (!req.isMultipart()) {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the file as multipart/form-data with a "file" field.')
  }

  try {
    const part = await req.file()

    if (!part || part.fieldname !== 'file') throw Errors.invalidField('file', 'required', 'Attach the file in a form field named "file".')

    const fields = parse(uploadFields, textFields(part))
    // The size limit is enforced while reading, whatever content-length claimed
    const bytes = await part.toBuffer()

    if (part.file.truncated) throw tooLarge(maxBytes)

    return { originalName: part.filename, bytes, purpose: fields.purpose }
  } catch (error) {
    const code = (error as { code?: string }).code ?? ''

    if (code === 'FST_REQ_FILE_TOO_LARGE') throw tooLarge(maxBytes)
    if (MALFORMED_UPLOAD_CODES.has(code)) throw Errors.invalidField('file', 'invalid_upload', 'Send exactly one file, with at most a few small text fields.')

    throw error
  }
}

export const fileRoutes: FastifyPluginAsync = async app => {
  const ctx = app.ctx
  const storage = createStorageDriver(ctx.config)

  app.post('/files', { preHandler: requireAuth, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const actor = actorFromReq(req)
    const upload = await readUpload(req, ctx.config.storage.maxUploadBytes)
    const file = await uploadFile(ctx, storage, actor, upload, clientMeta(req))

    return reply.status(201).send(ok({ file: serializeFile(file) }))
  })

  app.get('/files/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const file = await getReadableFile(ctx, actorFromReq(req), id)
    const stored = await storage.open(file.key)

    if (!stored) {
      ctx.log.error({ fileId: file.id }, 'file bytes are missing from storage')

      throw Errors.notFound('file')
    }

    return reply
      .header('Content-Type', file.contentType)
      .header('Content-Length', stored.size)
      .header('Content-Disposition', contentDisposition(file.contentType.startsWith('image/') ? 'inline' : 'attachment', file.originalName))
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cache-Control', 'private, no-store')
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
      .send(stored.stream)
  })
}
