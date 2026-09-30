import type { Shift, ShiftStatus } from '@/types/scheduleTypes'

import { addDays, dayKeyIn, formatTimeIn, zonedInstant } from '../logic/zoned'

/*
 * Pure helpers behind /my-shifts: which timezone the calendar draws in, the events it draws, the "Next up" pick,
 * and turning the extra-shift form (site-local date and times) into instants.
 */

export type MyRange = { from: string; to: string }

/**
 * The query window for a visible calendar range. FullCalendar reports the range in whichever zone it draws in, so
 * only the calendar dates are kept and the window is padded a day either side: every visible day is then complete
 * in every site timezone, and the key does not change when the calendar switches zone.
 */
export const queryRangeFor = (startStr: string, endStr: string): MyRange => ({
  from: `${addDays(startStr.slice(0, 10), -1)}T00:00:00.000Z`,
  to: `${addDays(endStr.slice(0, 10), 1)}T00:00:00.000Z`
})

/**
 * How the calendar draws times. FullCalendar needs a plugin for named zones, so when every shift shares one site
 * zone the calendar runs in UTC and each shift is given as its site wall clock "coerced" to UTC. With mixed zones
 * (or none) it stays in the browser zone; `mixed` asks for the "local time" caption.
 */
export type CalendarZone = { mode: 'site'; zone: string } | { mode: 'local'; mixed: boolean }

export const calendarZone = (shifts: Pick<Shift, 'site'>[]): CalendarZone => {
  const zones = new Set(shifts.map(shift => shift.site.timezone))

  if (zones.size === 1) return { mode: 'site', zone: [...zones][0] }

  return { mode: 'local', mixed: zones.size > 1 }
}

/** The wall clock of `instant` in `zone`, written as if it were UTC ("2026-03-02T18:00:00Z"). */
export const wallClockAsUtc = (instant: string, zone: string) => `${dayKeyIn(instant, zone)}T${formatTimeIn(instant, zone)}:00Z`

export type ShiftEvent = {
  id: string
  title: string
  start: string
  end: string
  extendedProps: { status: ShiftStatus }
}

export const toShiftEvents = (shifts: Shift[], zone: CalendarZone): ShiftEvent[] => {
  const at = (instant: string, shift: Shift) => (zone.mode === 'site' ? wallClockAsUtc(instant, shift.site.timezone) : instant)

  return shifts.map(shift => ({
    id: shift.id,
    title: shift.isExtra ? `${shift.site.name} · Extra` : shift.site.name,
    start: at(shift.scheduledStart, shift),
    end: at(shift.scheduledEnd, shift),
    extendedProps: { status: shift.status }
  }))
}

const DONE: ShiftStatus[] = ['CANCELLED', 'COMPLETED', 'NO_SHOW']

/** The next `limit` shifts still to work (or being worked), soonest first. */
export const upcomingShifts = <T extends Pick<Shift, 'scheduledStart' | 'scheduledEnd' | 'status'>>(shifts: T[], now: number, limit = 3): T[] =>
  shifts
    .filter(shift => !DONE.includes(shift.status) && Date.parse(shift.scheduledEnd) > now)
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart))
    .slice(0, limit)

/** siteId -> timezone, from every shift we happen to know about. */
export const siteZones = (shifts: Pick<Shift, 'siteId' | 'site'>[]) => new Map(shifts.map(shift => [shift.siteId, shift.site.timezone]))

export type ExtraShiftInput = {
  date: string
  startTime: string
  endTime: string
  zone: string
  period: { start: string; end: string }
}

export type ExtraShiftResult = { ok: true; start: string; end: string } | { ok: false; field: 'date' | 'endTime'; message: string }

/**
 * Site-local date and times -> instants. An end at or before the start crosses midnight (ends the next day), like
 * coverage times. The date must fall inside the schedule period; the backend checks everything again.
 */
export const buildExtraShift = ({ date, startTime, endTime, zone, period }: ExtraShiftInput): ExtraShiftResult => {
  if (date < period.start || date > period.end) {
    return { ok: false, field: 'date', message: 'Pick a date inside the schedule period.' }
  }

  if (startTime === endTime) return { ok: false, field: 'endTime', message: 'End time must be after the start time.' }

  const start = zonedInstant(date, startTime, zone)
  const end = zonedInstant(endTime < startTime ? addDays(date, 1) : date, endTime, zone)

  if (Date.parse(end) <= Date.parse(start)) {
    return { ok: false, field: 'endTime', message: 'End time must be after the start time.' }
  }

  return { ok: true, start, end }
}
