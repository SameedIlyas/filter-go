import type { LightMyRequestResponse } from 'fastify'

import type { Role, User } from '../src/generated/prisma/client.js'
import { client, createUser, ensureOrg, loginAs, makeSite } from './helpers.js'
import type { TestApp } from './helpers.js'

export const ZERO_ID = '00000000-0000-4000-8000-000000000000'

export interface Person {
  user: User
  token: string
}

export const person = async (t: TestApp, role: Role, orgName?: string, extra: { clientId?: string; name?: string } = {}): Promise<Person> => {
  const org = await ensureOrg(t, orgName)
  const user = await createUser(t, { role, orgId: org.id, clientId: extra.clientId, name: extra.name })

  return { user, token: await loginAs(t, user.email) }
}

export const OTHER_ORG = 'Other Org'

/** A tiny but valid file of each supported kind (only the signature matters to the server). */
export const FILES = {
  jpeg: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('JFIF fake body')]),
  png: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('fake png body')]),
  webp: Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x10, 0, 0, 0]), Buffer.from('WEBPVP8 fake')]),
  heic: Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.from('fake heic body')]),
  heif: Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmif1'), Buffer.from('fake heif body')]),
  pdf: Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF'),
  exe: Buffer.from('MZ\x90\x00\x03 not allowed'),
  html: Buffer.from('<html><script>alert(1)</script></html>')
} as const

export interface MultipartPart {
  name: string
  value?: string
  filename?: string
  contentType?: string
  data?: Buffer
}

/** Builds a multipart/form-data body by hand for app.inject. */
export const multipart = (parts: MultipartPart[], boundary = '----platformtestboundary'): { payload: Buffer; headers: Record<string, string> } => {
  const chunks: Buffer[] = []

  for (const part of parts) {
    const disposition = `Content-Disposition: form-data; name="${part.name}"${part.filename !== undefined ? `; filename="${part.filename}"` : ''}`
    const type = part.contentType ? `\r\nContent-Type: ${part.contentType}` : ''

    chunks.push(Buffer.from(`--${boundary}\r\n${disposition}${type}\r\n\r\n`), part.data ?? Buffer.from(part.value ?? ''), Buffer.from('\r\n'))
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`))

  return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } }
}

export const upload = (
  t: TestApp,
  token: string | undefined,
  input: { data: Buffer; filename?: string; contentType?: string; fieldName?: string; fields?: Array<[string, string]> }
): Promise<LightMyRequestResponse> => {
  const { payload, headers } = multipart([
    ...(input.fields ?? []).map(([name, value]) => ({ name, value })),
    { name: input.fieldName ?? 'file', filename: input.filename ?? 'photo.jpg', contentType: input.contentType ?? 'image/jpeg', data: input.data }
  ])

  return t.app.inject({
    method: 'POST',
    url: '/v1/files',
    payload,
    headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) }
  })
}

export const api = (t: TestApp) => client(t.app)

/** A site with a supervisor-relevant fixture in the default org. */
export const siteIn = async (t: TestApp, name: string, orgName?: string) => makeSite(t, { orgId: (await ensureOrg(t, orgName)).id, name })
