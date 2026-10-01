'use client'

// MUI Imports
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

// Type Imports
import type { Timesheet } from '@/types/timesheetTypes'

import { formatTimeIn } from '../../scheduling/logic/zoned'
import { reviewActions } from '../logic/actions'
import { formatMinutes, formatVariance } from '../logic/format'
import { clockRange } from '../logic/times'
import { ExceptionChip, TimesheetStatusChip, formatEntryDay } from '../shared'

export const REVIEW_COLUMNS = 10

/** The actions column stays in view while the rest of a wide table scrolls under it. */
export const STICKY_END = 'sticky inline-end-0 z-[1] bg-backgroundPaper'

type Props = {
  entry: Timesheet
  selected: boolean
  approving: boolean
  onToggle: () => void
  onOpen: () => void
  onApprove: () => void
  onAdjust: () => void
  onReject: () => void
}

/** Why a row cannot go into a batch approval (approve-batch only takes clean SUBMITTED entries). */
const batchBlocker = (entry: Timesheet): string => {
  if (entry.status !== 'SUBMITTED') return 'Only submitted entries can be approved in a batch'

  return 'Has open exceptions: open it to review them first'
}

const Flags = ({ entry }: { entry: Timesheet }) => (
  <div className='flex flex-wrap gap-1 empty:hidden'>
    {!entry.billable && <Chip size='small' variant='outlined' label='Not billable' />}
    {!entry.payable && <Chip size='small' variant='outlined' label='Not payable' />}
    {entry.autoClosed && <Chip size='small' variant='tonal' color='warning' label='Auto-closed' />}
    {entry.shift.isExtra && <Chip size='small' variant='tonal' color='warning' label='Extra' />}
  </div>
)

/** The row's own buttons; clicks never reach the row (which opens the drawer). */
const RowActions = ({
  entry,
  approving,
  onOpen,
  onApprove,
  onAdjust,
  onReject
}: Omit<Props, 'selected' | 'onToggle'>) => {
  const actions = reviewActions(entry)

  return (
    <div className='flex items-center justify-end gap-1' onClick={event => event.stopPropagation()}>
      {actions.canApprove && (
        <Tooltip title='Approve'>
          <span>
            <IconButton size='small' color='success' onClick={onApprove} disabled={approving} aria-label='Approve'>
              <i className='bx-check text-xl' />
            </IconButton>
          </span>
        </Tooltip>
      )}
      {actions.canAdjust && (
        <Tooltip title='Adjust times'>
          <IconButton size='small' onClick={onAdjust} aria-label='Adjust'>
            <i className='bx-time text-xl' />
          </IconButton>
        </Tooltip>
      )}
      {actions.canReject && (
        <Tooltip title='Reject'>
          <IconButton size='small' color='error' onClick={onReject} aria-label='Reject'>
            <i className='bx-x text-xl' />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title='Details'>
        <IconButton size='small' onClick={onOpen} aria-label='Details'>
          <i className='bx-detail text-xl' />
        </IconButton>
      </Tooltip>
    </div>
  )
}

/** One entry in the review table. Times are shown in the site's timezone. */
const ReviewRow = (props: Props) => {
  const { entry, selected, onToggle, onOpen } = props
  const zone = entry.site.timezone
  const batchable = reviewActions(entry).batchable
  const open = entry.exceptions.filter(exception => !exception.resolved)

  return (
    <tr className='cursor-pointer' onClick={onOpen}>
      <td onClick={event => event.stopPropagation()}>
        {batchable ? (
          <Checkbox
            size='small'
            checked={selected}
            onChange={onToggle}
            inputProps={{ 'aria-label': 'Select for approval' }}
          />
        ) : (
          <Tooltip title={batchBlocker(entry)}>
            <span>
              <Checkbox size='small' disabled />
            </span>
          </Tooltip>
        )}
      </td>
      <td>
        <Typography color='text.primary' className='font-medium'>
          {entry.user?.name ?? 'Unknown worker'}
        </Typography>
      </td>
      <td>
        <Typography>{entry.site.name}</Typography>
      </td>
      <td className='whitespace-nowrap'>
        <Typography color='text.primary'>{formatEntryDay(entry.shift.scheduledStart, zone)}</Typography>
        <Typography variant='body2' color='text.secondary'>
          {formatTimeIn(entry.shift.scheduledStart, zone)} – {formatTimeIn(entry.shift.scheduledEnd, zone)}
        </Typography>
      </td>
      <td className='whitespace-nowrap'>{clockRange(entry, zone)}</td>
      <td>{entry.breakMinutes > 0 ? formatMinutes(entry.breakMinutes) : '—'}</td>
      <td className='whitespace-nowrap'>
        <Typography color='text.primary'>{formatMinutes(entry.actualMinutes)}</Typography>
        <Typography variant='caption' color='text.secondary'>
          {formatVariance(entry.actualMinutes, entry.scheduledMinutes)}
        </Typography>
      </td>
      <td>
        <div className='flex flex-wrap gap-1'>
          {open.length ? open.map(exception => <ExceptionChip key={exception.id} exception={exception} />) : '—'}
        </div>
      </td>
      <td>
        <div className='flex flex-col items-start gap-1'>
          <TimesheetStatusChip status={entry.status} />
          <Flags entry={entry} />
        </div>
      </td>
      <td className={STICKY_END}>
        <RowActions {...props} />
      </td>
    </tr>
  )
}

export default ReviewRow
