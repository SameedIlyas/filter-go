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

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useShiftQuery } from '@/libs/api/queries/scheduling'

import type { useAssignFlow } from '../board/useAssignFlow'
import { shiftActions } from '../logic/lifecycle'
import { timeRange } from '../logic/placeShifts'
import { ShiftStatusChip, formatShiftDay, useSchedulingRole } from '../shared'
import ActivityTab from './ActivityTab'
import AssignTab from './AssignTab'
import DetailsTab from './DetailsTab'
import OfferTab from './OfferTab'

type TabName = 'details' | 'assign' | 'offer' | 'activity'

type Props = {
  shiftId: string | null
  onClose: () => void

  /** The board's assignment flow, so drag-and-drop and the drawer share one warnings dialog. */
  assignFlow: ReturnType<typeof useAssignFlow>
}

/** Everything about one shift: details and edits, assignment with a live dry run, offers, and its audit trail. */
const ShiftDrawer = ({ shiftId, onClose, assignFlow }: Props) => {
  const { isAdmin } = useSchedulingRole()
  const shift = useShiftQuery(shiftId ?? undefined)
  const [tab, setTab] = useState<TabName>('details')

  useEffect(() => setTab('details'), [shiftId])

  const data = shift.data
  const actions = data ? shiftActions(data) : null

  const tabs: Array<{ value: TabName; label: string; show: boolean }> = [
    { value: 'details', label: 'Details', show: true },
    { value: 'assign', label: data?.assignedUser ? 'Reassign' : 'Assign', show: Boolean(actions?.canAssign) },
    { value: 'offer', label: 'Offer', show: Boolean(actions?.canOffer) },
    { value: 'activity', label: 'Activity', show: isAdmin }
  ]

  const visibleTab = tabs.find(item => item.value === tab && item.show) ? tab : 'details'

  return (
    <Drawer open={shiftId !== null} anchor='right' onClose={onClose} sx={{ '& .MuiDrawer-paper': { width: { xs: '100%', sm: 460 } } }}>
      <div className='flex items-start justify-between gap-3 p-6'>
        {data ? (
          <div className='flex flex-col gap-1'>
            <Typography variant='h5'>{data.site.name}</Typography>
            <Typography color='text.secondary'>
              {formatShiftDay(data.scheduledStart, data.site.timezone)} · {timeRange(data)}
            </Typography>
            <div className='mbs-2 flex flex-wrap gap-2'>
              <ShiftStatusChip status={data.status} />
              {data.isExtra && <Chip size='small' variant='tonal' color='warning' label='Extra' />}
              {data.scheduleStatus === 'DRAFT' && <Chip size='small' variant='outlined' label='Draft schedule' />}
              {(data.scheduleStatus === 'LOCKED' || data.scheduleStatus === 'CLOSED') && (
                <Chip size='small' variant='outlined' icon={<i className='bx-lock-alt' />} label={`Schedule ${data.scheduleStatus.toLowerCase()}`} />
              )}
            </div>
          </div>
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

      <Tabs value={visibleTab} onChange={(_event, next: TabName) => setTab(next)} className='px-6'>
        {tabs
          .filter(item => item.show)
          .map(item => (
            <Tab key={item.value} value={item.value} label={item.label} />
          ))}
      </Tabs>
      <Divider />

      <div className='flex flex-col gap-4 p-6'>
        {shift.isError && <Alert severity='error'>{errorMessage(shift.error)}</Alert>}
        {data && actions && visibleTab === 'details' && <DetailsTab shift={data} actions={actions} onUnassign={() => void assignFlow.unassign(data.id)} busy={assignFlow.busy} />}
        {data && visibleTab === 'assign' && <AssignTab shift={data} assignFlow={assignFlow} onDone={() => setTab('details')} />}
        {data && visibleTab === 'offer' && <OfferTab shift={data} />}
        {data && visibleTab === 'activity' && <ActivityTab shiftId={data.id} />}
      </div>
    </Drawer>
  )
}

export default ShiftDrawer
