'use client'

// Next Imports
import Link from 'next/link'

// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useScheduleQuery } from '@/libs/api/queries/scheduling'

// Component Imports
import ShiftBoard from '@views/scheduling/board/ShiftBoard'

import ScheduleHeader from './ScheduleHeader'
import CoverageBar from './CoverageBar'
import TermsPanel from './TermsPanel'
import { StaffOnly } from '../list/feedback'
import { useSchedulingRole } from '../shared'

const BackLink = () => (
  <div className='flex items-center gap-2'>
    <Button
      component={Link}
      href='/schedules/list'
      variant='text'
      color='secondary'
      startIcon={<i className='bx-arrow-back' />}
    >
      All schedules
    </Button>
  </div>
)

const ScheduleDetailBody = ({ id }: { id: string }) => {
  const { data: schedule, isPending, isError, error, refetch } = useScheduleQuery(id)

  if (isPending) {
    return (
      <div className='flex flex-col gap-6'>
        <Skeleton variant='rounded' height={130} />
        <Skeleton variant='rounded' height={140} />
        <Skeleton variant='rounded' height={480} />
      </div>
    )
  }

  if (isError || !schedule) {
    return (
      <Card>
        <CardContent className='flex flex-col items-center gap-3 plb-12'>
          <i className='bx-error-circle text-5xl text-error' />
          <Typography variant='h5'>Couldn&apos;t load this schedule</Typography>
          <Typography color='text.secondary'>{errorMessage(error)}</Typography>
          <div className='flex gap-3'>
            <Button variant='tonal' onClick={() => refetch()}>
              Retry
            </Button>
            <Button component={Link} href='/schedules/list' variant='contained'>
              Back to schedules
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className='flex flex-col gap-6'>
      <ScheduleHeader schedule={schedule} />
      <CoverageBar schedule={schedule} />
      {schedule.termsSnapshot && <TermsPanel terms={schedule.termsSnapshot} siteId={schedule.siteId} />}
      <ShiftBoard scheduleId={schedule.id} initialDate={schedule.periodStart} />
    </div>
  )
}

/** One schedule: its lifecycle, coverage, frozen contract terms, and a board limited to its shifts. */
const ScheduleDetail = ({ id }: { id: string }) => {
  const { isStaff } = useSchedulingRole()

  return (
    <div className='flex flex-col gap-6'>
      <BackLink />
      {isStaff ? <ScheduleDetailBody id={id} /> : <StaffOnly />}
    </div>
  )
}

export default ScheduleDetail
