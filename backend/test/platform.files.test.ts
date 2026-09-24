import { readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { body, client, createTestApp, ensureOrg, makeClient, makeContract, makeSchedule, makeShift, makeSite, resetDb } from './helpers.js'
import type { TestApp } from './helpers.js'
import { FILES, OTHER_ORG, ZERO_ID, multipart, person, upload } from './platform.helpers.js'
import type { Person } from './platform.helpers.js'

let t: TestApp
let small: TestApp
let admin: Person
let supervisor: Person
let fieldA: Person
let fieldB: Person
let otherAdmin: Person

const LIMIT = 2048

beforeAll(async () => {
  t = await createTestApp()
  small = await createTestApp({ MAX_UPLOAD_BYTES: String(LIMIT) })
})

afterAll(async () => {
  await t.close()
  await small.close()
  await rm(t.config.storage.dir, { recursive: true, force: true })
})

beforeEach(async () => {
  await resetDb(t.prisma)

  admin = await person(t, 'ADMIN')
  supervisor = await person(t, 'SUPERVISOR')
  fieldA = await person(t, 'FIELD_USER')
  fieldB = await person(t, 'FIELD_USER')
  otherAdmin = await person(t, 'ADMIN', OTHER_ORG)
})

const get = (token: string | undefined, id: string) => client(t.app).get(`/v1/files/${id}`, { token })

const uploadOk = async (who: Person, data: Buffer = FILES.jpeg, filename = 'photo.jpg') => {
  const response = await upload(t, who.token, { data, filename })

  expect(response.statusCode).toBe(201)

  return body(response).data?.file as { id: string; originalName: string; contentType: string; size: number; createdAt: string }
}

describe('POST /files', () => {
  it('rejects anonymous callers', async () => {
    const response = await upload(t, undefined, { data: FILES.jpeg })

    expect(response.statusCode).toBe(401)
    expect(await t.prisma.fileObject.count()).toBe(0)
  })

  it.each([
    ['jpeg', FILES.jpeg, 'image/jpeg'],
    ['png', FILES.png, 'image/png'],
    ['webp', FILES.webp, 'image/webp'],
    ['heic', FILES.heic, 'image/heic'],
    ['heif', FILES.heif, 'image/heif'],
    ['pdf', FILES.pdf, 'application/pdf']
  ])('accepts %s, identified by its bytes', async (_name, data, contentType) => {
    for (const who of [admin, supervisor, fieldA]) {
      const response = await upload(t, who.token, { data })

      expect(response.statusCode).toBe(201)
      expect(body(response).data?.file).toMatchObject({ contentType, size: data.length })
    }
  })

  it('stores the bytes under a server-generated key and records the file and an audit row', async () => {
    const file = await uploadOk(fieldA, FILES.png, 'my scan.png')
    const row = await t.prisma.fileObject.findUniqueOrThrow({ where: { id: file.id } })

    expect(row.key).toMatch(new RegExp(`^${fieldA.user.orgId}/${new Date().getUTCFullYear()}/[0-9a-f-]{36}$`))
    expect(row).toMatchObject({ orgId: fieldA.user.orgId, uploadedById: fieldA.user.id, originalName: 'my scan.png', contentType: 'image/png' })
    expect(await readFile(join(t.config.storage.dir, row.key))).toEqual(FILES.png)

    const [event] = await t.prisma.auditEvent.findMany({ where: { entity: 'file', action: 'uploaded' } })

    expect(event).toMatchObject({ entityId: file.id, actorId: fieldA.user.id, orgId: fieldA.user.orgId, type: 'file.uploaded' })
    expect(event?.diff).toEqual({ contentType: 'image/png', size: FILES.png.length, purpose: null })
  })

  it('the response exposes only id, name, type, size and time', async () => {
    const file = await uploadOk(admin)

    expect(Object.keys(file).sort()).toEqual(['contentType', 'createdAt', 'id', 'originalName', 'size'])
  })

  it('never trusts the client content-type or extension: a script labelled image/jpeg is refused', async () => {
    for (const data of [FILES.exe, FILES.html, Buffer.alloc(0), Buffer.from('GIF89a....')]) {
      const response = await upload(t, admin.token, { data, filename: 'photo.jpg', contentType: 'image/jpeg' })

      expect(response.statusCode).toBe(415)
      expect(body(response).error?.code).toBe('UNSUPPORTED_FILE_TYPE')
    }

    expect(await t.prisma.fileObject.count()).toBe(0)
  })

  it('a real jpeg with a lying name and content-type is stored as what it is', async () => {
    const response = await upload(t, admin.token, { data: FILES.jpeg, filename: 'invoice.pdf', contentType: 'application/pdf' })

    expect(body(response).data?.file.contentType).toBe('image/jpeg')
  })

  it('sanitises the original name: no paths, no control characters, no header-breaking characters', async () => {
    const names: Array<[string, string]> = [
      ['..\\..\\windows\\evil<>.jpg', 'evil__.jpg'],
      ['../../etc/passwd.jpg', 'passwd.jpg'],
      ['.htaccess', 'htaccess'],
      ['a‮gpj.exe.jpg', 'agpj.exe.jpg'],
      ['   ', 'file']
    ]

    for (const [raw, expected] of names) {
      const file = await uploadOk(admin, FILES.jpeg, raw)

      expect(file.originalName).toBe(expected)
    }

    const stored = await t.prisma.fileObject.findMany()

    expect(stored.every(row => !row.key.includes('..') && !row.key.includes('evil'))).toBe(true)
  })

  it('accepts a file exactly at the size limit and refuses one byte more (413 FILE_TOO_LARGE)', async () => {
    const admin2 = await person(small, 'ADMIN')
    const exact = Buffer.concat([FILES.jpeg, Buffer.alloc(LIMIT - FILES.jpeg.length)])
    const over = Buffer.concat([FILES.jpeg, Buffer.alloc(LIMIT + 1 - FILES.jpeg.length)])

    const ok = await upload(small, admin2.token, { data: exact })
    const tooBig = await upload(small, admin2.token, { data: over })

    expect(ok.statusCode).toBe(201)
    expect(tooBig.statusCode).toBe(413)
    expect(body(tooBig).error?.code).toBe('FILE_TOO_LARGE')
    expect(await small.prisma.fileObject.count()).toBe(1)
    expect(await readdir(join(small.config.storage.dir, admin2.user.orgId, String(new Date().getUTCFullYear())))).toHaveLength(1)
  })

  it('requires a multipart body with a "file" field', async () => {
    const json = await client(t.app).post('/v1/files', { token: admin.token, body: { file: 'x' } })
    const noFile = multipart([{ name: 'purpose', value: 'x' }])
    const wrongName = await upload(t, admin.token, { data: FILES.jpeg, fieldName: 'upload' })
    const missing = await t.app.inject({ method: 'POST', url: '/v1/files', payload: noFile.payload, headers: { ...noFile.headers, authorization: `Bearer ${admin.token}` } })

    expect(json.statusCode).toBe(415)
    expect(body(json).error?.code).toBe('UNSUPPORTED_MEDIA_TYPE')
    expect(wrongName.statusCode).toBe(400)
    expect(missing.statusCode).toBe(400)
    expect(await t.prisma.fileObject.count()).toBe(0)
  })

  it('more than one file in a request is a 400 and stores nothing', async () => {
    const { payload, headers } = multipart([
      { name: 'file', filename: 'first.jpg', contentType: 'image/jpeg', data: FILES.jpeg },
      { name: 'file', filename: 'second.png', contentType: 'image/png', data: FILES.png },
      { name: 'purpose', value: 'late' }
    ])
    const response = await t.app.inject({ method: 'POST', url: '/v1/files', payload, headers: { ...headers, authorization: `Bearer ${admin.token}` } })

    expect(response.statusCode).toBe(400)
    expect(body(response).error?.details?.issues[0]).toMatchObject({ field: 'file', code: 'invalid_upload' })
    expect(await t.prisma.fileObject.count()).toBe(0)
  })

  it('validates the optional purpose field and rejects unknown text fields', async () => {
    const good = await upload(t, admin.token, { data: FILES.jpeg, fields: [['purpose', ' Licence ']] })
    const badPurpose = await upload(t, admin.token, { data: FILES.jpeg, fields: [['purpose', 'has space!']] })
    const unknown = await upload(t, admin.token, { data: FILES.jpeg, fields: [['owner', 'someone']] })

    expect(good.statusCode).toBe(201)
    expect(badPurpose.statusCode).toBe(400)
    expect(unknown.statusCode).toBe(400)

    const [event] = await t.prisma.auditEvent.findMany({ where: { entity: 'file' } })

    expect((event?.diff as { purpose: string }).purpose).toBe('licence')
  })
})

describe('GET /files/:id authorisation', () => {
  it('requires a session and a valid id', async () => {
    const file = await uploadOk(fieldA)

    expect((await get(undefined, file.id)).statusCode).toBe(401)
    expect((await get(admin.token, 'nope')).statusCode).toBe(400)
    expect((await get(admin.token, ZERO_ID)).statusCode).toBe(404)
  })

  it('admin and supervisor of the organization can download; the bytes are intact', async () => {
    const file = await uploadOk(fieldA, FILES.pdf, 'contract.pdf')

    for (const who of [admin, supervisor, fieldA]) {
      const response = await get(who.token, file.id)

      expect(response.statusCode).toBe(200)
      expect(response.rawPayload).toEqual(FILES.pdf)
    }
  })

  it("another field user cannot read someone else's upload (404, same as missing)", async () => {
    const file = await uploadOk(fieldA)
    const denied = await get(fieldB.token, file.id)
    const missing = await get(fieldB.token, ZERO_ID)

    expect(denied.statusCode).toBe(404)
    expect(body(denied).error).toMatchObject({ code: 'NOT_FOUND', message: body(missing).error?.message })
  })

  it('a file of another organization is 404 for everyone there, even admins', async () => {
    const file = await uploadOk(fieldA)

    expect((await get(otherAdmin.token, file.id)).statusCode).toBe(404)

    const theirs = await uploadOk(otherAdmin)

    expect((await get(admin.token, theirs.id)).statusCode).toBe(404)
  })

  it('a client user may only read PHOTO work logs at their own client sites (or their own uploads)', async () => {
    const org = await ensureOrg(t)
    const fixture = await makeContract(t, { orgId: org.id })
    const otherFixture = await makeContract(t, { orgId: org.id })
    const clientUser = await person(t, 'CLIENT_USER', undefined, { clientId: fixture.client.id })
    const schedule = await makeSchedule(t, fixture)
    const otherSchedule = await makeSchedule(t, otherFixture)
    const shift = await makeShift(t, schedule, { assignedUserId: fieldA.user.id })
    const otherShift = await makeShift(t, otherSchedule, { assignedUserId: fieldA.user.id })

    const photo = await uploadOk(fieldA)
    const note = await uploadOk(fieldA)
    const foreignPhoto = await uploadOk(fieldA)
    const unreferenced = await uploadOk(fieldA)

    const log = (shiftId: string, fileId: string, kind: 'PHOTO' | 'NOTE') =>
      t.prisma.workLog.create({ data: { orgId: org.id, shiftId, userId: fieldA.user.id, kind, fileId, body: kind === 'NOTE' ? 'n' : undefined } })

    await log(shift.id, photo.id, 'PHOTO')
    await log(shift.id, note.id, 'NOTE')
    await log(otherShift.id, foreignPhoto.id, 'PHOTO')

    expect((await get(clientUser.token, photo.id)).statusCode).toBe(200)
    expect((await get(clientUser.token, note.id)).statusCode).toBe(404)
    expect((await get(clientUser.token, foreignPhoto.id)).statusCode).toBe(404)
    expect((await get(clientUser.token, unreferenced.id)).statusCode).toBe(404)

    const own = await uploadOk(clientUser)

    expect((await get(clientUser.token, own.id)).statusCode).toBe(200)
  })

  it('a client user without a client cannot read work-log photos', async () => {
    const org = await ensureOrg(t)
    const fixture = await makeContract(t, { orgId: org.id })
    const shift = await makeShift(t, await makeSchedule(t, fixture), { assignedUserId: fieldA.user.id })
    const photo = await uploadOk(fieldA)
    const orphan = await person(t, 'CLIENT_USER')

    await t.prisma.workLog.create({ data: { orgId: org.id, shiftId: shift.id, userId: fieldA.user.id, kind: 'PHOTO', fileId: photo.id } })

    expect((await get(orphan.token, photo.id)).statusCode).toBe(404)
  })

  it('a photo logged in another organization never opens up cross-org access', async () => {
    const otherOrg = await ensureOrg(t, OTHER_ORG)
    const client = await makeClient(t, { orgId: otherOrg.id })
    const site = await makeSite(t, { orgId: otherOrg.id, clientId: client.id })
    const clientUser = await person(t, 'CLIENT_USER', OTHER_ORG, { clientId: client.id })
    const photo = await uploadOk(fieldA)
    const fixture = await makeContract(t, { orgId: otherOrg.id, client, site })
    const shift = await makeShift(t, await makeSchedule(t, fixture))

    await t.prisma.workLog.create({ data: { orgId: otherOrg.id, shiftId: shift.id, userId: otherAdmin.user.id, kind: 'PHOTO', fileId: photo.id } })

    expect((await get(clientUser.token, photo.id)).statusCode).toBe(404)
  })
})

describe('GET /files/:id response headers', () => {
  it('sends images inline and everything else as an attachment, with hardening headers', async () => {
    const image = await uploadOk(admin, FILES.jpeg, 'site photo.jpg')
    const pdf = await uploadOk(admin, FILES.pdf, 'contract.pdf')

    const asImage = await get(admin.token, image.id)
    const asPdf = await get(admin.token, pdf.id)

    expect(asImage.headers['content-type']).toBe('image/jpeg')
    expect(asImage.headers['content-disposition']).toBe(`inline; filename="site photo.jpg"; filename*=UTF-8''site%20photo.jpg`)
    expect(asPdf.headers['content-type']).toBe('application/pdf')
    expect(asPdf.headers['content-disposition']).toMatch(/^attachment; /)

    for (const response of [asImage, asPdf]) {
      expect(response.headers['x-content-type-options']).toBe('nosniff')
      expect(response.headers['cache-control']).toBe('private, no-store')
      expect(response.headers['content-security-policy']).toBe("default-src 'none'; sandbox")
      expect(Number(response.headers['content-length'])).toBe(response.rawPayload.length)
    }
  })

  it('encodes non-ASCII names safely in Content-Disposition', async () => {
    const file = await uploadOk(admin, FILES.pdf, 'résumé (final) & co.pdf')
    const disposition = (await get(admin.token, file.id)).headers['content-disposition'] as string

    expect(disposition).toBe(`attachment; filename="r_sum_ (final) & co.pdf"; filename*=UTF-8''r%C3%A9sum%C3%A9%20%28final%29%20%26%20co.pdf`)
    expect(disposition).not.toMatch(/[\r\n]/)
  })

  it('is 404 (not 500) when the bytes have gone missing from storage', async () => {
    const file = await uploadOk(admin)
    const row = await t.prisma.fileObject.findUniqueOrThrow({ where: { id: file.id } })

    await rm(join(t.config.storage.dir, row.key))

    expect((await get(admin.token, file.id)).statusCode).toBe(404)
  })

  it('a file row created without bytes (foreign key path) is also just 404', async () => {
    const stray = await t.prisma.fileObject.create({
      data: { orgId: admin.user.orgId, key: `${admin.user.orgId}/2026/never-written`, originalName: 'x.jpg', contentType: 'image/jpeg', size: 1, uploadedById: admin.user.id }
    })

    expect((await get(admin.token, stray.id)).statusCode).toBe(404)
  })
})
