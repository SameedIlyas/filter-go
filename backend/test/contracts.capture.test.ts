import { writeFileSync } from 'node:fs'

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'

import { body, createTestApp, makeFile, resetDb } from './helpers.js'
import type { TestApp } from './helpers.js'
import { buildWorld, draftBody, validLine, weekly } from './contracts.support.js'
import type { World } from './contracts.support.js'

const OUT = 'C:/Users/Sameed/AppData/Local/Temp/claude/C--Users-Sameed-Documents-AimTechAI-new-project/8fd7f7d2-6125-4380-a5f9-ba08fafc09d9/scratchpad/contracts-capture.json'

let t: TestApp
let w: World
const captured: Record<string, unknown> = {}

beforeAll(async () => {
  t = await createTestApp()
})
afterAll(() => t.close())
beforeEach(async () => {
  await resetDb(t.prisma)
  w = await buildWorld(t)
})

it('captures real responses', async () => {
  const a = w.admin.token
  const cap = async (name: string, method: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string, token: string | undefined, payload?: unknown, query?: Record<string, string>) => {
    const response = await w.api[method](url, { token, body: payload, query })

    captured[name] = { method: method.toUpperCase(), url, query, status: response.statusCode, request: payload, response: body(response) }

    return body(response)
  }

  const service = (await cap('services.create', 'post', '/v1/services', a, { name: 'Deep clean', description: 'Kitchens and washrooms' })).data?.service
  await cap('services.list', 'get', '/v1/services', a, undefined, { active: 'true' })
  await cap('services.patch', 'patch', `/v1/services/${service.id}`, a, { description: 'Kitchens, washrooms and floors' })
  await cap('services.duplicate', 'post', '/v1/services', a, { name: 'Deep clean' })

  await cap('taxRates.put', 'put', '/v1/tax-rates/GST', a, { ratePercent: '5.000' })
  await cap('taxRates.putOld', 'put', '/v1/tax-rates/OLD', a, { ratePercent: '7.5' })
  await cap('taxRates.list', 'get', '/v1/tax-rates', a)
  await cap('taxRates.delete', 'delete', '/v1/tax-rates/OLD', a)

  await cap('clients.create', 'post', '/v1/clients', a, { legalName: 'Globex Corp', billingEmail: 'ap@globex.test', billingAddress: '9 Elm St', paymentTerms: 'NET15' })
  await cap('clients.list', 'get', '/v1/clients', a, undefined, { q: 'glob' })
  await cap('clients.get', 'get', `/v1/clients/${w.clientId}`, a)
  await cap('clients.getSupervisor', 'get', `/v1/clients/${w.clientId}`, w.supervisor.token)
  await cap('clients.patch', 'patch', `/v1/clients/${w.clientId}`, a, { billingEmail: 'accounts@client.test', paymentTerms: 'DUE_ON_RECEIPT' })

  const site = (await cap('sites.create', 'post', `/v1/clients/${w.clientId}/sites`, a, {
    name: 'Depot',
    address: '5 Dock Rd, Chicago',
    lat: 41.8781,
    lng: -87.6298,
    timezone: 'America/Chicago',
    accessNotes: 'Key at front desk',
    contactName: 'Sam Rivera',
    contactPhone: '312-555-0100'
  })).data?.site
  await cap('sites.createBadCoords', 'post', `/v1/clients/${w.clientId}/sites`, a, { name: 'Bad', address: 'x', lat: 12 })
  await cap('sites.list', 'get', '/v1/sites', w.supervisor.token, undefined, { clientId: w.clientId })
  await cap('sites.get', 'get', `/v1/sites/${site.id}`, a)
  await cap('sites.patch', 'patch', `/v1/sites/${site.id}`, a, { accessNotes: 'Use side door', active: true })

  const create = await cap('contracts.create', 'post', '/v1/contracts', a, {
    ...draftBody(w.clientId, w.siteId, { autoRenew: true }),
    lines: [validLine(w.siteId, { serviceId: service.id, taxCode: 'GST', description: 'Nightly office clean' }), validLine(w.otherSiteId, { description: 'Warehouse sweep', billRate: '95.50', payRate: '18.00', qty: '2' })],
    coverage: [weekly(w.siteId), { siteId: w.otherSiteId, patternType: 'INTERVAL', intervalDays: 14 }]
  })
  const draft = create.data?.contract

  await cap('contracts.get', 'get', `/v1/contracts/${draft.id}`, a)
  await cap('contracts.getSupervisor', 'get', `/v1/contracts/${draft.id}`, w.supervisor.token)
  await cap('contracts.list', 'get', '/v1/contracts', a, undefined, { status: 'DRAFT', limit: '10' })
  await cap('contracts.patch', 'patch', `/v1/contracts/${draft.id}`, a, { endDate: '2027-06-30', billingCycle: 'BIWEEKLY' })
  await cap('contracts.putLines', 'put', `/v1/contracts/${draft.id}/lines`, a, {
    lines: [validLine(w.siteId, { serviceId: service.id, taxCode: 'GST', description: 'Nightly office clean' }), validLine(w.otherSiteId, { description: 'Warehouse sweep', billRate: '95.50', payRate: '18.00', qty: '2' })]
  })
  await cap('contracts.putCoverage', 'put', `/v1/contracts/${draft.id}/coverage`, a, {
    coverage: [weekly(w.siteId), { siteId: w.otherSiteId, patternType: 'AD_HOC', visitsPerPeriod: 4 }]
  })

  const bad = (await cap('contracts.createRough', 'post', '/v1/contracts', a, { clientId: w.clientId, startDate: '2026-06-01', endDate: '2026-05-01', billingType: 'MONTHLY_FIXED', billingCycle: 'PER_VISIT', lines: [validLine(w.siteId, { billRate: '0', taxCode: 'NOPE' })] })).data?.contract
  await cap('contracts.submitInvalid', 'post', `/v1/contracts/${bad.id}/submit`, a)
  await cap('contracts.createInvalidBody', 'post', '/v1/contracts', a, { ...draftBody(w.clientId, w.siteId), lines: [validLine(w.siteId, { billRate: '145.005' })] })

  await cap('contracts.submit', 'post', `/v1/contracts/${draft.id}/submit`, a)
  await cap('contracts.patchNotEditable', 'patch', `/v1/contracts/${draft.id}`, a, { autoRenew: false })
  await cap('contracts.submitAgain', 'post', `/v1/contracts/${draft.id}/submit`, a)
  const file = await makeFile(t, { name: 'signed-contract.pdf', contentType: 'application/pdf' })
  await cap('contracts.sign', 'post', `/v1/contracts/${draft.id}/sign`, a, { signedBy: 'Pat Rivera', signedAt: '2026-02-01T15:30:00Z', documentFileId: file.id })
  await cap('contracts.suspend', 'post', `/v1/contracts/${draft.id}/suspend`, a)
  await cap('contracts.resume', 'post', `/v1/contracts/${draft.id}/resume`, a)
  const v2 = (await cap('contracts.newVersion', 'post', `/v1/contracts/${draft.id}/new-version`, a)).data?.contract
  await cap('contracts.newVersionConflict', 'post', `/v1/contracts/${draft.id}/new-version`, a)
  await cap('taxRates.deleteInUse', 'delete', '/v1/tax-rates/GST', a)
  await cap('contracts.cancel', 'post', `/v1/contracts/${v2.id}/cancel`, a, { reason: 'Terms renegotiated elsewhere' })
  await cap('contracts.listLatest', 'get', '/v1/contracts', a, undefined, { latestOnly: 'true' })
  await cap('contracts.notFound', 'get', `/v1/contracts/${'00000000-0000-4000-8000-000000000000'}`, a)
  await cap('contracts.forbiddenClientUser', 'get', '/v1/contracts', w.clientUser.token)
  await cap('contracts.unauthenticated', 'get', '/v1/contracts', undefined)

  writeFileSync(OUT, JSON.stringify(captured, null, 2))
  expect(Object.keys(captured).length).toBeGreaterThan(40)
})
