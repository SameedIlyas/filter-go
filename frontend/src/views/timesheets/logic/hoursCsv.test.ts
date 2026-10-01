import { describe, expect, it } from 'vitest'

import type { HoursResponse } from '@/types/timesheetTypes'

import { decimalHours, hoursCsv } from './hoursCsv'

const tally = (scheduledMinutes: number, workedMinutes: number, approvedMinutes: number) => ({ scheduledMinutes, workedMinutes, approvedMinutes })

const data: HoursResponse = {
  from: '2026-03-02',
  to: '2026-03-03',
  days: ['2026-03-02', '2026-03-03'],
  weeklyOvertimeMinutes: 2400,
  workers: [
    {
      user: { id: 'u1', name: 'Smith, Ann' },
      days: { '2026-03-02': tally(480, 465, 465) },
      scheduledMinutes: 480,
      workedMinutes: 465,
      approvedMinutes: 465,
      overtimeMinutes: 0,
      entryCount: 1,
      openExceptionCount: 0
    },
    {
      user: { id: 'u2', name: '=HYPERLINK("x")' },
      days: { '2026-03-03': tally(240, 270, 0) },
      scheduledMinutes: 240,
      workedMinutes: 270,
      approvedMinutes: 0,
      overtimeMinutes: 30,
      entryCount: 1,
      openExceptionCount: 1
    }
  ],
  totals: { days: { '2026-03-02': tally(480, 465, 465), '2026-03-03': tally(240, 270, 0) }, scheduledMinutes: 720, workedMinutes: 735, approvedMinutes: 465, overtimeMinutes: 30 }
}

describe('hoursCsv', () => {
  it('writes one row per worker plus a total, in decimal hours of the chosen metric', () => {
    expect(hoursCsv(data, 'workedMinutes').split('\r\n')).toEqual([
      'Worker,2026-03-02,2026-03-03,Scheduled,Worked,Approved,Overtime',
      '"Smith, Ann",7.75,0.00,8.00,7.75,7.75,0.00',
      `"'=HYPERLINK(""x"")",0.00,4.50,4.00,4.50,0.00,0.50`,
      'Total,7.75,4.50,12.00,12.25,7.75,0.50'
    ])
  })

  it('switches the day columns to the approved metric', () => {
    expect(hoursCsv(data, 'approvedMinutes').split('\r\n')[2]).toContain(',0.00,0.00,4.00,')
  })

  it('rounds to two places', () => {
    expect(decimalHours(1)).toBe('0.02')
    expect(decimalHours(0)).toBe('0.00')
  })
})
