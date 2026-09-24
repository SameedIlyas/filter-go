import type { AppContext, ClientMeta } from '../../context.js'
import type { Prisma, UserDocument } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import { assertFilesInOrg } from '../../lib/file-refs.js'
import { fromDateOnlyOrNull, toDateOnly } from '../../lib/time.js'
import { recordAudit } from '../audit/record.js'
import type { CreateDocumentInput, UpdateDocumentInput } from './platform.schemas.js'

/** Keeps a self-service upload loop from growing one person's record without bound. */
const MAX_DOCUMENTS_PER_USER = 200

const snapshot = (document: UserDocument): Record<string, string | null> => ({
  type: document.type,
  fileId: document.fileId,
  expiresAt: fromDateOnlyOrNull(document.expiresAt),
  notes: document.notes
})

export const listDocuments = (ctx: AppContext, orgId: string, userId: string): Promise<UserDocument[]> =>
  ctx.prisma.userDocument.findMany({
    where: { userId, orgId },
    orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }]
  })

export const createDocument = async (
  ctx: AppContext,
  actor: Actor,
  userId: string,
  input: CreateDocumentInput,
  meta: ClientMeta
): Promise<UserDocument> =>
  ctx.prisma.$transaction(async tx => {
    if (input.fileId) await assertFilesInOrg(tx, actor.orgId, [input.fileId])

    if ((await tx.userDocument.count({ where: { userId, orgId: actor.orgId } })) >= MAX_DOCUMENTS_PER_USER) {
      throw Errors.unprocessable(`A person can have at most ${MAX_DOCUMENTS_PER_USER} documents.`)
    }

    const document = await tx.userDocument.create({
      data: {
        orgId: actor.orgId,
        userId,
        type: input.type,
        fileId: input.fileId ?? null,
        expiresAt: input.expiresAt ? toDateOnly(input.expiresAt) : null,
        notes: input.notes ?? null
      }
    })

    await recordAudit(tx, actor, { entity: 'user_document', entityId: document.id, action: 'created', diff: { userId, ...snapshot(document) }, meta })

    return document
  })

export const updateDocument = async (
  ctx: AppContext,
  actor: Actor,
  userId: string,
  documentId: string,
  input: UpdateDocumentInput,
  meta: ClientMeta
): Promise<UserDocument> =>
  ctx.prisma.$transaction(async tx => {
    const before = await tx.userDocument.findFirst({ where: { id: documentId, userId, orgId: actor.orgId } })

    if (!before) throw Errors.notFound('document')

    if (input.fileId) await assertFilesInOrg(tx, actor.orgId, [input.fileId])

    const data: Prisma.UserDocumentUncheckedUpdateInput = {
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.fileId !== undefined ? { fileId: input.fileId } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt ? toDateOnly(input.expiresAt) : null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {})
    }

    const updated = await tx.userDocument.update({ where: { id: documentId }, data })

    await recordAudit(tx, actor, {
      entity: 'user_document',
      entityId: documentId,
      action: 'updated',
      diff: { userId, before: snapshot(before), after: snapshot(updated) },
      meta
    })

    return updated
  })

export const deleteDocument = async (ctx: AppContext, actor: Actor, userId: string, documentId: string, meta: ClientMeta): Promise<void> => {
  await ctx.prisma.$transaction(async tx => {
    const before = await tx.userDocument.findFirst({ where: { id: documentId, userId, orgId: actor.orgId } })

    if (!before) throw Errors.notFound('document')

    // Conditional delete: a second concurrent delete finds nothing and answers 404 instead of double-auditing
    const removed = await tx.userDocument.deleteMany({ where: { id: documentId, userId, orgId: actor.orgId } })

    if (removed.count === 0) throw Errors.notFound('document')

    await recordAudit(tx, actor, { entity: 'user_document', entityId: documentId, action: 'deleted', diff: { userId, ...snapshot(before) }, meta })
  })
}
