'use client'

// React Imports
import type { ReactNode } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'

// Type Imports
import type { ClockPoint, TimesheetDetail } from '@/types/timesheetTypes'

import { formatTimeIn } from '../../scheduling/logic/zoned'
import { reviewActions } from '../logic/actions'
import { formatMinutes, formatVariance } from '../logic/format'
import { formatEntryDay } from '../shared'

type Props = {
  entry: TimesheetDetail
  approving: boolean
  onApprove: () => void
  onAdjust: () => void
  onReject: () => void
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className='flex items-start justify-between gap-4'>
    <Typography color='text.secondary'>{label}</Typography>
    <div className='text-end'>{children}</div>
  </div>
)

const at = (instant: string | null, zone: string) =>
  instant ? `${formatEntryDay(instant, zone)}, ${formatTimeIn(instant, zone)}` : '—'

/** A clock point: its time, how far from the site it was taken, and a map link when there are coordinates. */
const Point = ({ point, zone, label }: { point: ClockPoint; zone: string; label: string }) => (
  <Row label={label}>
    <Typography color='text.primary'>{at(point.at, zone)}</Typography>
    {point.at && (
      <Typography variant='body2' color={point.distanceMeters === null ? 'text.disabled' : 'text.secondary'}>
        {point.lat === null || point.lng === null
          ? 'No GPS'
          : point.distanceMeters === null
            ? 'GPS recorded'
            : `${point.distanceMeters} m from the site`}
        {point.lat !== null && point.lng !== null && (
          <>
            {' · '}
            <a
              href={`https://www.google.com/maps?q=${point.lat},${point.lng}`}
              target='_blank'
              rel='noreferrer'
              className='text-primary'
            >
              Open in Google Maps
            </a>
          </>
        )}
      </Typography>
    )}
  </Row>
)

/** Money stamped on approval: pay for staff, bill for admins (the API omits what the viewer may not see). */
const Rates = ({ entry }: { entry: TimesheetDetail }) => {
  if (!entry.payRateSnapshot && !entry.billRateSnapshot) return null

  return (
    <Row label='Rates'>
      {entry.payRateSnapshot && <Typography color='text.primary'>Pay rate ${entry.payRateSnapshot}/h</Typography>}
      {entry.billRateSnapshot && <Typography color='text.secondary'>Bill rate ${entry.billRateSnapshot}/h</Typography>}
    </Row>
  )
}

const Actions = ({ entry, approving, onApprove, onAdjust, onReject }: Props) => {
  const actions = reviewActions(entry)

  if (!actions.canApprove && !actions.canAdjust && !actions.canReject) return null

  return (
    <div className='flex flex-wrap gap-2 pbs-2'>
      {actions.canApprove && (
        <Button
          variant='contained'
          color='success'
          startIcon={<i className='bx-check' />}
          onClick={onApprove}
          disabled={approving}
        >
          {approving ? 'Approving…' : 'Approve'}
        </Button>
      )}
      {actions.canAdjust && (
        <Button variant='tonal' startIcon={<i className='bx-time' />} onClick={onAdjust}>
          Adjust
        </Button>
      )}
      {actions.canReject && (
        <Button variant='tonal' color='error' startIcon={<i className='bx-x' />} onClick={onReject}>
          Reject
        </Button>
      )}
    </div>
  )
}

/** Times, money flags, approval and GPS for one entry, with the review actions underneath. */
const DetailsPanel = (props: Props) => {
  const { entry } = props
  const zone = entry.site.timezone
  const variance = formatVariance(entry.actualMinutes, entry.scheduledMinutes)

  return (
    <div className='flex flex-col gap-3'>
      {entry.rejectionReason && entry.status !== 'APPROVED' && (
        <Alert severity='error'>Rejected: {entry.rejectionReason}</Alert>
      )}
      {entry.adjustmentReason && <Alert severity='info'>Adjusted: {entry.adjustmentReason}</Alert>}
      <Row label='Scheduled'>
        <Typography color='text.primary'>
          {formatTimeIn(entry.shift.scheduledStart, zone)} – {formatTimeIn(entry.shift.scheduledEnd, zone)} (
          {formatMinutes(entry.scheduledMinutes)})
        </Typography>
      </Row>
      <Point point={entry.clockIn} zone={zone} label='Clocked in' />
      <Point point={entry.clockOut} zone={zone} label='Clocked out' />
      <Row label='Break'>
        <Typography color='text.primary'>{formatMinutes(entry.breakMinutes)}</Typography>
      </Row>
      <Row label='Worked'>
        <Typography color='text.primary' className='font-medium'>
          {formatMinutes(entry.actualMinutes)}
          {variance && <span className='font-normal text-textSecondary'> ({variance})</span>}
        </Typography>
      </Row>
      <Row label='Billable / payable'>
        <Typography color='text.primary'>
          {entry.billable ? 'Billable' : 'Not billable'} · {entry.payable ? 'Payable' : 'Not payable'}
        </Typography>
      </Row>
      <Rates entry={entry} />
      {entry.approvedAt && (
        <Row label='Approved'>
          <Typography color='text.primary'>{at(entry.approvedAt, zone)}</Typography>
        </Row>
      )}
      <Divider />
      <Row label='Site'>
        <Typography color='text.primary'>{entry.site.name}</Typography>
        {entry.site.address && (
          <Typography variant='body2' color='text.secondary'>
            {entry.site.address}
          </Typography>
        )}
        <Typography variant='caption' color='text.disabled'>
          Times in {zone}
        </Typography>
      </Row>
      <Actions {...props} />
    </div>
  )
}

export default DetailsPanel
