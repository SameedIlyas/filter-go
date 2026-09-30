'use client'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'

// Type Imports
import type { Shift } from '@/types/scheduleTypes'

import { timeRange } from '../logic/placeShifts'
import { ShiftStatusChip, formatShiftDay, statusColor } from '../shared'

type Props = { shifts: Shift[]; loading: boolean }

/** My next few shifts (already picked by `upcomingShifts`), each with a status-coloured edge like the board cards. */
const NextUp = ({ shifts, loading }: Props) => (
  <Card>
    <CardHeader title='Next up' subheader='Your next shifts in the coming two weeks' />
    <CardContent className='flex flex-col gap-3'>
      {loading ? (
        <Skeleton variant='rounded' height={120} />
      ) : shifts.length === 0 ? (
        <Typography color='text.secondary'>Nothing scheduled in the next two weeks</Typography>
      ) : (
        shifts.map(shift => (
          <div
            key={shift.id}
            className='flex items-start justify-between gap-2 pis-3'
            style={{ borderInlineStart: `3px solid ${statusColor(shift.status)}` }}
          >
            <div className='flex flex-col'>
              <Typography className='font-medium' color='text.primary'>
                {shift.site.name}
                {shift.isExtra ? ' · Extra' : ''}
              </Typography>
              <Typography variant='body2'>
                {formatShiftDay(shift.scheduledStart, shift.site.timezone)} · {timeRange(shift)}
              </Typography>
            </div>
            <ShiftStatusChip status={shift.status} />
          </div>
        ))
      )}
    </CardContent>
  </Card>
)

export default NextUp
