// MUI Imports
import Chip from '@mui/material/Chip'

// Type Imports
import type { ThemeColor } from '@core/types'
import type { LeadActivityType, LeadSource, LeadStatus } from '@/types/leadTypes'

export const STATUS_META: Record<LeadStatus, { label: string; color: ThemeColor; icon: string }> = {
  NEW: { label: 'New', color: 'info', icon: 'bx-star' },
  CONTACTED: { label: 'Contacted', color: 'primary', icon: 'bx-phone-call' },
  QUALIFIED: { label: 'Qualified', color: 'warning', icon: 'bx-check-shield' },
  PROPOSAL: { label: 'Proposal', color: 'secondary', icon: 'bx-file' },
  WON: { label: 'Won', color: 'success', icon: 'bx-trophy' },
  LOST: { label: 'Lost', color: 'error', icon: 'bx-x-circle' }
}

export const SOURCE_META: Record<LeadSource, { label: string; icon: string }> = {
  WEBSITE: { label: 'Website', icon: 'bx-globe' },
  PHONE: { label: 'Phone', icon: 'bx-phone' },
  REFERRAL: { label: 'Referral', icon: 'bx-share-alt' },
  FIELD: { label: 'Field', icon: 'bx-map' },
  MANUAL: { label: 'Manual', icon: 'bx-edit' }
}

export const ACTIVITY_META: Record<LeadActivityType, { label: string; icon: string; color: ThemeColor }> = {
  CALL: { label: 'Call', icon: 'bx-phone', color: 'primary' },
  EMAIL: { label: 'Email', icon: 'bx-envelope', color: 'info' },
  SITE_VISIT: { label: 'Site visit', icon: 'bx-map-pin', color: 'warning' },
  NOTE: { label: 'Note', icon: 'bx-note', color: 'secondary' }
}

/** Mirrors the backend pipeline (`leads.status.ts`). WON is reached only through "Convert to contract". */
export const NEXT_STATUSES: Record<LeadStatus, LeadStatus[]> = {
  NEW: ['CONTACTED', 'QUALIFIED', 'PROPOSAL', 'LOST'],
  CONTACTED: ['QUALIFIED', 'PROPOSAL', 'LOST'],
  QUALIFIED: ['PROPOSAL', 'LOST'],
  PROPOSAL: ['LOST'],
  WON: [],
  LOST: ['NEW']
}

export const CONVERTIBLE: LeadStatus[] = ['QUALIFIED', 'PROPOSAL']

export const PIPELINE: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON']

export const StatusChip = ({ status, size = 'small' }: { status: LeadStatus; size?: 'small' | 'medium' }) => (
  <Chip
    variant='tonal'
    size={size}
    color={STATUS_META[status].color}
    label={STATUS_META[status].label}
    icon={<i className={`${STATUS_META[status].icon} text-base`} />}
  />
)

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export const timeAgo = (iso: string) => {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)

  if (seconds < 60) return 'just now'

  const units: Array<[number, string]> = [
    [60 * 60 * 24 * 365, 'y'],
    [60 * 60 * 24 * 30, 'mo'],
    [60 * 60 * 24, 'd'],
    [60 * 60, 'h'],
    [60, 'm']
  ]

  const [size, unit] = units.find(([s]) => seconds >= s) ?? [60, 'm']

  return `${Math.floor(seconds / size)}${unit} ago`
}

/** Drop empty strings so optional fields are omitted rather than sent as "". */
export const compact = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== '' && v !== undefined)) as Partial<T>
