import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { AppContext } from '../src/context.js'
import { AppError } from '../src/lib/errors.js'
import { contentDisposition, sanitizeFileName } from '../src/modules/files/file-name.js'
import { detectFileType } from '../src/modules/files/file-type.js'
import { uploadFile } from '../src/modules/files/files.service.js'
import { createLocalStorage } from '../src/modules/files/storage.js'
import { documentStatus, worstStatus } from '../src/modules/users/compliance.js'
import { availabilityBody } from '../src/modules/users/platform.schemas.js'
import { FILES } from './platform.helpers.js'

describe('detectFileType', () => {
  it.each([
    ['jpeg', FILES.jpeg, 'image/jpeg', true],
    ['png', FILES.png, 'image/png', true],
    ['webp', FILES.webp, 'image/webp', true],
    ['heic', FILES.heic, 'image/heic', true],
    ['heif', FILES.heif, 'image/heif', true],
    ['pdf', FILES.pdf, 'application/pdf', false]
  ])('recognises %s', (_name, data, contentType, isImage) => {
    expect(detectFileType(data)).toEqual({ contentType, isImage })
  })

  it.each([
    ['empty', Buffer.alloc(0)],
    ['one byte', Buffer.from([0xff])],
    ['truncated png signature', Buffer.from([0x89, 0x50, 0x4e, 0x47])],
    ['RIFF that is not WebP (WAV)', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')])],
    ['ftyp with an unrelated brand (mp4)', Buffer.concat([Buffer.alloc(4), Buffer.from('ftypisom'), Buffer.alloc(8)])],
    ['ftyp avif', Buffer.concat([Buffer.alloc(4), Buffer.from('ftypavif'), Buffer.alloc(8)])],
    ['pdf marker not at the start', Buffer.from('\n%PDF-1.4')],
    ['html', FILES.html],
    ['windows executable', FILES.exe],
    ['gif', Buffer.from('GIF89a')],
    ['svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['zip', Buffer.from([0x50, 0x4b, 0x03, 0x04])]
  ])('refuses %s', (_name, data) => {
    expect(detectFileType(data)).toBeNull()
  })
})

describe('sanitizeFileName', () => {
  it.each([
    ['photo.jpg', 'photo.jpg'],
    ['my photo (1).png', 'my photo (1).png'],
    ['../../etc/passwd', 'passwd'],
    ['C:\\Users\\me\\scan.pdf', 'scan.pdf'],
    ['a<b>c:d"e|f?g*h.pdf', 'a_b_c_d_e_f_g_h.pdf'],
    ['tab\tand\nnewline.jpg', 'tabandnewline.jpg'],
    ['\u202Eexe.jpg', 'exe.jpg'],
    ['.env', 'env'],
    ['...', 'file'],
    ['trailing dots...', 'trailing dots'],
    ['', 'file'],
    ['   ', 'file'],
    ['a    b.jpg', 'a b.jpg'],
    ['Zoë.pdf', 'Zoë.pdf']
  ])('%j -> %j', (raw, expected) => {
    expect(sanitizeFileName(raw)).toBe(expected)
  })

  it('caps the length but keeps a short extension', () => {
    const name = sanitizeFileName(`${'a'.repeat(300)}.pdf`)

    expect([...name]).toHaveLength(120)
    expect(name.endsWith('.pdf')).toBe(true)
    expect([...sanitizeFileName('b'.repeat(300))]).toHaveLength(120)
    expect([...sanitizeFileName(`${'c'.repeat(200)}.${'x'.repeat(40)}`)]).toHaveLength(120)
  })
})

describe('contentDisposition', () => {
  it('builds a quoted ASCII fallback plus an RFC 5987 name', () => {
    expect(contentDisposition('attachment', 'plain.pdf')).toBe(`attachment; filename="plain.pdf"; filename*=UTF-8''plain.pdf`)
    expect(contentDisposition('inline', "o'brien (1)*.jpg")).toBe(`inline; filename="o'brien (1)*.jpg"; filename*=UTF-8''o%27brien%20%281%29%2A.jpg`)
  })

  it('cannot be broken out of with quotes, backslashes, newlines or non-ASCII', () => {
    const header = contentDisposition('attachment', 'a"b\\c\r\nSet-Cookie: x=1é.pdf')

    expect(header).not.toMatch(/[\r\n]/)
    expect(header).toMatch(/^attachment; filename="a_b_c__Set-Cookie: x=1_\.pdf"; filename\*=UTF-8''/)
  })
})

describe('documentStatus / worstStatus', () => {
  it('has exact day boundaries', () => {
    expect(documentStatus(null, '2026-03-10')).toBe('VALID')
    expect(documentStatus('2026-03-09', '2026-03-10')).toBe('EXPIRED')
    expect(documentStatus('2026-03-10', '2026-03-10')).toBe('EXPIRING')
    expect(documentStatus('2026-04-09', '2026-03-10')).toBe('EXPIRING')
    expect(documentStatus('2026-04-10', '2026-03-10')).toBe('VALID')
  })

  it('counts 30 real days across month, leap-day and year ends', () => {
    expect(documentStatus('2028-03-01', '2028-01-31')).toBe('EXPIRING')
    expect(documentStatus('2028-03-02', '2028-01-31')).toBe('VALID')
    expect(documentStatus('2027-01-14', '2026-12-15')).toBe('EXPIRING')
    expect(documentStatus('2027-01-15', '2026-12-15')).toBe('VALID')
  })

  it('takes the worst status; an empty set is VALID', () => {
    expect(worstStatus([])).toBe('VALID')
    expect(worstStatus(['VALID', 'VALID'])).toBe('VALID')
    expect(worstStatus(['VALID', 'EXPIRING'])).toBe('EXPIRING')
    expect(worstStatus(['EXPIRING', 'EXPIRED', 'VALID'])).toBe('EXPIRED')
  })
})

describe('availabilityBody', () => {
  const parse = (windows: unknown[]) => availabilityBody.safeParse({ windows })
  const window = (weekday: number, startTime: string, endTime: string) => ({ weekday, startTime, endTime })

  it('accepts touching windows, other weekdays and an empty list', () => {
    expect(parse([]).success).toBe(true)
    expect(parse([window(1, '09:00', '12:00'), window(1, '12:00', '17:00'), window(2, '09:00', '17:00')]).success).toBe(true)
  })

  it('reports overlaps and inverted windows at the offending index', () => {
    const overlap = parse([window(1, '09:00', '12:00'), window(1, '11:00', '13:00')])
    const inverted = parse([window(1, '10:00', '10:00')])

    expect(overlap.success).toBe(false)
    expect(overlap.error?.issues[0]?.path).toEqual(['windows', 1, 'startTime'])
    expect(inverted.error?.issues[0]?.path).toEqual(['windows', 0, 'endTime'])
  })
})

describe('createLocalStorage', () => {
  let dir: string

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'platform-storage-'))
  })

  afterAll(() => rm(dir, { recursive: true, force: true }))

  it('stores, reads back and deletes bytes', async () => {
    const storage = createLocalStorage(dir)

    await storage.put('org1/2026/file-a', Buffer.from('hello'))

    const opened = await storage.open('org1/2026/file-a')
    const chunks: Buffer[] = []

    for await (const chunk of opened?.stream ?? Readable.from([])) chunks.push(chunk as Buffer)

    expect(opened?.size).toBe(5)
    expect(Buffer.concat(chunks).toString()).toBe('hello')
    expect(await readFile(join(dir, 'org1', '2026', 'file-a'), 'utf8')).toBe('hello')

    await storage.delete('org1/2026/file-a')

    expect(await storage.open('org1/2026/file-a')).toBeNull()
    await expect(storage.delete('org1/2026/file-a')).resolves.toBeUndefined()
  })

  it('never overwrites an existing object', async () => {
    const storage = createLocalStorage(dir)

    await storage.put('org1/2026/once', Buffer.from('first'))

    await expect(storage.put('org1/2026/once', Buffer.from('second'))).rejects.toThrow()
    expect(await readFile(join(dir, 'org1', '2026', 'once'), 'utf8')).toBe('first')
  })

  it.each([
    ['parent traversal', '../escape'],
    ['nested traversal', 'a/../../escape'],
    ['absolute path', '/etc/passwd'],
    ['windows absolute path', 'C:\\Windows\\win.ini'],
    ['backslash separator', 'a\\b'],
    ['dot segment', './file'],
    ['dots in a name', 'org/2026/file.jpg'],
    ['empty', ''],
    ['empty segment', 'a//b'],
    ['null byte', 'a\0b'],
    ['too deep', 'a/b/c/d/e/f'],
    ['url-encoded traversal', '%2e%2e/x'],
    ['space', 'a b']
  ])('refuses %s', async (_name, key) => {
    const storage = createLocalStorage(dir)

    await expect(storage.put(key, Buffer.from('x'))).rejects.toThrow('Invalid storage key.')
    await expect(storage.open(key)).rejects.toThrow('Invalid storage key.')
    await expect(storage.delete(key)).rejects.toThrow('Invalid storage key.')
  })

  it('a directory is not a file', async () => {
    const storage = createLocalStorage(dir)

    await storage.put('org2/2026/x', Buffer.from('x'))

    expect(await storage.open('org2/2026')).toBeNull()
  })
})

describe('uploadFile cleanup', () => {
  it('removes the stored bytes when the database write fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'platform-cleanup-'))
    const storage = createLocalStorage(dir)
    const put = vi.spyOn(storage, 'put')
    const remove = vi.spyOn(storage, 'delete')
    const ctx = {
      prisma: { $transaction: vi.fn().mockRejectedValue(new Error('db down')) },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    } as unknown as AppContext

    await expect(
      uploadFile(ctx, storage, { id: 'u1', orgId: 'o1', role: 'ADMIN', clientId: null }, { originalName: 'a.jpg', bytes: FILES.jpeg }, { ip: '1.1.1.1', userAgent: null })
    ).rejects.toThrow('db down')

    const key = put.mock.calls[0]?.[0] as string

    expect(remove).toHaveBeenCalledWith(key)
    expect(await storage.open(key)).toBeNull()

    await rm(dir, { recursive: true, force: true })
  })

  it('refuses an unsupported file before touching storage', async () => {
    const storage = createLocalStorage(tmpdir())
    const put = vi.spyOn(storage, 'put')
    const ctx = {} as AppContext

    await expect(
      uploadFile(ctx, storage, { id: 'u1', orgId: 'o1', role: 'ADMIN', clientId: null }, { originalName: 'a.exe', bytes: FILES.exe }, { ip: '1.1.1.1', userAgent: null })
    ).rejects.toMatchObject({ statusCode: 415, code: 'UNSUPPORTED_FILE_TYPE' } satisfies Partial<AppError>)
    expect(put).not.toHaveBeenCalled()
  })
})
