import type { AppContext } from '../../context.js'
import type { InvoiceLine, Shift, TimesheetEntry } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'
import { Errors } from '../../lib/errors.js'
import { money, moneyRequired, qty4 } from '../../lib/money.js'
import { fromDateOnly } from '../../lib/time.js'
import { compareLines } from './serializers.js'

/**
 * The answer to a disputed charge in one call: for every invoice line, the chain
 *   line -> timesheet (clock stamps + GPS) -> shift -> schedule -> contract (number, version) -> lead
 * plus the photo file ids logged on the shift. Batched: a fixed number of queries whatever the invoice size (no N+1).
 */

const unique = <T>(values: Array<T | null | undefined>): T[] => [...new Set(values.filter((value): value is T => value !== null && value !== undefined))]

const sourceIds = (lines: InvoiceLine[], type: InvoiceLine['sourceType']): string[] =>
  unique(lines.filter(line => line.sourceType === type).map(line => line.sourceId))

const point = (at: Date | null, lat: number | null, lng: number | null) => (at === null && lat === null && lng === null ? null : { at, lat, lng })

const timesheetView = (entry: TimesheetEntry, workerName: string | undefined) => ({
  id: entry.id,
  status: entry.status,
  worker: { id: entry.userId, name: workerName ?? null },
  clockIn: point(entry.clockInAt, entry.clockInLat, entry.clockInLng),
  clockOut: point(entry.clockOutAt, entry.clockOutLat, entry.clockOutLng),
  breakMinutes: entry.breakMinutes,
  scheduledMinutes: entry.scheduledMinutes,
  actualMinutes: entry.actualMinutes,
  billable: entry.billable,
  autoClosed: entry.autoClosed,
  billRateSnapshot: money(entry.billRateSnapshot),
  approvedById: entry.approvedById,
  approvedAt: entry.approvedAt
})

const shiftView = (shift: Shift & { site: { name: string } }) => ({
  id: shift.id,
  siteId: shift.siteId,
  siteName: shift.site.name,
  scheduledStart: shift.scheduledStart,
  scheduledEnd: shift.scheduledEnd,
  status: shift.status,
  isExtra: shift.isExtra,
  notes: shift.notes
})

/** Everything the chain needs, fetched level by level with `in` queries. */
const loadChain = async (ctx: AppContext, orgId: string, invoiceContractId: string, lines: InvoiceLine[]) => {
  const shiftSources = sourceIds(lines, 'SHIFT')
  const entries = await ctx.prisma.timesheetEntry.findMany({
    where: { orgId, OR: [{ id: { in: sourceIds(lines, 'TIMESHEET') } }, { shiftId: { in: shiftSources } }] }
  })
  const shiftIds = unique([...entries.map(entry => entry.shiftId), ...shiftSources])
  const [shifts, workers, photos, contractLines] = await Promise.all([
    ctx.prisma.shift.findMany({ where: { id: { in: shiftIds }, orgId }, include: { site: { select: { name: true } } } }),
    ctx.prisma.user.findMany({ where: { id: { in: unique(entries.map(entry => entry.userId)) }, orgId }, select: { id: true, name: true } }),
    ctx.prisma.workLog.findMany({
      where: { orgId, shiftId: { in: shiftIds }, kind: 'PHOTO', fileId: { not: null } },
      select: { id: true, shiftId: true, fileId: true, at: true },
      orderBy: [{ at: 'asc' }, { id: 'asc' }]
    }),
    ctx.prisma.contractLine.findMany({ where: { id: { in: sourceIds(lines, 'CONTRACT_LINE') }, contract: { orgId } }, select: { id: true, contractId: true } })
  ])
  const schedules = await ctx.prisma.schedule.findMany({
    where: { id: { in: unique(shifts.map(shift => shift.scheduleId)) }, orgId },
    select: { id: true, periodStart: true, periodEnd: true, status: true, contractVersion: true, contractId: true }
  })
  const contractIds = unique([invoiceContractId, ...schedules.map(schedule => schedule.contractId), ...contractLines.map(line => line.contractId)])
  const contracts = await ctx.prisma.contract.findMany({
    where: { id: { in: contractIds }, orgId },
    select: { id: true, contractNumber: true, version: true, leadId: true }
  })
  const leads = await ctx.prisma.lead.findMany({
    where: { id: { in: unique(contracts.map(contract => contract.leadId)) }, orgId },
    select: { id: true, companyName: true, contactName: true, source: true, status: true }
  })

  return { entries, shifts, workers, photos, contractLines, schedules, contracts, leads }
}

export const getInvoiceTrace = async (ctx: AppContext, actor: Actor, id: string) => {
  const invoice = await ctx.prisma.invoice.findFirst({ where: { id, orgId: actor.orgId }, include: { lines: true } })

  if (!invoice) throw Errors.notFound('invoice')

  const chain = await loadChain(ctx, actor.orgId, invoice.contractId, invoice.lines)
  const entryById = new Map(chain.entries.map(entry => [entry.id, entry]))
  const entryByShift = new Map(chain.entries.map(entry => [entry.shiftId, entry]))
  const shiftById = new Map(chain.shifts.map(shift => [shift.id, shift]))
  const scheduleById = new Map(chain.schedules.map(schedule => [schedule.id, schedule]))
  const contractById = new Map(chain.contracts.map(contract => [contract.id, contract]))
  const leadById = new Map(chain.leads.map(lead => [lead.id, lead]))
  const workerName = new Map(chain.workers.map(worker => [worker.id, worker.name]))
  const contractOfLine = new Map(chain.contractLines.map(line => [line.id, line.contractId]))

  const traceLine = (line: InvoiceLine) => {
    const entry = line.sourceType === 'TIMESHEET' ? entryById.get(line.sourceId ?? '') : line.sourceType === 'SHIFT' ? entryByShift.get(line.sourceId ?? '') : undefined
    const shift = shiftById.get(entry?.shiftId ?? (line.sourceType === 'SHIFT' ? (line.sourceId ?? '') : ''))
    const schedule = shift ? scheduleById.get(shift.scheduleId) : undefined
    const contract = contractById.get(schedule?.contractId ?? contractOfLine.get(line.sourceId ?? '') ?? invoice.contractId)
    const lead = contract?.leadId ? leadById.get(contract.leadId) : undefined

    return {
      lineId: line.id,
      sourceType: line.sourceType,
      sourceId: line.sourceId,
      description: line.description,
      qty: qty4(line.qty),
      unitRate: moneyRequired(line.unitRate),
      amount: moneyRequired(line.amount),
      taxAmount: moneyRequired(line.taxAmount),
      timesheet: entry ? timesheetView(entry, workerName.get(entry.userId)) : null,
      shift: shift ? shiftView(shift) : null,
      schedule: schedule
        ? { id: schedule.id, periodStart: fromDateOnly(schedule.periodStart), periodEnd: fromDateOnly(schedule.periodEnd), status: schedule.status, contractVersion: schedule.contractVersion }
        : null,
      contract: contract ? { id: contract.id, number: contract.contractNumber, version: contract.version } : null,
      lead: lead ? { id: lead.id, companyName: lead.companyName, contactName: lead.contactName, source: lead.source, status: lead.status } : null,
      workLogPhotos: chain.photos.filter(photo => photo.shiftId === shift?.id).map(photo => ({ workLogId: photo.id, fileId: photo.fileId, at: photo.at }))
    }
  }

  return {
    invoice: { id: invoice.id, invoiceNumber: invoice.invoiceNumber, status: invoice.status, contractId: invoice.contractId },
    lines: [...invoice.lines].sort(compareLines).map(traceLine)
  }
}
