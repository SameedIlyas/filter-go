import type { Contract, ContractCoverage, ContractLine, ContractStatus } from '../../generated/prisma/client.js'
import { canSeeBillRate, canSeePayRate } from '../../lib/access.js'
import type { Actor } from '../../lib/access.js'
import { money, moneyRequired } from '../../lib/money.js'
import { fromDateOnly, fromDateOnlyOrNull } from '../../lib/time.js'

export interface ContractClientRef {
  id: string
  legalName: string
}

export interface ContractVersionRef {
  id: string
  version: number
  status: ContractStatus
}

export interface ContractDetail {
  contract: Contract
  client: ContractClientRef
  lines: ContractLine[]
  coverage: ContractCoverage[]
  versions: ContractVersionRef[]
}

type Viewer = Pick<Actor, 'role'>

export const serializeContractSummary = (contract: Contract, client: ContractClientRef) => ({
  id: contract.id,
  contractNumber: contract.contractNumber,
  version: contract.version,
  status: contract.status,
  client: { id: client.id, legalName: client.legalName },
  startDate: fromDateOnly(contract.startDate),
  endDate: fromDateOnlyOrNull(contract.endDate),
  autoRenew: contract.autoRenew,
  billingType: contract.billingType,
  billingCycle: contract.billingCycle,
  signedAt: contract.signedAt,
  signedBy: contract.signedBy,
  documentFileId: contract.documentFileId,
  supersedesContractId: contract.supersedesContractId,
  leadId: contract.leadId,
  createdAt: contract.createdAt,
  updatedAt: contract.updatedAt
})

/** `billRate` only for ADMIN, `payRate` only for ADMIN and SUPERVISOR: the keys are omitted for everyone else. */
export const serializeLine = (line: ContractLine, viewer: Viewer) => ({
  id: line.id,
  siteId: line.siteId,
  serviceId: line.serviceId,
  description: line.description,
  qty: moneyRequired(line.qty),
  ...(canSeeBillRate(viewer) ? { billRate: moneyRequired(line.billRate) } : {}),
  ...(canSeePayRate(viewer) ? { payRate: money(line.payRate) } : {}),
  estMinutes: line.estMinutes,
  taxCode: line.taxCode
})

export const serializeCoverage = (row: ContractCoverage) => ({
  id: row.id,
  siteId: row.siteId,
  patternType: row.patternType,
  weekdays: row.weekdays,
  timeStart: row.timeStart,
  timeEnd: row.timeEnd,
  intervalDays: row.intervalDays,
  visitsPerPeriod: row.visitsPerPeriod
})

export const serializeContractDetail = (detail: ContractDetail, viewer: Viewer) => ({
  ...serializeContractSummary(detail.contract, detail.client),
  lines: detail.lines.map(line => serializeLine(line, viewer)),
  coverage: detail.coverage.map(serializeCoverage),
  versions: detail.versions.map(version => ({ id: version.id, version: version.version, status: version.status }))
})
