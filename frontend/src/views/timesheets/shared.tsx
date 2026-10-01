// MUI Imports
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'

// Type Imports
import type { ThemeColor } from '@core/types'
import type { ExceptionType, TimesheetException, TimesheetStatus } from '@/types/timesheetTypes'

// Context Imports
import { useSession } from '@/contexts/sessionContext'

import { describeException } from './logic/format'

/** One colour per entry status, used for chips and the review filters, so a status reads the same everywhere. */
export const TIMESHEET_STATUS_META: Record<TimesheetStatus, { label: string; color: ThemeColor; icon: string }> = {
  OPEN: { label: 'On shift', color: 'info', icon: 'bx-time-five' },
  SUBMITTED: { label: 'Submitted', color: 'warning', icon: 'bx-send' },
  ADJUSTED: { label: 'Adjusted', color: 'primary', icon: 'bx-edit' },
  REJECTED: { label: 'Rejected', color: 'error', icon: 'bx-x-circle' },
  CORRECTED: { label: 'Corrected', color: 'secondary', icon: 'bx-revision' },
  APPROVED: { label: 'Approved', color: 'success', icon: 'bx-check-circle' },
  INVOICED: { label: 'Invoiced', color: 'success', icon: 'bx-receipt' }
}

/** Statuses in review order, for filters. */
export const TIMESHEET_STATUSES: TimesheetStatus[] = ['OPEN', 'SUBMITTED', 'ADJUSTED', 'REJECTED', 'CORRECTED', 'APPROVED', 'INVOICED']

export const EXCEPTION_META: Record<ExceptionType, { label: string; color: ThemeColor; icon: string }> = {
  LATE_IN: { label: 'Late in', color: 'warning', icon: 'bx-alarm-exclamation' },
  EARLY_OUT: { label: 'Early out', color: 'warning', icon: 'bx-log-out' },
  OVERTIME: { label: 'Overtime', color: 'info', icon: 'bx-timer' },
  GEOFENCE_MISS: { label: 'Off site', color: 'error', icon: 'bx-map-pin' },
  MISSING_CLOCK_OUT: { label: 'No clock-out', color: 'error', icon: 'bx-stopwatch' },
  NO_SHOW: { label: 'No show', color: 'error', icon: 'bx-user-x' }
}

export const EXCEPTION_TYPES = Object.keys(EXCEPTION_META) as ExceptionType[]

export const TimesheetStatusChip = ({ status, size = 'small' }: { status: TimesheetStatus; size?: 'small' | 'medium' }) => (
  <Chip
    variant='tonal'
    size={size}
    color={TIMESHEET_STATUS_META[status].color}
    label={TIMESHEET_STATUS_META[status].label}
    icon={<i className={`${TIMESHEET_STATUS_META[status].icon} text-base`} />}
  />
)

/** An exception as a small chip; the tooltip explains it with the numbers. Resolved ones are outlined. */
export const ExceptionChip = ({ exception }: { exception: Pick<TimesheetException, 'type' | 'detail' | 'resolved'> }) => {
  const meta = EXCEPTION_META[exception.type]

  return (
    <Tooltip title={`${describeException(exception)}${exception.resolved ? ' (resolved)' : ''}`}>
      <Chip
        size='small'
        variant={exception.resolved ? 'outlined' : 'tonal'}
        color={exception.resolved ? 'secondary' : meta.color}
        label={meta.label}
        icon={<i className={`${meta.icon} text-base`} />}
      />
    </Tooltip>
  )
}

/** "Mon, Mar 2" for an instant in a site's timezone. */
export const formatEntryDay = (instant: string, zone: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(instant))

/** "Oct 1, 18:01" for an instant in a site's timezone (24-hour, like every other time on these screens). */
export const formatStamp = (instant: string, zone: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(instant))

/** Role helpers for timesheet screens. The backend enforces access; this only decides what to render. */
export const useTimesheetRole = () => {
  const session = useSession()
  const role = session?.role

  return {
    session,
    isStaff: role === 'ADMIN' || role === 'SUPERVISOR',
    isAdmin: role === 'ADMIN',
    isFieldUser: role === 'FIELD_USER'
  }
}
