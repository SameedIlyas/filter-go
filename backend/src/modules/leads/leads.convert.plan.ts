import type { Lead, LeadSiteSurvey } from '../../generated/prisma/client.js'
import { Errors } from '../../lib/errors.js'
import type { Decimal } from '../../lib/money.js'
import { D } from '../../lib/money.js'
import { storedUnits } from './leads.schemas.js'

export interface PlannedSite {
  name: string
  address: string
  accessNotes: string | null
}

export interface PlannedLine {
  /** Index into `sites`. */
  siteIndex: number
  serviceId: string | null
  description: string
  qty: Decimal
  estMinutes: number | null
}

export interface ConversionPlan {
  sites: PlannedSite[]
  lines: PlannedLine[]
}

const SITE_NAME_MAX = 120
const PLACEHOLDER_LINE = 'Service (to be defined)'

/** "12 Main St, Springfield" -> "12 Main St". Falls back to the whole address, then to a generic name. */
export const siteNameFromAddress = (address: string): string => {
  const first = address.split(/[,\n]/)[0]?.trim() ?? ''

  return (first || address.trim() || 'Site').slice(0, SITE_NAME_MAX)
}

/**
 * What a conversion will create: one site per survey with one line per surveyed unit, or, when there are no
 * surveys, one site from the lead's address with a single placeholder line. Pure so it can be tested on its own.
 */
export const planConversion = (lead: Pick<Lead, 'address' | 'serviceInterest'>, surveys: LeadSiteSurvey[], knownServiceIds: ReadonlySet<string>): ConversionPlan => {
  if (surveys.length > 0) {
    return {
      sites: surveys.map(survey => ({ name: siteNameFromAddress(survey.address), address: survey.address, accessNotes: survey.accessNotes })),
      lines: surveys.flatMap((survey, siteIndex) =>
        (storedUnits.safeParse(survey.units).data ?? []).map(unit => ({
          siteIndex,
          serviceId: unit.serviceId && knownServiceIds.has(unit.serviceId) ? unit.serviceId : null,
          description: unit.name,
          qty: D(unit.qty),
          estMinutes: unit.estMinutes ?? null
        }))
      )
    }
  }

  if (!lead.address) {
    throw Errors.unprocessable('Add a site survey or an address to the lead before converting it.')
  }

  return {
    sites: [{ name: siteNameFromAddress(lead.address), address: lead.address, accessNotes: null }],
    lines: [{ siteIndex: 0, serviceId: null, description: lead.serviceInterest ?? PLACEHOLDER_LINE, qty: D(1), estMinutes: null }]
  }
}

/** Every service id mentioned by the surveys' units (to be checked against the organization before use). */
export const surveyServiceIds = (surveys: LeadSiteSurvey[]): string[] => [
  ...new Set(surveys.flatMap(survey => (storedUnits.safeParse(survey.units).data ?? []).flatMap(unit => (unit.serviceId ? [unit.serviceId] : []))))
]
