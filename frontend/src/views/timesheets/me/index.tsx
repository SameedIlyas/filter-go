'use client'

// React Imports
import { useState } from 'react'

// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Typography from '@mui/material/Typography'

// Type Imports
import type { Timesheet } from '@/types/timesheetTypes'

// Lib Imports
import { useMyTimesheets } from '@/libs/api/queries/timesheets'

import ClockCard from './ClockCard'
import CorrectDialog from './CorrectDialog'
import MyEntries, { EntryActions } from './MyEntries'
import type { EntryHandlers } from './MyEntries'
import WorkLogDialog from './WorkLogDialog'
import { formatMinutes } from '../logic/format'
import { clockRange } from '../logic/times'
import { TimesheetStatusChip, formatEntryDay, useTimesheetRole } from '../shared'

const ATTENTION_LIMIT = 20

const FieldStaffOnly = () => (
  <Card>
    <CardContent className='flex flex-col items-center gap-3 plb-12'>
      <i className='bx-time-five text-5xl text-textSecondary' />
      <Typography variant='h5'>This page is for field staff</Typography>
      <Typography color='text.secondary'>Timesheets are reviewed under Timesheets.</Typography>
    </CardContent>
  </Card>
)

/** Rejected entries to fix and corrected ones still to resubmit; hidden when there are none. */
const NeedsAttention = (handlers: EntryHandlers) => {
  const rejected = useMyTimesheets({ status: 'REJECTED', limit: ATTENTION_LIMIT })
  const corrected = useMyTimesheets({ status: 'CORRECTED', limit: ATTENTION_LIMIT })
  const rows = [...(rejected.data?.items ?? []), ...(corrected.data?.items ?? [])]

  if (rows.length === 0) return null

  return (
    <Card>
      <CardHeader title='Needs your attention' subheader='Your supervisor sent these back. Fix them and resubmit to get paid for the time.' />
      <CardContent className='flex flex-col gap-4'>
        {rows.map(entry => (
          <div key={entry.id} className='flex flex-wrap items-start justify-between gap-3 pis-3' style={{ borderInlineStart: '3px solid var(--mui-palette-error-main)' }}>
            <div className='flex flex-col gap-1'>
              <div className='flex items-center gap-2'>
                <Typography className='font-medium' color='text.primary'>
                  {entry.site.name}
                </Typography>
                <TimesheetStatusChip status={entry.status} />
              </div>
              <Typography variant='body2'>
                {formatEntryDay(entry.shift.scheduledStart, entry.site.timezone)} · {clockRange(entry, entry.site.timezone)} · worked {formatMinutes(entry.actualMinutes)}
              </Typography>
              {entry.status === 'REJECTED' && entry.rejectionReason && (
                <Typography variant='body2' color='error.main'>
                  “{entry.rejectionReason}”
                </Typography>
              )}
              {entry.status === 'CORRECTED' && (
                <Typography variant='body2' color='text.secondary'>
                  Corrected, not sent yet
                </Typography>
              )}
            </div>
            <EntryActions entry={entry} {...handlers} />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

const MyTimesheetsView = () => {
  const [correcting, setCorrecting] = useState<Timesheet | null>(null)
  const [workLogShift, setWorkLogShift] = useState<string | null>(null)
  const handlers: EntryHandlers = { onCorrect: setCorrecting, onWorkLog: setWorkLogShift }

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Typography variant='h4'>My timesheets</Typography>
        <Typography color='text.secondary'>Clock in and out, fix entries your supervisor sent back, and see your hours</Typography>
      </div>
      <div className='grid grid-cols-1 gap-6 md:grid-cols-12'>
        <div className='md:col-span-5'>
          <ClockCard />
        </div>
        <div className='md:col-span-7'>
          <NeedsAttention {...handlers} />
        </div>
      </div>
      <MyEntries {...handlers} />
      <CorrectDialog timesheet={correcting} onClose={() => setCorrecting(null)} />
      <WorkLogDialog shiftId={workLogShift} onClose={() => setWorkLogShift(null)} />
    </div>
  )
}

/** /my-timesheets: field staff only. The backend enforces it too; others get a short pointer instead of empty cards. */
const MyTimesheets = () => {
  const { isFieldUser } = useTimesheetRole()

  return isFieldUser ? <MyTimesheetsView /> : <FieldStaffOnly />
}

export default MyTimesheets
