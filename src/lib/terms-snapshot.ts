import { z } from 'zod'

import type { Contract, ContractCoverage, ContractLine } from '../generated/prisma/client.js'
import { D, moneyRequired } from './money.js'
import type { Decimal } from './money.js'

/**
 * "Schedule is an image of contract", literally (docs/ARCHITECTURE.md section 1).
 *
 * When a schedule is generated, the contract's terms are copied into `schedule.termsSnapshot` in this shape.
 * Shifts, timesheets and invoices price from the snapshot and NEVER from the live contract, so renegotiating a
 * rate can't change history. Money inside the snapshot is a string ("145.00") so it survives JSON exactly.
 *
 * The snapshot contains bill and pay rates: serialise it to the API only through `redactSnapshot`.
 */

export const snapshotItemSchema = z.object({
  lineId: z.string(),
  siteId: z.string(),
  serviceId: z.string().nullable(),
  description: z.string(),
  qty: z.string(),
  billRate: z.string(),
  payRate: z.string().nullable(),
  estMinutes: z.number().int().nullable(),
  taxCode: z.string().nullable()
})

export const snapshotCoverageSchema = z.object({
  siteId: z.string(),
  patternType: z.enum(['WEEKLY', 'INTERVAL', 'AD_HOC']),
  weekdays: z.array(z.number().int()),
  timeStart: z.string().nullable(),
  timeEnd: z.string().nullable(),
  intervalDays: z.number().int().nullable(),
  visitsPerPeriod: z.number().int().nullable()
})

export const termsSnapshotSchema = z.object({
  contractId: z.string(),
  contractNumber: z.string(),
  contractVersion: z.number().int(),
  billingType: z.enum(['PER_VISIT', 'HOURLY', 'MONTHLY_FIXED']),
  billingCycle: z.enum(['PER_VISIT', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']),
  /** IANA zone the coverage times were interpreted in when shifts were generated. */
  siteTimezone: z.string(),
  /** Only the items and coverage for this schedule's site. */
  serviceItems: z.array(snapshotItemSchema),
  coverage: z.array(snapshotCoverageSchema),
  generatedAt: z.string()
})

export type TermsSnapshot = z.infer<typeof termsSnapshotSchema>
export type SnapshotItem = z.infer<typeof snapshotItemSchema>

/** Copies the contract's terms for one site into a frozen snapshot. */
export const buildTermsSnapshot = (
  contract: Pick<Contract, 'id' | 'contractNumber' | 'version' | 'billingType' | 'billingCycle'>,
  lines: ContractLine[],
  coverage: ContractCoverage[],
  siteId: string,
  siteTimezone: string,
  now: Date = new Date()
): TermsSnapshot => ({
  contractId: contract.id,
  contractNumber: contract.contractNumber,
  contractVersion: contract.version,
  billingType: contract.billingType,
  billingCycle: contract.billingCycle,
  siteTimezone,
  serviceItems: lines
    .filter(line => line.siteId === siteId)
    .map(line => ({
      lineId: line.id,
      siteId: line.siteId,
      serviceId: line.serviceId,
      description: line.description,
      qty: D(line.qty).toFixed(2),
      billRate: moneyRequired(line.billRate),
      payRate: line.payRate ? moneyRequired(line.payRate) : null,
      estMinutes: line.estMinutes,
      taxCode: line.taxCode
    })),
  coverage: coverage
    .filter(row => row.siteId === siteId)
    .map(row => ({
      siteId: row.siteId,
      patternType: row.patternType,
      weekdays: row.weekdays,
      timeStart: row.timeStart,
      timeEnd: row.timeEnd,
      intervalDays: row.intervalDays,
      visitsPerPeriod: row.visitsPerPeriod
    })),
  generatedAt: now.toISOString()
})

/** Reads a stored snapshot (Prisma Json) back into a typed object, failing loudly if it is corrupt. */
export const parseTermsSnapshot = (value: unknown): TermsSnapshot => termsSnapshotSchema.parse(value)

/** The one line that prices a shift at this site: hourly contracts have exactly one per site (enforced on submit). */
export const primaryItem = (snapshot: TermsSnapshot): SnapshotItem | undefined => snapshot.serviceItems[0]

export const itemBillRate = (item: SnapshotItem): Decimal => D(item.billRate)

export const itemPayRate = (item: SnapshotItem): Decimal | null => (item.payRate === null ? null : D(item.payRate))

/**
 * The version of a snapshot that is safe to send to a given viewer: bill rates for admins only,
 * pay rates for admins and supervisors, neither for anybody else.
 */
export const redactSnapshot = (snapshot: TermsSnapshot, viewer: { canSeeBillRate: boolean; canSeePayRate: boolean }) => ({
  ...snapshot,
  serviceItems: snapshot.serviceItems.map(({ billRate, payRate, ...item }) => ({
    ...item,
    ...(viewer.canSeeBillRate ? { billRate } : {}),
    ...(viewer.canSeePayRate ? { payRate } : {})
  }))
})
