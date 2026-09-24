import { describe, expect, it } from 'vitest'

import type { LeadSiteSurvey } from '../src/generated/prisma/client.js'
import { normalizePhone } from '../src/modules/leads/leads.dedupe.js'
import { planConversion, siteNameFromAddress, surveyServiceIds } from '../src/modules/leads/leads.convert.plan.js'
import { assertConvertible, assertStatusTransition, LEAD_TRANSITIONS } from '../src/modules/leads/leads.status.js'

const survey = (address: string, units: unknown, accessNotes: string | null = null): LeadSiteSurvey => ({
  id: 's',
  leadId: 'l',
  address,
  units: units as LeadSiteSurvey['units'],
  accessNotes,
  photoFileIds: [],
  createdAt: new Date()
})

describe('normalizePhone', () => {
  it.each([
    ['(555) 010-2030', '5550102030'],
    ['+1 555 010 2030', '15550102030'],
    ['555.010.2030 ext 4', '55501020304'],
    ['1234567', '1234567']
  ])('%s -> %s', (input, expected) => expect(normalizePhone(input)).toBe(expected))

  it.each(['123456', '12-34-56', 'call me', '', null, undefined])('%j has too few digits', input => expect(normalizePhone(input)).toBeNull())
})

describe('siteNameFromAddress', () => {
  it('uses the first segment of the address', () => {
    expect(siteNameFromAddress('12 Main St, Springfield, IL')).toBe('12 Main St')
    expect(siteNameFromAddress('Line one\nLine two')).toBe('Line one')
  })

  it('falls back to the whole address and to a generic name, and is capped', () => {
    expect(siteNameFromAddress(', Springfield')).toBe(', Springfield')
    expect(siteNameFromAddress('   ')).toBe('Site')
    expect(siteNameFromAddress('x'.repeat(300))).toHaveLength(120)
  })
})

describe('lead status table', () => {
  it('lists every status and never allows a self transition', () => {
    for (const [from, targets] of Object.entries(LEAD_TRANSITIONS)) {
      expect(targets).not.toContain(from)
    }
  })

  it('assertStatusTransition throws INVALID_STATE carrying the allowed list', () => {
    expect(() => assertStatusTransition('NEW', 'NEW')).toThrowError(/cannot become/)
    expect(() => assertStatusTransition('PROPOSAL', 'WON')).toThrowError()
    expect(() => assertStatusTransition('LOST', 'NEW')).not.toThrow()
  })

  it('assertConvertible accepts only QUALIFIED and PROPOSAL', () => {
    expect(() => assertConvertible('QUALIFIED')).not.toThrow()
    expect(() => assertConvertible('PROPOSAL')).not.toThrow()

    for (const status of ['NEW', 'CONTACTED', 'WON', 'LOST'] as const) {
      expect(() => assertConvertible(status)).toThrowError()
    }
  })
})

describe('planConversion', () => {
  it('maps surveys to sites and units to lines', () => {
    const plan = planConversion(
      { address: null, serviceInterest: null },
      [survey('1 A St, X', [{ name: 'U1', qty: '2', estMinutes: 30, serviceId: 'svc' }, { name: 'U2', qty: '1.25' }], 'gate'), survey('2 B St', [{ name: 'U3', qty: '3' }])],
      new Set(['svc'])
    )

    expect(plan.sites).toEqual([
      { name: '1 A St', address: '1 A St, X', accessNotes: 'gate' },
      { name: '2 B St', address: '2 B St', accessNotes: null }
    ])
    expect(plan.lines.map(line => [line.siteIndex, line.description, line.qty.toFixed(2), line.estMinutes, line.serviceId])).toEqual([
      [0, 'U1', '2.00', 30, 'svc'],
      [0, 'U2', '1.25', null, null],
      [1, 'U3', '3.00', null, null]
    ])
  })

  it('ignores unknown services and survives malformed stored units', () => {
    const plan = planConversion({ address: null, serviceInterest: null }, [survey('A', [{ name: 'U', qty: '1', serviceId: 'gone' }]), survey('B', 'garbage')], new Set())

    expect(plan.sites).toHaveLength(2)
    expect(plan.lines).toHaveLength(1)
    expect(plan.lines[0]?.serviceId).toBeNull()
  })

  it('falls back to the lead address, and refuses when there is none', () => {
    expect(planConversion({ address: '5 Z Rd', serviceInterest: 'Filters' }, [], new Set()).lines[0]?.description).toBe('Filters')
    expect(() => planConversion({ address: null, serviceInterest: null }, [], new Set())).toThrowError(/survey or an address/)
  })

  it('collects the distinct service ids to verify', () => {
    expect(surveyServiceIds([survey('A', [{ name: 'a', qty: '1', serviceId: 's1' }, { name: 'b', qty: '1', serviceId: 's1' }, { name: 'c', qty: '1' }]), survey('B', [{ name: 'd', qty: '1', serviceId: 's2' }])])).toEqual(['s1', 's2'])
  })
})
