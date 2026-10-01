'use client'

// React Imports
import { useEffect, useMemo, useState } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { Timesheet } from '@/types/timesheetTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useMyShifts } from '@/libs/api/queries/scheduling'
import { useClockIn, useClockOut, useMyOpenTimesheet } from '@/libs/api/queries/timesheets'

import WorkLogDialog from './WorkLogDialog'
import { canOfferClockIn, clockQueryRange, minutesSince, nextClockable } from './clockLogic'
import { currentPosition, gpsWarning } from './geolocation'
import type { GpsResult } from './geolocation'
import { formatMinutes } from '../logic/format'
import { formatTimeIn } from '../../scheduling/logic/zoned'
import { timeRange } from '../../scheduling/logic/placeShifts'
import { formatEntryDay } from '../shared'

const TICK_MS = 30_000
const MAX_BREAK = 24 * 60

/** `Date.now()`, refreshed every 30 seconds for the elapsed timer and the clock-in window. */
const useNow = () => {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS)

    return () => window.clearInterval(timer)
  }, [])

  return now
}

/** Asks the phone for its position; without one, warns that the supervisor will see an off-site exception. */
const locate = async (): Promise<GpsResult> => {
  const result = await currentPosition()

  if (!result.ok) toast.warning(gpsWarning(result.reason))

  return result
}

type ClockOutProps = { entry: Timesheet | null; onClose: () => void }

/** Clock out: the break taken (whole minutes), then GPS, then submit. */
const ClockOutDialog = ({ entry, onClose }: ClockOutProps) => {
  const clockOut = useClockOut()
  const [breakText, setBreakText] = useState('0')
  const [locating, setLocating] = useState(false)

  useEffect(() => setBreakText('0'), [entry])

  const breakMinutes = Number(breakText.trim() || '0')
  const valid = Number.isInteger(breakMinutes) && breakMinutes >= 0 && breakMinutes <= MAX_BREAK

  const onConfirm = async () => {
    if (!entry || !valid) return

    setLocating(true)
    const position = await locate()

    setLocating(false)

    try {
      await clockOut.mutateAsync({ id: entry.id, input: { ...(position.ok ? position.gps : {}), breakMinutes } })
      toast.success('Clocked out — your timesheet was submitted')
      onClose()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const busy = locating || clockOut.isPending

  return (
    <Dialog open={Boolean(entry)} onClose={onClose} maxWidth='xs' fullWidth>
      <DialogTitle>Clock out</DialogTitle>
      <DialogContent className='flex flex-col gap-4'>
        <Typography>Your timesheet is submitted to your supervisor when you clock out.</Typography>
        <CustomTextField
          label='Break taken (minutes)'
          type='number'
          value={breakText}
          onChange={event => setBreakText(event.target.value)}
          error={!valid}
          helperText={valid ? 'Unpaid break time, if any' : 'Whole minutes between 0 and 1440'}
          slotProps={{ htmlInput: { min: 0, max: MAX_BREAK, step: 1, inputMode: 'numeric' } }}
        />
        <Typography variant='body2' color='text.secondary'>
          Your location is recorded so your supervisor can see you were on site.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button variant='tonal' color='secondary' onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant='contained' color='error' onClick={onConfirm} disabled={busy || !valid}>
          {locating ? 'Finding location…' : clockOut.isPending ? 'Clocking out…' : 'Clock out'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

type OnShiftProps = { entry: Timesheet; now: number; onClockOut: () => void; onWorkLog: () => void }

const OnShift = ({ entry, now, onClockOut, onWorkLog }: OnShiftProps) => (
  <div className='flex flex-col gap-4'>
    <div className='flex flex-col gap-1'>
      <Typography variant='h5'>On shift at {entry.site.name}</Typography>
      <Typography color='text.secondary'>
        Since {entry.clockInAt ? formatTimeIn(entry.clockInAt, entry.site.timezone) : '—'} · {formatEntryDay(entry.shift.scheduledStart, entry.site.timezone)}
      </Typography>
      <Typography variant='h3' color='primary.main'>
        {entry.clockInAt ? formatMinutes(minutesSince(entry.clockInAt, now)) : '—'}
      </Typography>
    </div>
    <div className='flex flex-wrap gap-2'>
      <Button variant='contained' color='error' startIcon={<i className='bx-log-out' />} onClick={onClockOut}>
        Clock out
      </Button>
      <Button variant='tonal' startIcon={<i className='bx-note' />} onClick={onWorkLog}>
        Add work log
      </Button>
    </div>
  </div>
)

/**
 * The worker's clock: clocked in, it shows the running time with Clock out and Add work log; otherwise it offers
 * the next shift to clock in to. The server keeps the time and decides the clock-in window; refusals are toasted.
 */
const ClockCard = () => {
  const now = useNow()

  // Re-keyed once per UTC day, so a page left open overnight starts offering the next day's shift
  const utcDay = new Date(now).toISOString().slice(0, 10)
  const range = useMemo(() => clockQueryRange(Date.parse(`${utcDay}T12:00:00Z`)), [utcDay])
  const open = useMyOpenTimesheet()
  const shifts = useMyShifts(range, open.data === null)
  const clockIn = useClockIn()
  const [clockingOut, setClockingOut] = useState<Timesheet | null>(null)
  const [workLogShift, setWorkLogShift] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)

  const next = useMemo(() => nextClockable(shifts.data ?? [], now), [shifts.data, now])

  const onClockIn = async () => {
    if (!next) return

    setLocating(true)
    const position = await locate()

    setLocating(false)

    try {
      await clockIn.mutateAsync({ shiftId: next.id, gps: position.ok ? position.gps : {} })
      toast.success(`Clocked in at ${next.site.name}`)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const loading = open.isPending || (open.data === null && shifts.isPending)

  return (
    <Card>
      <CardHeader title='Clock' avatar={<i className='bx-time-five text-2xl' />} />
      <CardContent className='flex flex-col gap-3'>
        {open.isError && <Alert severity='error'>{errorMessage(open.error)}</Alert>}
        {loading ? (
          <Skeleton variant='rounded' height={96} />
        ) : open.data ? (
          <OnShift entry={open.data} now={now} onClockOut={() => setClockingOut(open.data)} onWorkLog={() => setWorkLogShift(open.data?.shiftId ?? null)} />
        ) : next ? (
          <div className='flex flex-col gap-3'>
            <div className='flex flex-col'>
              <Typography className='font-medium' color='text.primary'>
                Next: {next.site.name}
              </Typography>
              <Typography variant='body2'>
                {formatEntryDay(next.scheduledStart, next.site.timezone)} · {timeRange(next)}
              </Typography>
            </div>
            <Button
              variant='contained'
              className='self-start'
              startIcon={<i className='bx-log-in' />}
              onClick={onClockIn}
              disabled={!canOfferClockIn(next, now) || locating || clockIn.isPending}
            >
              {locating ? 'Finding location…' : clockIn.isPending ? 'Clocking in…' : 'Clock in'}
            </Button>
            {!canOfferClockIn(next, now) && (
              <Typography variant='body2' color='text.secondary'>
                Clock-in opens closer to the start of the shift.
              </Typography>
            )}
          </div>
        ) : (
          <Typography color='text.secondary'>No shift to clock in to right now</Typography>
        )}
      </CardContent>
      <ClockOutDialog entry={clockingOut} onClose={() => setClockingOut(null)} />
      <WorkLogDialog shiftId={workLogShift} onClose={() => setWorkLogShift(null)} />
    </Card>
  )
}

export default ClockCard
