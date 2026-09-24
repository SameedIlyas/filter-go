import { randomBytes } from 'node:crypto'

import type { ContractCoverage, ContractLine } from '../../generated/prisma/client.js'
import { Errors } from '../../lib/errors.js'
import type { FieldIssue } from '../../lib/errors.js'
import type { Db } from '../../lib/prisma.js'
import type { DraftCoverageInput, DraftLineInput } from './draft-record.js'

/**
 * Lines and coverage rows have no position column, so their order is the order of their ids. These ids are
 * UUIDv7-shaped (48-bit time, then a 12-bit counter) so a batch inserted in request order sorts back into it.
 * That keeps `lines[2]` in a validation error pointing at the third line the client sent.
 */
export const orderedIds = (count: number): string[] => {
  const time = Date.now().toString(16).padStart(12, '0')

  return Array.from({ length: count }, (_, index) => {
    const noise = randomBytes(9).toString('hex')
    const variant = (8 + (Number.parseInt(noise.slice(0, 2), 16) % 4)).toString(16)

    return `${time.slice(0, 8)}-${time.slice(8)}-7${index.toString(16).padStart(3, '0')}-${variant}${noise.slice(2, 5)}-${noise.slice(5, 17)}`
  })
}

export const byId = <T extends { id: string }>(rows: T[]): T[] => [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

export const insertLines = async (db: Db, contractId: string, lines: DraftLineInput[]): Promise<void> => {
  const ids = orderedIds(lines.length)

  await db.contractLine.createMany({
    data: lines.map((line, index) => ({
      id: ids[index],
      contractId,
      siteId: line.siteId,
      serviceId: line.serviceId ?? null,
      description: line.description,
      qty: line.qty,
      billRate: line.billRate,
      payRate: line.payRate ?? null,
      estMinutes: line.estMinutes ?? null,
      taxCode: line.taxCode ?? null
    }))
  })
}

export const insertCoverage = async (db: Db, contractId: string, rows: DraftCoverageInput[]): Promise<void> => {
  const ids = orderedIds(rows.length)

  await db.contractCoverage.createMany({
    data: rows.map((row, index) => ({
      id: ids[index],
      contractId,
      siteId: row.siteId,
      patternType: row.patternType,
      weekdays: row.weekdays ?? [],
      timeStart: row.timeStart ?? null,
      timeEnd: row.timeEnd ?? null,
      intervalDays: row.intervalDays ?? null,
      visitsPerPeriod: row.visitsPerPeriod ?? null
    }))
  })
}

export const lineToInput = (line: ContractLine): DraftLineInput => ({
  siteId: line.siteId,
  serviceId: line.serviceId,
  description: line.description,
  qty: line.qty,
  billRate: line.billRate,
  payRate: line.payRate,
  estMinutes: line.estMinutes,
  taxCode: line.taxCode
})

export const coverageToInput = (row: ContractCoverage): DraftCoverageInput => ({
  siteId: row.siteId,
  patternType: row.patternType,
  weekdays: row.weekdays,
  timeStart: row.timeStart,
  timeEnd: row.timeEnd,
  intervalDays: row.intervalDays,
  visitsPerPeriod: row.visitsPerPeriod
})

const SITE_MESSAGE = "This site does not belong to the contract's client."

/** Every site must belong to the contract's client (and organization), every service to the organization. */
export const assertRowRefs = async (
  db: Db,
  orgId: string,
  clientId: string,
  lines: Array<{ siteId: string; serviceId?: string | null }>,
  coverage: Array<{ siteId: string }>
): Promise<void> => {
  const siteIds = [...new Set([...lines.map(line => line.siteId), ...coverage.map(row => row.siteId)])]
  const serviceIds = [...new Set(lines.flatMap(line => (line.serviceId ? [line.serviceId] : [])))]
  const [sites, services] = await Promise.all([
    db.site.findMany({ where: { id: { in: siteIds }, orgId, clientId }, select: { id: true } }),
    db.service.findMany({ where: { id: { in: serviceIds }, orgId }, select: { id: true } })
  ])
  const validSites = new Set(sites.map(site => site.id))
  const validServices = new Set(services.map(service => service.id))
  const issues: FieldIssue[] = [
    ...lines.flatMap((line, index): FieldIssue[] =>
      validSites.has(line.siteId) ? [] : [{ field: `lines[${index}].siteId`, code: 'site_not_found', message: SITE_MESSAGE }]
    ),
    ...lines.flatMap((line, index): FieldIssue[] =>
      !line.serviceId || validServices.has(line.serviceId)
        ? []
        : [{ field: `lines[${index}].serviceId`, code: 'service_not_found', message: 'That service does not exist.' }]
    ),
    ...coverage.flatMap((row, index): FieldIssue[] =>
      validSites.has(row.siteId) ? [] : [{ field: `coverage[${index}].siteId`, code: 'site_not_found', message: SITE_MESSAGE }]
    )
  ]

  if (issues.length > 0) throw Errors.validation(issues)
}
