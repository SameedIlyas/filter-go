// MUI Imports
import Chip from '@mui/material/Chip'

// Type Imports
import type { ThemeColor } from '@core/types'
import type { ComplianceStatus, EmploymentType, Role, UserStatus } from '@/types/userTypes'

export const ROLE_META: Record<Role, { label: string; color: ThemeColor; icon: string; hint: string }> = {
  ADMIN: { label: 'Admin', color: 'error', icon: 'bx-crown', hint: 'Everything in the organization' },
  SUPERVISOR: { label: 'Supervisor', color: 'warning', icon: 'bx-user-check', hint: 'Manages their sites and crews' },
  FIELD_USER: { label: 'Field user', color: 'primary', icon: 'bx-hard-hat', hint: 'Own shifts, clock in/out' },
  CLIENT_USER: { label: 'Client user', color: 'info', icon: 'bx-briefcase', hint: "Read-only portal for one client" }
}

export const STATUS_META: Record<UserStatus, { label: string; color: ThemeColor }> = {
  ACTIVE: { label: 'Active', color: 'success' },
  INVITED: { label: 'Invited', color: 'warning' },
  DISABLED: { label: 'Disabled', color: 'secondary' }
}

export const EMPLOYMENT_META: Record<EmploymentType, string> = {
  EMPLOYEE: 'Employee',
  CONTRACTOR: 'Contractor'
}

export const COMPLIANCE_META: Record<ComplianceStatus, { label: string; color: ThemeColor }> = {
  VALID: { label: 'Valid', color: 'success' },
  EXPIRING: { label: 'Expiring soon', color: 'warning' },
  EXPIRED: { label: 'Expired', color: 'error' }
}

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export const RoleChip = ({ role }: { role: Role }) => (
  <Chip
    size='small'
    variant='tonal'
    color={ROLE_META[role].color}
    label={ROLE_META[role].label}
    icon={<i className={`${ROLE_META[role].icon} text-base`} />}
  />
)

export const StatusChip = ({ status }: { status: UserStatus }) => (
  <Chip size='small' variant='tonal' color={STATUS_META[status].color} label={STATUS_META[status].label} />
)

/** "YYYY-MM-DD" is a calendar day, so format it without a timezone shift. */
export const formatDay = (day: string | null) => {
  if (!day) return '—'

  const [y, m, d] = day.split('-').map(Number)

  return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Never'

export const formatMoney = (value: string | null | undefined) => (value ? `$${value}` : '—')
