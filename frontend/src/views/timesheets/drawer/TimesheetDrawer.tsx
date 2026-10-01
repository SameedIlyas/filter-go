'use client'

// React Imports
import { useEffect, useState } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Skeleton from '@mui/material/Skeleton'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { TimesheetDetail } from '@/types/timesheetTypes'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useApproveTimesheet, useTimesheetQuery } from '@/libs/api/queries/timesheets'

import { formatTimeIn } from '../../scheduling/logic/zoned'
import AdjustDialog from '../review/AdjustDialog'
import RejectDialog from '../review/RejectDialog'
import { TimesheetStatusChip, formatEntryDay, useTimesheetRole } from '../shared'
import ActivityList from './ActivityList'
import DetailsPanel from './DetailsPanel'
import ExceptionList from './ExceptionList'
import WorkLogList from './WorkLogList'

type TabName = 'details' | 'exceptions' | 'logs' | 'activity'

type Props = { timesheetId: string | null; onClose: () => void }

const Header = ({ entry }: { entry: TimesheetDetail }) => {
  const zone = entry.site.timezone

  return (
    <div className='flex flex-col gap-1'>
      <Typography variant='h5'>{entry.user?.name ?? 'Timesheet'}</Typography>
      <Typography color='text.secondary'>
        {entry.site.name} · {formatEntryDay(entry.shift.scheduledStart, zone)} ·{' '}
        {formatTimeIn(entry.shift.scheduledStart, zone)} – {formatTimeIn(entry.shift.scheduledEnd, zone)}
      </Typography>
      <div className='mbs-2 flex flex-wrap gap-2'>
        <TimesheetStatusChip status={entry.status} />
        {entry.shift.isExtra && <Chip size='small' variant='tonal' color='warning' label='Extra' />}
        {entry.autoClosed && <Chip size='small' variant='tonal' color='warning' label='Auto-closed' />}
      </div>
    </div>
  )
}

/** A tab label with a small count chip (unresolved exceptions, work logs). */
const Counted = ({ label, count, color }: { label: string; count: number; color: 'error' | 'secondary' }) => (
  <span className='flex items-center gap-2'>
    {label}
    {count > 0 && <Chip size='small' label={count} color={color} variant='tonal' className='bs-5' />}
  </span>
)

/** Everything about one entry: times and GPS with the review actions, exceptions, work logs and its audit trail. */
const TimesheetDrawer = ({ timesheetId, onClose }: Props) => {
  const { isStaff } = useTimesheetRole()
  const detail = useTimesheetQuery(timesheetId)
  const approve = useApproveTimesheet()
  const [tab, setTab] = useState<TabName>('details')
  const [adjusting, setAdjusting] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  useEffect(() => setTab('details'), [timesheetId])

  const entry = detail.data
  const openExceptions = entry?.exceptions.filter(exception => !exception.resolved).length ?? 0
  const finished = entry?.status === 'APPROVED' || entry?.status === 'INVOICED'

  const onApprove = async () => {
    if (!entry) return

    try {
      await approve.mutateAsync(entry.id)
      toast.success('Timesheet approved')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <Drawer
      open={timesheetId !== null}
      anchor='right'
      onClose={onClose}
      sx={{ '& .MuiDrawer-paper': { width: { xs: '100%', sm: 520 } } }}
    >
      <div className='flex items-start justify-between gap-3 p-6'>
        {entry ? (
          <Header entry={entry} />
        ) : (
          <div className='flex flex-1 flex-col gap-2'>
            <Skeleton width='60%' height={32} />
            <Skeleton width='40%' />
          </div>
        )}
        <IconButton size='small' onClick={onClose} aria-label='Close'>
          <i className='bx-x text-textPrimary text-2xl' />
        </IconButton>
      </div>

      <Tabs value={tab} onChange={(_event, next: TabName) => setTab(next)} className='px-6' variant='scrollable' scrollButtons='auto'>
        <Tab value='details' label='Details' />
        <Tab value='exceptions' label={<Counted label='Exceptions' count={openExceptions} color='error' />} />
        <Tab value='logs' label={<Counted label='Logs' count={entry?.workLogs.length ?? 0} color='secondary' />} />
        {isStaff && <Tab value='activity' label='Activity' />}
      </Tabs>
      <Divider />

      <div className='flex flex-col gap-4 p-6'>
        {detail.isError && <Alert severity='error'>{errorMessage(detail.error)}</Alert>}
        {detail.isLoading && <Skeleton variant='rounded' height={240} />}
        {entry && tab === 'details' && (
          <DetailsPanel
            entry={entry}
            approving={approve.isPending}
            onApprove={() => void onApprove()}
            onAdjust={() => setAdjusting(true)}
            onReject={() => setRejecting(true)}
          />
        )}
        {entry && tab === 'exceptions' && (
          <ExceptionList exceptions={entry.exceptions} canResolve={isStaff && !finished} zone={entry.site.timezone} />
        )}
        {entry && tab === 'logs' && <WorkLogList logs={entry.workLogs} shiftId={entry.shiftId} canAdd={isStaff} zone={entry.site.timezone} />}
        {entry && tab === 'activity' && <ActivityList activity={entry.activity ?? []} zone={entry.site.timezone} />}
      </div>

      <AdjustDialog timesheet={adjusting && entry ? entry : null} onClose={() => setAdjusting(false)} />
      <RejectDialog timesheet={rejecting && entry ? entry : null} onClose={() => setRejecting(false)} />
    </Drawer>
  )
}

export default TimesheetDrawer
