import { ensureOrg } from './helpers.js'
import type { TestApp } from './helpers.js'

export const NIL_UUID = '00000000-0000-4000-8000-000000000000'

export const validPublicLead = (orgKey: string, overrides: Record<string, unknown> = {}) => ({
  orgKey,
  companyName: 'Northwind Foods',
  contactName: 'Ana Reyes',
  email: 'ana@northwind.test',
  phone: '(555) 010-2030',
  message: 'We need weekly filter changes.',
  ...overrides
})

export const intakeKeyOf = async (t: TestApp, name?: string): Promise<string> => (await ensureOrg(t, name)).leadIntakeKey

export type LeadStatusName = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL' | 'WON' | 'LOST'

interface LeadOverrides {
  companyName: string
  contactName: string
  email: string
  phone: string | null
  phoneNorm: string | null
  address: string | null
  serviceInterest: string | null
  source: 'WEBSITE' | 'PHONE' | 'REFERRAL' | 'FIELD' | 'MANUAL'
  status: LeadStatusName
  ownerId: string | null
  lostReason: string | null
  createdAt: Date
}

let leadCounter = 0

/** Writes a lead straight to the database (no API), so pipeline tests start from any state they need. */
export const makeLead = (t: TestApp, orgId: string, overrides: Partial<LeadOverrides> = {}) => {
  leadCounter += 1

  return t.prisma.lead.create({
    data: {
      orgId,
      companyName: `Company ${leadCounter}`,
      contactName: `Contact ${leadCounter}`,
      email: `lead${leadCounter}@prospect.test`,
      source: 'PHONE',
      ...overrides
    }
  })
}
