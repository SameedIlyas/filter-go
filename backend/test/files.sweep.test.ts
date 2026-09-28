import { access, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { sweepOrphanFiles } from '../src/modules/files/files.sweep.js'
import { body, createTestApp, ensureOrg, makeClient, makeContract, makeSchedule, makeShift, resetDb } from './helpers.js'
import type { TestApp } from './helpers.js'
import { FILES, person, upload } from './platform.helpers.js'
import type { Person } from './platform.helpers.js'

let t: TestApp
let admin: Person

const DAY_MS = 24 * 3600 * 1000

beforeAll(async () => {
  t = await createTestApp()
})

afterAll(async () => {
  await t.close()
  await rm(t.config.storage.dir, { recursive: true, force: true })
})

beforeEach(async () => {
  await resetDb(t.prisma)
  admin = await person(t, 'ADMIN')
})

/** Uploads a file and backdates it, so it is past (or inside) the grace period. */
const stored = async (ageDays: number) => {
  const response = await upload(t, admin.token, { data: FILES.jpeg, filename: 'photo.jpg' })
  const { id } = body(response).data?.file as { id: string }

  const file = await t.prisma.fileObject.update({ where: { id }, data: { createdAt: new Date(Date.now() - ageDays * DAY_MS) } })

  return file
}

const onDisk = async (key: string) =>
  access(join(t.config.storage.dir, key)).then(
    () => true,
    () => false
  )

describe('sweepOrphanFiles', () => {
  it('deletes old files nothing points to, row and bytes, and keeps recent uploads', async () => {
    const orphan = await stored(10)
    const fresh = await stored(1)

    expect(await sweepOrphanFiles(t.ctx)).toBe(1)
    expect(await t.prisma.fileObject.findUnique({ where: { id: orphan.id } })).toBeNull()
    expect(await onDisk(orphan.key)).toBe(false)
    expect(await t.prisma.fileObject.findUnique({ where: { id: fresh.id } })).not.toBeNull()
    expect(await onDisk(fresh.key)).toBe(true)
  })

  it('keeps every file that is still referenced, whatever its age', async () => {
    const org = await ensureOrg(t)
    const [surveyPhoto, signedPdf, workPhoto, userDoc, avatar] = await Promise.all([stored(30), stored(30), stored(30), stored(30), stored(30)])

    const lead = await t.prisma.lead.create({
      data: { orgId: org.id, companyName: 'Acme', contactName: 'Jane', email: 'jane@acme.test', source: 'MANUAL' }
    })

    await t.prisma.leadSiteSurvey.create({ data: { leadId: lead.id, address: '1 Main St', units: [], photoFileIds: [surveyPhoto.id] } })

    const clientRow = await makeClient(t, { orgId: org.id })
    const fixture = await makeContract(t, { orgId: org.id, client: clientRow, status: 'ACTIVE' })

    await t.prisma.contract.update({ where: { id: fixture.contract.id }, data: { documentFileId: signedPdf.id } })

    const shift = await makeShift(t, await makeSchedule(t, fixture))

    await t.prisma.workLog.create({ data: { orgId: org.id, shiftId: shift.id, userId: admin.user.id, kind: 'PHOTO', fileId: workPhoto.id } })
    await t.prisma.userDocument.create({ data: { orgId: org.id, userId: admin.user.id, type: 'license', fileId: userDoc.id } })
    await t.prisma.user.update({ where: { id: admin.user.id }, data: { image: `https://portal.test/api/files/${avatar.id}` } })

    const orphan = await stored(30)

    expect(await sweepOrphanFiles(t.ctx)).toBe(1)
    expect(await t.prisma.fileObject.findUnique({ where: { id: orphan.id } })).toBeNull()

    for (const file of [surveyPhoto, signedPdf, workPhoto, userDoc, avatar]) {
      expect(await t.prisma.fileObject.findUnique({ where: { id: file.id } })).not.toBeNull()
    }
  })

  it('is safe to run twice', async () => {
    await stored(10)

    expect(await sweepOrphanFiles(t.ctx)).toBe(1)
    expect(await sweepOrphanFiles(t.ctx)).toBe(0)
  })
})
