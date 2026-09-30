import { describe, expect, it } from 'vitest'

import { BOARD_DEFAULTS, boardWindow, parseBoardState, serializeBoardState, shiftAnchor } from './boardWindow'

describe('boardWindow', () => {
  it('day: one day, requested with a day of padding either side for site timezones', () => {
    const window = boardWindow('2026-03-04', 'day')

    expect(window.days).toEqual(['2026-03-04'])
    expect(window.from).toBe('2026-03-03T00:00:00.000Z')
    expect(window.to).toBe('2026-03-06T00:00:00.000Z')
  })

  it('week: Monday to Sunday around the anchor', () => {
    const window = boardWindow('2026-03-04', 'week')

    expect(window.days).toEqual(['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08'])
    expect(window.from).toBe('2026-03-01T00:00:00.000Z')
    expect(window.to).toBe('2026-03-10T00:00:00.000Z')
  })

  it('week anchored on a Sunday still starts on the Monday before', () => {
    expect(boardWindow('2026-03-08', 'week').days[0]).toBe('2026-03-02')
  })

  it('month: whole Monday-start weeks covering the month, never over the 45-day request cap', () => {
    const march = boardWindow('2026-03-15', 'month')

    expect(march.days[0]).toBe('2026-02-23')
    expect(march.days.at(-1)).toBe('2026-04-05')
    expect(march.days.length % 7).toBe(0)
    expect(march.month).toBe('2026-03')

    // August 2026 starts on a Saturday and needs six rows
    const august = boardWindow('2026-08-10', 'month')

    expect(august.days).toHaveLength(42)

    const spanDays = (Date.parse(august.to) - Date.parse(august.from)) / 86_400_000

    expect(spanDays).toBeLessThanOrEqual(45)
  })

  it('labels the range for the toolbar', () => {
    expect(boardWindow('2026-03-04', 'day').label).toBe('Wed, Mar 4, 2026')
    expect(boardWindow('2026-03-04', 'week').label).toBe('Mar 2 – Mar 8, 2026')
    expect(boardWindow('2026-12-30', 'week').label).toBe('Dec 28, 2026 – Jan 3, 2027')
    expect(boardWindow('2026-03-15', 'month').label).toBe('March 2026')
  })
})

describe('shiftAnchor', () => {
  it('moves by a day, a week or a month', () => {
    expect(shiftAnchor('2026-03-04', 'day', 1)).toBe('2026-03-05')
    expect(shiftAnchor('2026-03-04', 'week', -1)).toBe('2026-02-25')
    expect(shiftAnchor('2026-01-31', 'month', 1)).toBe('2026-02-28')
    expect(shiftAnchor('2026-03-15', 'month', -1)).toBe('2026-02-15')
  })
})

describe('board URL state', () => {
  it('round-trips and drops defaults', () => {
    const state = { ...BOARD_DEFAULTS, anchor: '2026-03-04', range: 'month' as const, siteIds: ['a', 'b'], statuses: ['OPEN' as const] }
    const params = serializeBoardState(state, '2026-09-30')

    expect(params.get('view')).toBeNull()
    expect(params.get('range')).toBe('month')
    expect(params.get('date')).toBe('2026-03-04')
    expect(params.get('sites')).toBe('a,b')
    expect(parseBoardState(params, '2026-09-30')).toEqual(state)
  })

  it('omits the date when it is today, and falls back safely on junk', () => {
    const params = serializeBoardState({ ...BOARD_DEFAULTS, anchor: '2026-09-30' }, '2026-09-30')

    expect(params.toString()).toBe('')

    const parsed = parseBoardState(new URLSearchParams('view=nope&range=year&date=13/45&statuses=OPEN,BAD&drafts=0'), '2026-09-30')

    expect(parsed).toEqual({ ...BOARD_DEFAULTS, anchor: '2026-09-30', statuses: ['OPEN'], includeDraft: false })
  })
})
