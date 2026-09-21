import type { AppContext } from '../../context.js'
import type { BillingCycle, BillingType, Contract, ContractLine, CoveragePattern } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import type { Decimal } from '../../lib/money.js'
import type { Db } from '../../lib/prisma.js'
import { toDateOnly } from '../../lib/time.js'
import { formatNumber, nextSequence } from '../audit/sequence.js'

export interface DraftLineInput {
  siteId: string
  serviceId?: string | null
  description: string
  qty: Decimal
  billRate: Decimal
  payRate?: Decimal | null
  estMinutes?: number | null
  taxCode?: string | null
}

export interface DraftCoverageInput {
  siteId: string
  patternType: CoveragePattern
  weekdays?: number[]
  timeStart?: string | null
  timeEnd?: string | null
  intervalDays?: number | null
  visitsPerPeriod?: number | null
}

export interface DraftContractInput {
  clientId: string
  leadId?: string | null
  /** "YYYY-MM-DD" */
  startDate: string
  endDate?: string | null
  autoRenew?: boolean
  billingType: BillingType
  billingCycle: BillingCycle
  lines: DraftLineInput[]
  coverage?: DraftCoverageInput[]
}

/**
 * Structural insert of a DRAFT contract version 1 (with lines and coverage) inside the caller's transaction.
 * It enforces tenancy (client and every site belong to the actor's organization and the client) and allocates the
 * contract number. It deliberately does NOT enforce business completeness (rates set, coverage present, ...): that is
 * the contract SUBMIT step's job, so lead conversion can create a rough draft from a site survey.
 * Shared by the Contracts module and by lead conversion.
 */
export const createContractDraftRecord = async (
  _ctx: AppContext,
  db: Db,
  actor: Pick<Actor, 'id' | 'orgId'>,
  input: DraftContractInput
): Promise<Contract & { lines: ContractLine[] }> => {
  const client = await db.client.findFirst({ where: { id: input.clientId, orgId: actor.orgId }, select: { id: true } })

  if (!client) throw Errors.notFound('client')

  const siteIds = [...new Set([...input.lines.map(line => line.siteId), ...(input.coverage ?? []).map(row => row.siteId)])]
  const sites = await db.site.count({ where: { id: { in: siteIds }, orgId: actor.orgId, clientId: input.clientId } })

  if (sites !== siteIds.length) throw Errors.invalidField('siteId', 'site_not_found', 'Every site must belong to this client.')

  const number = formatNumber('C', null, await nextSequence(db, actor.orgId, 'contract'))

  return db.contract.create({
    data: {
      orgId: actor.orgId,
      clientId: input.clientId,
      leadId: input.leadId ?? null,
      contractNumber: number,
      version: 1,
      status: 'DRAFT',
      startDate: toDateOnly(input.startDate),
      endDate: input.endDate ? toDateOnly(input.endDate) : null,
      autoRenew: input.autoRenew ?? false,
      billingType: input.billingType,
      billingCycle: input.billingCycle,
      createdById: actor.id,
      lines: {
        create: input.lines.map(line => ({
          siteId: line.siteId,
          serviceId: line.serviceId ?? null,
          description: line.description,
          qty: line.qty,
          billRate: line.billRate,
          payRate: line.payRate ?? null,
          estMinutes: line.estMinutes ?? null,
          taxCode: line.taxCode ?? null
        }))
      },
      coverage: {
        create: (input.coverage ?? []).map(row => ({
          siteId: row.siteId,
          patternType: row.patternType,
          weekdays: row.weekdays ?? [],
          timeStart: row.timeStart ?? null,
          timeEnd: row.timeEnd ?? null,
          intervalDays: row.intervalDays ?? null,
          visitsPerPeriod: row.visitsPerPeriod ?? null
        }))
      }
    },
    include: { lines: true }
  })
}
