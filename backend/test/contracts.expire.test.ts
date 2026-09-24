import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { allJobs as registered } from '../src/jobs/registry.js'
import { runJobNow } from '../src/jobs/scheduler.js'
import { jobs } from '../src/modules/contracts/contracts.jobs.js'
import { expireContracts, renewedEndDate } from '../src/modules/contracts/contracts.expiry.js'
import { createTestApp, ensureOrg, makeContract, resetDb } from './helpers.js'
import type { TestApp } from './helpers.js'

let t: TestApp

beforeAll(async () => {
  t = await createTestApp()
})

afterAll(() => t.close())

beforeEach(async () => {
  await resetDb(t.prisma)
})

// 21:00 on 2026-03-09 in Chicago (CDT starts 03-08, so UTC-5) but already 2026-03-10 in UTC
const NOW = new Date('2026-03-10T02:00:00Z')
const contract = (input: Parameters<typeof makeContract>[1] = {}) => makeContract(t, { billingType: 'PER_VISIT', ...input })
const reload = (id: string) => t.prisma.contract.findUniqueOrThrow({ where: { id } })
const audits = (id: string) => t.prisma.auditEvent.findMany({ where: { entityId: id }, orderBy: { createdAt: 'asc' } })

describe('job registration', () => {
  it('exports contracts.expire hourly and the scheduler registry includes it', () => {
    expect(jobs.map(job => [job.name, job.everySeconds])).toEqual([['contracts.expire', 3600]])
    expect(registered.some(job => job.name === 'contracts.expire')).toBe(true)
  })

  it('runs through the scheduler and records the run', async () => {
    const { contract: old } = await contract({ endDate: '2020-01-01' })

    await runJobNow(t.ctx, jobs[0]!)

    expect((await reload(old.id)).status).toBe('EXPIRED')
    expect((await t.prisma.jobLease.findUniqueOrThrow({ where: { name: 'contracts.expire' } })).lastError).toBeNull()
  })
})

describe('contracts.expire', () => {
  it('expires an ACTIVE contract whose end date has passed, auditing as the system', async () => {
    const { contract: old } = await contract({ endDate: '2026-03-08' })

    await expireContracts(t.ctx, NOW)

    expect((await reload(old.id)).status).toBe('EXPIRED')

    const [row] = await audits(old.id)

    expect(row).toMatchObject({ action: 'expired', type: 'contract.expired', entity: 'contract', actorId: null, orgId: old.orgId })
    expect(row?.diff).toEqual({ from: 'ACTIVE', to: 'EXPIRED', endDate: '2026-03-08' })
  })

  it('an end date of today is still valid; "today" is the organization\'s calendar day, not UTC', async () => {
    const { contract: onLocalToday } = await contract({ endDate: '2026-03-09' })
    const { contract: onUtcToday } = await contract({ endDate: '2026-03-10' })
    const { contract: yesterday } = await contract({ endDate: '2026-03-08' })

    await expireContracts(t.ctx, NOW)

    expect((await reload(onLocalToday.id)).status).toBe('ACTIVE')
    expect((await reload(onUtcToday.id)).status).toBe('ACTIVE')
    expect((await reload(yesterday.id)).status).toBe('EXPIRED')

    // one minute past local midnight it is the 10th in Chicago: the 9th has ended
    await expireContracts(t.ctx, new Date('2026-03-10T05:01:00Z'))

    expect((await reload(onLocalToday.id)).status).toBe('EXPIRED')
    expect((await reload(onUtcToday.id)).status).toBe('ACTIVE')
  })

  it('auto-renew adds one year to the end date instead of expiring, auditing auto_renewed', async () => {
    const { contract: renewing } = await contract({ endDate: '2026-03-08' })

    await t.prisma.contract.update({ where: { id: renewing.id }, data: { autoRenew: true } })
    await expireContracts(t.ctx, NOW)

    const after = await reload(renewing.id)

    expect(after.status).toBe('ACTIVE')
    expect(after.endDate?.toISOString().slice(0, 10)).toBe('2027-03-08')

    const [row] = await audits(renewing.id)

    expect(row).toMatchObject({ action: 'auto_renewed', actorId: null })
    expect(row?.diff).toEqual({ endDate: { from: '2026-03-08', to: '2027-03-08' } })
  })

  it('is idempotent: a second run (or two at once) changes and audits nothing more', async () => {
    const { contract: expiring } = await contract({ endDate: '2026-03-01' })
    const { contract: renewing } = await contract({ endDate: '2026-03-01' })

    await t.prisma.contract.update({ where: { id: renewing.id }, data: { autoRenew: true } })
    await Promise.all([expireContracts(t.ctx, NOW), expireContracts(t.ctx, NOW)])
    await expireContracts(t.ctx, NOW)

    expect(await audits(expiring.id)).toHaveLength(1)
    expect(await audits(renewing.id)).toHaveLength(1)
    expect((await reload(renewing.id)).endDate?.toISOString().slice(0, 10)).toBe('2027-03-01')
  })

  it('only touches ACTIVE contracts that have an end date', async () => {
    const untouched = await Promise.all(
      (['DRAFT', 'PENDING_SIGNATURE', 'SUSPENDED', 'EXPIRED', 'CANCELLED'] as const).map(status => contract({ status, endDate: '2020-01-01' }))
    )
    const open = await contract({ endDate: null })

    await expireContracts(t.ctx, NOW)

    for (const { contract: row } of untouched) expect((await reload(row.id)).status).toBe(row.status)

    expect((await reload(open.contract.id)).status).toBe('ACTIVE')
    expect(await t.prisma.auditEvent.count()).toBe(0)
  })

  it('handles each organization in its own timezone', async () => {
    const tokyo = await ensureOrg(t, 'Tokyo Org', 'Asia/Tokyo')
    const chicago = await ensureOrg(t)
    const inTokyo = await contract({ orgId: tokyo.id, endDate: '2026-03-10' })
    const inChicago = await contract({ orgId: chicago.id, endDate: '2026-03-10' })

    // 11:00 on the 10th in Tokyo, 21:00 on the 9th in Chicago... move to 16:00Z on the 10th: Tokyo is already the 11th
    await expireContracts(t.ctx, new Date('2026-03-10T16:00:00Z'))

    expect((await reload(inTokyo.contract.id)).status).toBe('EXPIRED')
    expect((await reload(inChicago.contract.id)).status).toBe('ACTIVE')
  })

  it('one failing contract is logged and does not stop the others', async () => {
    const first = await contract({ endDate: '2026-01-01' })
    const second = await contract({ endDate: '2026-01-02' })
    const failing = vi.spyOn(t.prisma, '$transaction').mockImplementationOnce((() => Promise.reject(new Error('boom'))) as never)
    const logged = vi.spyOn(t.ctx.log, 'error')

    await expireContracts(t.ctx, NOW)

    failing.mockRestore()

    const statuses = [(await reload(first.contract.id)).status, (await reload(second.contract.id)).status].sort()

    expect(statuses).toEqual(['ACTIVE', 'EXPIRED'])
    expect(logged).toHaveBeenCalledTimes(1)

    // the failed one is picked up by the next run
    await expireContracts(t.ctx, NOW)

    expect((await reload(first.contract.id)).status).toBe('EXPIRED')
    expect((await reload(second.contract.id)).status).toBe('EXPIRED')
  })

  it('works through more contracts than one batch', async () => {
    const { contract: template } = await contract({ endDate: '2020-01-01' })

    await t.prisma.contract.createMany({
      data: Array.from({ length: 405 }, (_, index) => ({
        orgId: template.orgId,
        clientId: template.clientId,
        contractNumber: `C-BULK-${index}`,
        version: 1,
        status: 'ACTIVE' as const,
        startDate: template.startDate,
        endDate: template.endDate,
        billingType: 'PER_VISIT' as const,
        billingCycle: 'MONTHLY' as const,
        createdById: 'test'
      }))
    })

    await expireContracts(t.ctx, NOW)

    expect(await t.prisma.contract.count({ where: { status: 'ACTIVE' } })).toBe(0)
    expect(await t.prisma.contract.count({ where: { status: 'EXPIRED' } })).toBe(406)
  })
})

describe('renewedEndDate', () => {
  it('adds whole years and clamps month ends', () => {
    expect(renewedEndDate('2026-03-08', '2026-03-09')).toBe('2027-03-08')
    expect(renewedEndDate('2026-01-31', '2026-02-01')).toBe('2027-01-31')
    expect(renewedEndDate('2028-02-29', '2028-03-01')).toBe('2029-02-28')
    expect(renewedEndDate('2028-02-29', '2031-03-01')).toBe('2032-02-29')
  })

  it('catches up in one run when the job was down for years, landing on or after today', () => {
    expect(renewedEndDate('2020-06-30', '2026-03-09')).toBe('2026-06-30')
    expect(renewedEndDate('2020-03-09', '2026-03-09')).toBe('2026-03-09')
  })
})
