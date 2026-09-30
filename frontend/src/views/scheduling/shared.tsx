// MUI Imports
import Chip from '@mui/material/Chip'

// Type Imports
import type { ThemeColor } from '@core/types'
import type { ScheduleStatus, ShiftStatus, WarningCode } from '@/types/scheduleTypes'

// Context Imports
import { useSession } from '@/contexts/sessionContext'

export const SCHEDULE_STATUS_META: Record<ScheduleStatus, { label: string; color: ThemeColor; icon: string }> = {
  DRAFT: { label: 'Draft', color: 'secondary', icon: 'bx-edit-alt' },
  PUBLISHED: { label: 'Published', color: 'success', icon: 'bx-broadcast' },
  LOCKED: { label: 'Locked', color: 'warning', icon: 'bx-lock-alt' },
  CLOSED: { label: 'Closed', color: 'primary', icon: 'bx-archive' }
}

/**
 * One colour per shift status, used for chips, the left border of board cards and the footer legend, so a
 * status reads the same everywhere.
 */
export const SHIFT_STATUS_META: Record<ShiftStatus, { label: string; color: ThemeColor; icon: string }> = {
  OPEN: { label: 'Open', color: 'error', icon: 'bx-user-x' },
  ASSIGNED: { label: 'Assigned', color: 'info', icon: 'bx-user-check' },
  CONFIRMED: { label: 'Confirmed', color: 'primary', icon: 'bx-check-double' },
  IN_PROGRESS: { label: 'In progress', color: 'warning', icon: 'bx-time-five' },
  COMPLETED: { label: 'Completed', color: 'success', icon: 'bx-check-circle' },
  NO_SHOW: { label: 'No show', color: 'error', icon: 'bx-error' },
  CANCELLED: { label: 'Cancelled', color: 'secondary', icon: 'bx-x-circle' }
}

/** The palette colour of a status as a CSS value, for borders and dots. */
export const statusColor = (status: ShiftStatus) => `var(--mui-palette-${SHIFT_STATUS_META[status].color}-main)`

export const WARNING_META: Record<WarningCode, { label: string; icon: string }> = {
  NO_SITE_ACCESS: { label: 'No site access', icon: 'bx-map-pin' },
  OUTSIDE_AVAILABILITY: { label: 'Outside availability', icon: 'bx-calendar-x' },
  DOCUMENT_EXPIRED: { label: 'Document expired', icon: 'bx-file-blank' },
  DOCUMENT_EXPIRING: { label: 'Document expiring', icon: 'bx-file' },
  OVERTIME: { label: 'Overtime', icon: 'bx-timer' }
}

export const ScheduleStatusChip = ({ status, size = 'small' }: { status: ScheduleStatus; size?: 'small' | 'medium' }) => (
  <Chip
    variant='tonal'
    size={size}
    color={SCHEDULE_STATUS_META[status].color}
    label={SCHEDULE_STATUS_META[status].label}
    icon={<i className={`${SCHEDULE_STATUS_META[status].icon} text-base`} />}
  />
)

export const ShiftStatusChip = ({ status, size = 'small' }: { status: ShiftStatus; size?: 'small' | 'medium' }) => (
  <Chip
    variant='tonal'
    size={size}
    color={SHIFT_STATUS_META[status].color}
    label={SHIFT_STATUS_META[status].label}
    icon={<i className={`${SHIFT_STATUS_META[status].icon} text-base`} />}
  />
)

const dateFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })

/** "Mar 2 – Mar 29, 2026" for a schedule period (calendar dates). */
export const formatPeriod = (start: string, end: string) => {
  const from = new Date(`${start}T00:00:00Z`)
  const to = new Date(`${end}T00:00:00Z`)
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  const first = sameYear ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(from) : dateFormat.format(from)

  return `${first} – ${dateFormat.format(to)}`
}

/** "Mon, Mar 2" for an instant in a site's timezone. */
export const formatShiftDay = (instant: string, zone: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(instant))

/** Role helpers for scheduling screens. The backend enforces access; this only decides what to render. */
export const useSchedulingRole = () => {
  const session = useSession()
  const role = session?.role

  return {
    session,
    isStaff: role === 'ADMIN' || role === 'SUPERVISOR',
    isAdmin: role === 'ADMIN',
    isFieldUser: role === 'FIELD_USER'
  }
}
