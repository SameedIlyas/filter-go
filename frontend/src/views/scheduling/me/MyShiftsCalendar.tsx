'use client'

// React Imports
import { useEffect, useMemo, useRef, useState } from 'react'

// MUI Imports
import Card from '@mui/material/Card'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'

// Third-party Imports
import FullCalendar from '@fullcalendar/react'
import listPlugin from '@fullcalendar/list'
import timeGridPlugin from '@fullcalendar/timegrid'
import type { DatesSetArg, EventClickArg, EventContentArg } from '@fullcalendar/core'

// Type Imports
import type { Shift, ShiftStatus } from '@/types/scheduleTypes'

// Styled Component Imports
import AppFullCalendar from '@/libs/styles/AppFullCalendar'

import ShiftDialog from './ShiftDialog'
import { calendarZone, toShiftEvents } from './myShiftsLogic'
import { SHIFT_STATUS_META } from '../shared'

type Props = {
  shifts: Shift[]
  loading: boolean

  /** The visible range changed (FullCalendar's `datesSet`). */
  onRangeChange: (startStr: string, endStr: string) => void
}

const TIME_FORMAT = { hour: '2-digit', minute: '2-digit', hour12: false } as const

/** Cancelled shifts stay visible but faded and struck through; the template has no "secondary" tint. */
const calendarSx = {
  '& .fc .fc-event.event-cancelled': {
    opacity: 0.6,
    '& .fc-event-title, & .fc-list-event-title': { textDecoration: 'line-through' }
  },
  '& .fc .fc-event.event-bg-secondary:not(.fc-list-event)': {
    border: 0,
    backgroundColor: 'var(--mui-palette-secondary-lightOpacity)',
    '& .fc-event-title, & .fc-event-time': { color: 'var(--mui-palette-secondary-main)' }
  },
  '& .fc .fc-toolbar .fc-timeGridWeek-button, & .fc .fc-toolbar .fc-listWeek-button': { paddingInline: 5 }
}

/**
 * My shifts on a read-only week calendar. Shift times belong to the site: when every visible shift is at one site
 * zone the calendar draws in that zone (see `calendarZone`), otherwise it draws in local time and says so.
 */
const MyShiftsCalendar = ({ shifts, loading, onRangeChange }: Props) => {
  const theme = useTheme()
  const isNarrow = useMediaQuery(theme.breakpoints.down('md'))
  const calendarRef = useRef<FullCalendar>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const zone = useMemo(() => calendarZone(shifts), [shifts])
  const events = useMemo(() => toShiftEvents(shifts, zone), [shifts, zone])
  const openShift = shifts.find(shift => shift.id === openId) ?? null

  // Lists read better than a squeezed time grid on phones; follow the breakpoint when it changes
  useEffect(() => {
    calendarRef.current?.getApi().changeView(isNarrow ? 'listWeek' : 'timeGridWeek')
  }, [isNarrow])

  const eventClassNames = ({ event }: EventContentArg) => {
    const status = event.extendedProps.status as ShiftStatus

    return [`event-bg-${SHIFT_STATUS_META[status].color}`, ...(status === 'CANCELLED' ? ['event-cancelled'] : [])]
  }

  return (
    <Card className='overflow-visible relative'>
      {loading && <LinearProgress sx={{ position: 'absolute', insetInline: 0, top: 0, zIndex: 2 }} />}
      <AppFullCalendar className='app-calendar flex-col p-6' sx={calendarSx}>
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, listPlugin]}
          initialView='timeGridWeek'
          headerToolbar={{ start: 'prev,next title', end: 'timeGridWeek,listWeek' }}
          buttonText={{ timeGridWeek: 'Week', listWeek: 'List' }}
          views={{ week: { titleFormat: { year: 'numeric', month: 'short', day: 'numeric' } } }}
          firstDay={1}
          timeZone={zone.mode === 'site' ? 'UTC' : 'local'}
          events={events}
          editable={false}
          selectable={false}
          allDaySlot={false}
          nowIndicator={zone.mode === 'local'}
          scrollTime='06:00:00'
          height={680}
          eventTimeFormat={TIME_FORMAT}
          slotLabelFormat={TIME_FORMAT}
          noEventsContent='No shifts this week'
          eventClassNames={eventClassNames}
          eventClick={({ event }: EventClickArg) => setOpenId(event.id)}
          datesSet={({ startStr, endStr }: DatesSetArg) => onRangeChange(startStr, endStr)}
          direction={theme.direction}
        />
        <Typography variant='caption' color='text.secondary' className='mbs-3'>
          {zone.mode === 'site' ? `Times shown in site time (${zone.zone})` : zone.mixed ? 'Times shown in your local time' : ''}
        </Typography>
      </AppFullCalendar>
      <ShiftDialog shift={openShift} onClose={() => setOpenId(null)} />
    </Card>
  )
}

export default MyShiftsCalendar
