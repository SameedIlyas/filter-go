import { describe, expect, it } from 'vitest'

import { isSettling, safePayUrl } from '@/libs/api/queries/invoices'
import { safeText } from '@/utils/csv'

const channel = (state: 'NONE' | 'PENDING' | 'DONE' | 'DEAD') => ({ state, lastError: null })

describe('isSettling', () => {
  it('polls while an integration is working', () => {
    expect(isSettling({ status: 'APPROVED', sync: { accounting: channel('PENDING'), payment: channel('NONE') } })).toBe(
      true
    )
    expect(isSettling({ status: 'SYNCED', sync: { accounting: channel('DONE'), payment: channel('PENDING') } })).toBe(
      true
    )
  })

  it('stops once a job is dead or everything is done', () => {
    expect(isSettling({ status: 'APPROVED', sync: { accounting: channel('DEAD'), payment: channel('NONE') } })).toBe(
      false
    )
    expect(isSettling({ status: 'SENT', sync: { accounting: channel('DONE'), payment: channel('DONE') } })).toBe(false)
  })

  it('keeps watching an approved invoice for a client user, who gets no sync state', () => {
    expect(isSettling({ status: 'APPROVED' })).toBe(true)
    expect(isSettling({ status: 'SENT' })).toBe(false)
  })
})

describe('safePayUrl', () => {
  it('only lets https links through', () => {
    expect(safePayUrl('https://pay.example.test/i/1')).toBe('https://pay.example.test/i/1')
    expect(safePayUrl('javascript:alert(1)')).toBeNull()
    expect(safePayUrl('http://pay.example.test')).toBeNull()
    expect(safePayUrl(null)).toBeNull()
  })
})

describe('safeText', () => {
  it('defuses formula starters, tab and carriage return included', () => {
    expect(safeText('\t=1+1')).toBe("'\t=1+1")
    expect(safeText('\rx')).toBe("'\rx")
    expect(safeText('Acme')).toBe('Acme')
  })
})
