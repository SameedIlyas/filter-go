'use client'

// React Imports
import { useCallback, useMemo, useState } from 'react'

// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useMyOffers, useMyShifts } from '@/libs/api/queries/scheduling'

import MyShiftsCalendar from './MyShiftsCalendar'
import MyOffers from './MyOffers'
import NextUp from './NextUp'
import LogExtraShiftDialog from './LogExtraShiftDialog'
import { queryRangeFor, siteZones, upcomingShifts } from './myShiftsLogic'
import type { MyRange } from './myShiftsLogic'
import { addDays, todayKey } from '../logic/zoned'
import { useSchedulingRole } from '../shared'

const NEXT_UP_DAYS = 14

/** Fixed per visit so the query key stays put; a shift that started yesterday may still be running. */
const nextUpRange = (): MyRange => {
  const today = todayKey()

  return { from: `${addDays(today, -1)}T00:00:00.000Z`, to: `${addDays(today, NEXT_UP_DAYS + 1)}T00:00:00.000Z` }
}

const FieldStaffOnly = () => (
  <Card>
    <CardContent className='flex flex-col items-center gap-3 plb-12'>
      <i className='bx-calendar-check text-5xl text-textSecondary' />
      <Typography variant='h5'>This page is for field staff</Typography>
      <Typography color='text.secondary'>Shifts are planned on the Schedules board.</Typography>
    </CardContent>
  </Card>
)

const MyShiftsView = () => {
  const [range, setRange] = useState<MyRange | null>(null)
  const [nextRange] = useState(nextUpRange)
  const [extraOpen, setExtraOpen] = useState(false)

  const calendar = useMyShifts(range ?? nextRange, range !== null)
  const nextUp = useMyShifts(nextRange)
  const offers = useMyOffers()

  const onRangeChange = useCallback((startStr: string, endStr: string) => {
    const next = queryRangeFor(startStr, endStr)

    setRange(current => (current?.from === next.from && current.to === next.to ? current : next))
  }, [])

  const visible = useMemo(() => (range ? (calendar.data ?? []) : []), [range, calendar.data])
  const upcoming = useMemo(() => upcomingShifts(nextUp.data ?? [], Date.now()), [nextUp.data])

  const zones = useMemo(
    () => siteZones([...(nextUp.data ?? []), ...visible, ...(offers.data ?? []).map(offer => offer.shift)]),
    [nextUp.data, visible, offers.data]
  )

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <div>
          <Typography variant='h4'>My shifts</Typography>
          <Typography color='text.secondary'>Your schedule, open offers, and extra work you did</Typography>
        </div>
        <Button variant='contained' startIcon={<i className='bx-plus' />} onClick={() => setExtraOpen(true)}>
          Log extra shift
        </Button>
      </div>
      {calendar.isError && (
        <Alert
          severity='error'
          action={
            <Button color='inherit' size='small' onClick={() => calendar.refetch()}>
              Retry
            </Button>
          }
        >
          {errorMessage(calendar.error)}
        </Alert>
      )}
      <div className='grid grid-cols-1 gap-6 md:grid-cols-12'>
        <div className='flex flex-col gap-6 md:col-span-4 md:order-2'>
          <MyOffers />
          <NextUp shifts={upcoming} loading={nextUp.isPending} />
        </div>
        <div className='md:col-span-8 md:order-1 min-is-0'>
          <MyShiftsCalendar shifts={visible} loading={calendar.isFetching} onRangeChange={onRangeChange} />
        </div>
      </div>
      <LogExtraShiftDialog open={extraOpen} onClose={() => setExtraOpen(false)} zones={zones} />
    </div>
  )
}

/** /my-shifts: field staff only. The backend enforces it too; others get a short pointer instead of empty cards. */
const MyShifts = () => {
  const { isFieldUser } = useSchedulingRole()

  return isFieldUser ? <MyShiftsView /> : <FieldStaffOnly />
}

export default MyShifts
