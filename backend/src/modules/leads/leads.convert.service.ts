import type { AppContext, ClientMeta } from '../../context.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import { D } from '../../lib/money.js'
import { recordAudit } from '../audit/record.js'
import { createContractDraftRecord } from '../contracts/draft-record.js'
import { loadVisibleLead } from './leads.access.js'
import { planConversion, surveyServiceIds } from './leads.convert.plan.js'
import { alreadyConverted } from './leads.errors.js'
import type { ConvertBody } from './leads.schemas.js'
import { assertConvertible, CONVERTIBLE_STATUSES } from './leads.status.js'

const CONVERT_TX_TIMEOUT_MS = 20_000

/**
 * Converts a QUALIFIED/PROPOSAL lead into client + sites + DRAFT contract, in one transaction.
 *
 * Race safety: the first statement is a conditional update that claims the lead (status -> WON only while it is still
 * QUALIFIED/PROPOSAL and unconverted). Postgres makes a second simultaneous convert wait on that row, and once the
 * first commits its update matches nothing, so exactly one request creates records and the other gets
 * 409 LEAD_ALREADY_CONVERTED with the ids.
 */
export const convertLead = async (ctx: AppContext, actor: Actor, id: string, body: ConvertBody, meta: ClientMeta) => {
  const before = await loadVisibleLead(ctx.prisma, actor, id)

  if (before.status === 'WON' || before.convertedContractId) throw alreadyConverted(before)

  assertConvertible(before.status)

  return ctx.prisma.$transaction(
    async tx => {
      const claimed = await tx.lead.updateMany({
        where: { id, orgId: actor.orgId, status: { in: CONVERTIBLE_STATUSES }, convertedContractId: null },
        data: { status: 'WON', lostReason: null }
      })

      if (claimed.count === 0) {
        const current = await loadVisibleLead(tx, actor, id)

        if (current.status === 'WON' || current.convertedContractId) throw alreadyConverted(current)

        assertConvertible(current.status)
        throw Errors.conflict('The lead was changed by someone else. Reload it and try again.', { leadId: id })
      }

      const lead = await loadVisibleLead(tx, actor, id)
      const surveys = await tx.leadSiteSurvey.findMany({ where: { leadId: id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
      const knownServices = await tx.service.findMany({ where: { id: { in: surveyServiceIds(surveys) }, orgId: actor.orgId }, select: { id: true } })
      const plan = planConversion(lead, surveys, new Set(knownServices.map(service => service.id)))

      const client = await tx.client.create({
        data: {
          orgId: actor.orgId,
          legalName: body.clientLegalName ?? lead.companyName,
          billingEmail: body.billingEmail ?? lead.email,
          billingAddress: lead.address,
          paymentTerms: body.paymentTerms
        }
      })

      const siteIds: string[] = []

      for (const site of plan.sites) {
        const created = await tx.site.create({
          data: { orgId: actor.orgId, clientId: client.id, name: site.name, address: site.address, accessNotes: site.accessNotes, contactName: lead.contactName, contactPhone: lead.phone }
        })

        siteIds.push(created.id)
      }

      const contract = await createContractDraftRecord(ctx, tx, actor, {
        clientId: client.id,
        leadId: lead.id,
        startDate: body.startDate,
        endDate: body.endDate ?? null,
        billingType: body.billingType,
        billingCycle: body.billingCycle,
        // Rates stay at 0 on purpose: an admin prices the draft before submitting it
        lines: plan.lines.map(line => ({
          siteId: siteIds[line.siteIndex] as string,
          serviceId: line.serviceId,
          description: line.description,
          qty: line.qty,
          billRate: D(0),
          payRate: null,
          estMinutes: line.estMinutes
        }))
      })

      const converted = await tx.lead.update({
        where: { id },
        data: { convertedClientId: client.id, convertedContractId: contract.id }
      })

      await tx.leadActivity.create({ data: { leadId: id, userId: actor.id, type: 'NOTE', body: `Converted to contract ${contract.contractNumber}.` } })

      await recordAudit(tx, actor, {
        entity: 'lead',
        entityId: id,
        action: 'converted',
        diff: { from: before.status, clientId: client.id, siteIds, contractId: contract.id, contractNumber: contract.contractNumber },
        meta
      })

      return { lead: converted, clientId: client.id, siteIds, contractId: contract.id }
    },
    { timeout: CONVERT_TX_TIMEOUT_MS }
  )
}
