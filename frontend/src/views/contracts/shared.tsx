// MUI Imports
import Chip from '@mui/material/Chip'

// Type Imports
import type { ThemeColor } from '@core/types'
import type {
  BillingCycle,
  BillingType,
  ContractCoverage,
  ContractStatus,
  CoveragePattern,
  PaymentTerms
} from '@/types/contractTypes'

export const STATUS_META: Record<ContractStatus, { label: string; color: ThemeColor; icon: string }> = {
  DRAFT: { label: 'Draft', color: 'secondary', icon: 'bx-edit-alt' },
  PENDING_SIGNATURE: { label: 'Pending signature', color: 'warning', icon: 'bx-pen' },
  ACTIVE: { label: 'Active', color: 'success', icon: 'bx-check-circle' },
  SUSPENDED: { label: 'Suspended', color: 'info', icon: 'bx-pause-circle' },
  EXPIRED: { label: 'Expired', color: 'primary', icon: 'bx-time-five' },
  CANCELLED: { label: 'Cancelled', color: 'error', icon: 'bx-x-circle' }
}

export const BILLING_TYPES: Array<{ value: BillingType; label: string; hint: string }> = [
  { value: 'PER_VISIT', label: 'Per visit', hint: 'Fixed rate per completed visit' },
  { value: 'HOURLY', label: 'Hourly', hint: 'Approved minutes × hourly rate' },
  { value: 'MONTHLY_FIXED', label: 'Monthly fixed', hint: 'Flat amount per cycle' }
]

export const BILLING_CYCLES: Array<{ value: BillingCycle; label: string }> = [
  { value: 'PER_VISIT', label: 'Per visit' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'BIWEEKLY', label: 'Bi-weekly' },
  { value: 'MONTHLY', label: 'Monthly' }
]

export const PAYMENT_TERMS: Array<{ value: PaymentTerms; label: string }> = [
  { value: 'NET15', label: 'Net 15' },
  { value: 'NET30', label: 'Net 30' },
  { value: 'DUE_ON_RECEIPT', label: 'Due on receipt' }
]

export const PATTERNS: Array<{ value: CoveragePattern; label: string; hint: string }> = [
  { value: 'WEEKLY', label: 'Weekly', hint: 'Same days and hours every week' },
  { value: 'INTERVAL', label: 'Every N days', hint: 'One visit every N days' },
  { value: 'AD_HOC', label: 'Ad hoc', hint: 'Visits are booked by hand' }
]

/** ISO weekday numbers used by the API: 1 = Monday ... 7 = Sunday. */
export const WEEKDAYS: Array<{ value: number; short: string }> = [
  { value: 1, short: 'Mon' },
  { value: 2, short: 'Tue' },
  { value: 3, short: 'Wed' },
  { value: 4, short: 'Thu' },
  { value: 5, short: 'Fri' },
  { value: 6, short: 'Sat' },
  { value: 7, short: 'Sun' }
]

export const billingTypeLabel = (value: BillingType) => BILLING_TYPES.find(t => t.value === value)?.label ?? value
export const billingCycleLabel = (value: BillingCycle) => BILLING_CYCLES.find(c => c.value === value)?.label ?? value
export const paymentTermsLabel = (value: PaymentTerms) => PAYMENT_TERMS.find(p => p.value === value)?.label ?? value

/** Rate caption for a line, depending on how the contract bills. */
export const rateUnit = (type: BillingType) =>
  type === 'HOURLY' ? '/ hr' : type === 'PER_VISIT' ? '/ visit' : '/ cycle'

/** Lifecycle actions on offer per status, mirroring the backend state machine (`contract.state.ts`). */
export const EDITABLE: ContractStatus[] = ['DRAFT']
export const CANCELLABLE: ContractStatus[] = ['DRAFT', 'PENDING_SIGNATURE', 'ACTIVE', 'SUSPENDED']
export const VERSIONABLE: ContractStatus[] = ['ACTIVE', 'SUSPENDED']

export const StatusChip = ({ status, size = 'small' }: { status: ContractStatus; size?: 'small' | 'medium' }) => (
  <Chip
    variant='tonal'
    size={size}
    color={STATUS_META[status].color}
    label={STATUS_META[status].label}
    icon={<i className={`${STATUS_META[status].icon} text-base`} />}
  />
)

/** "YYYY-MM-DD" calendar date, shown without a timezone shift. */
export const formatDay = (day: string | null | undefined) => {
  if (!day) return '—'

  const [year, month, date] = day.split('-').map(Number)

  return new Date(year, month - 1, date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

export const formatTerm = (start: string, end: string | null) =>
  `${formatDay(start)} → ${end ? formatDay(end) : 'Open-ended'}`

const currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' })

export const formatMoney = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? '—' : currency.format(Number(value))

/** Days from today until a "YYYY-MM-DD" date (negative once it has passed). */
export const daysUntil = (day: string) => {
  const [year, month, date] = day.split('-').map(Number)
  const today = new Date()

  return Math.round(
    (new Date(year, month - 1, date).getTime() -
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
      86_400_000
  )
}

export const formatMinutes = (minutes: number | null) => {
  if (!minutes) return '—'

  const h = Math.floor(minutes / 60)
  const m = minutes % 60

  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`
}

export const describeCoverage = (
  row: Pick<ContractCoverage, 'patternType' | 'weekdays' | 'timeStart' | 'timeEnd' | 'intervalDays' | 'visitsPerPeriod'>
) => {
  if (row.patternType === 'INTERVAL') return `Every ${row.intervalDays ?? '?'} day${row.intervalDays === 1 ? '' : 's'}`

  if (row.patternType === 'AD_HOC')
    return `Ad hoc · ${row.visitsPerPeriod ?? '?'} visit${row.visitsPerPeriod === 1 ? '' : 's'} per period`

  const days = [...row.weekdays].sort((a, b) => a - b)

  const label =
    days.length === 7
      ? 'Every day'
      : days.join() === '1,2,3,4,5'
        ? 'Weekdays'
        : days.map(day => WEEKDAYS.find(w => w.value === day)?.short).join(', ')

  const overnight = row.timeStart && row.timeEnd && row.timeEnd <= row.timeStart ? ' (overnight)' : ''

  return `${label} · ${row.timeStart ?? '?'}–${row.timeEnd ?? '?'}${overnight}`
}

/** Drop empty strings so optional fields are omitted rather than sent as "". */
export const compact = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== '' && v !== undefined)) as Partial<T>

/** The reference-style M T W T F S S circles. Read-only when `onChange` is omitted. */
export const DayCircles = ({
  value,
  onChange,
  error
}: {
  value: number[]
  onChange?: (days: number[]) => void
  error?: boolean
}) => (
  <div className='flex gap-1'>
    {WEEKDAYS.map(day => {
      const on = value.includes(day.value)

      return (
        <button
          key={day.value}
          type='button'
          title={day.short}
          disabled={!onChange}
          aria-pressed={on}
          onClick={() =>
            onChange?.(on ? value.filter(d => d !== day.value) : [...value, day.value].sort((a, b) => a - b))
          }
          className={`flex items-center justify-center rounded-full bs-7 is-7 text-xs font-medium border ${
            on
              ? 'bg-primary text-[var(--mui-palette-primary-contrastText)] border-primary'
              : error
                ? 'border-error text-error'
                : 'border-[var(--mui-palette-divider)] text-textSecondary'
          } ${onChange ? 'cursor-pointer' : 'cursor-default'}`}
        >
          {day.short[0]}
        </button>
      )
    })}
  </div>
)

/** Minutes between two "HH:mm" times; an end at or before the start runs past midnight. */
export const spanMinutes = (start: string | null | undefined, end: string | null | undefined) => {
  if (!start || !end || !/^\d\d:\d\d$/.test(start) || !/^\d\d:\d\d$/.test(end)) return 0

  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
  const diff = toMin(end) - toMin(start)

  return diff > 0 ? diff : diff + 24 * 60
}

/** "lines[2].billRate" -> { index: 2, field: 'billRate' }. */
export const parseRowPath = (path: string, root: 'lines' | 'coverage') => {
  const match = /^(lines|coverage)\[(\d+)\](?:\.(\w+))?$/.exec(path)

  return match && match[1] === root ? { index: Number(match[2]), field: match[3] ?? '' } : null
}
