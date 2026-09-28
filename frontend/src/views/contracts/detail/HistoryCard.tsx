'use client'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'

// Third-party Imports
import { useQuery } from '@tanstack/react-query'

// Type Imports
import type { ThemeColor } from '@core/types'
import type { User } from '@/types/api'
import type { AuditEvent } from '@/types/contractTypes'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'

// Lib Imports
import { bff, errorMessage } from '@/libs/api/bff'
import { useAuditTrail } from '@/libs/api/queries/contracts'
import { queryKeys } from '@/libs/react-query/query-keys'

const ACTIONS: Record<string, { label: string; icon: string; color: ThemeColor }> = {
  created: { label: 'Created the draft', icon: 'bx-plus', color: 'primary' },
  version_created: { label: 'Created this version', icon: 'bx-copy-alt', color: 'primary' },
  updated: { label: 'Changed the terms', icon: 'bx-edit', color: 'secondary' },
  lines_replaced: { label: 'Updated the services', icon: 'bx-list-ul', color: 'secondary' },
  coverage_replaced: { label: 'Updated the coverage plan', icon: 'bx-calendar-edit', color: 'secondary' },
  submitted: { label: 'Sent for signature', icon: 'bx-send', color: 'warning' },
  signed: { label: 'Recorded the signature', icon: 'bx-pen', color: 'success' },
  suspended: { label: 'Suspended the contract', icon: 'bx-pause-circle', color: 'info' },
  resumed: { label: 'Resumed the contract', icon: 'bx-play-circle', color: 'success' },
  cancelled: { label: 'Cancelled the contract', icon: 'bx-x-circle', color: 'error' },
  expired: { label: 'Contract expired', icon: 'bx-time-five', color: 'primary' },
  auto_renewed: { label: 'Auto-renewed for a year', icon: 'bx-refresh', color: 'info' }
}

const HEADER_LABELS: Record<string, string> = {
  startDate: 'start date',
  endDate: 'end date',
  autoRenew: 'auto-renew',
  billingType: 'billing type',
  billingCycle: 'billing cycle'
}

/** One short line of detail from the audit diff, where there is something worth saying. */
const detail = (event: AuditEvent): string | null => {
  const diff = event.diff ?? {}

  switch (event.action) {
    case 'updated':
      return Object.keys(diff)
        .map(key => HEADER_LABELS[key] ?? key)
        .join(', ')
    case 'lines_replaced':
    case 'coverage_replaced':
      return `${diff.added ?? 0} row(s) now`
    case 'signed':
      return diff.signedBy ? `Signed by ${String(diff.signedBy)}` : null
    case 'cancelled':
      return diff.reason ? `Reason: ${String(diff.reason)}` : null
    case 'expired':
      return diff.supersededBy ? 'Replaced by a newer version' : 'End date passed'
    default:
      return null
  }
}

/** Names for the actors in the trail (active and past users of the organization). */
const useUserNames = () =>
  useQuery({
    queryKey: [...queryKeys.contracts.all(), 'user-names'],
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const { data } = await bff<{ users: User[] }>('users', { query: { limit: 100 }, signal })

      return Object.fromEntries(data.users.map(user => [user.id, user.name])) as Record<string, string>
    }
  })

/** The contract's audit trail, newest first (ADMIN only, like the endpoint behind it). */
const HistoryCard = ({ contractId }: { contractId: string }) => {
  const trail = useAuditTrail('contract', contractId)
  const names = useUserNames()

  return (
    <Card>
      <CardHeader title='History' />
      <CardContent className='flex flex-col gap-4'>
        {trail.isPending && [0, 1, 2].map(i => <Skeleton key={i} height={40} />)}
        {trail.isError && <Typography color='error'>{errorMessage(trail.error)}</Typography>}
        {trail.data?.length === 0 && <Typography color='text.disabled'>Nothing recorded yet.</Typography>}
        {trail.data?.map(event => {
          const meta = ACTIONS[event.action ?? ''] ?? {
            label: event.action ?? event.type,
            icon: 'bx-history',
            color: 'secondary' as const
          }

          const who = event.actorId ? (names.data?.[event.actorId] ?? 'A user') : 'System'
          const extra = detail(event)

          return (
            <div key={event.id} className='flex items-start gap-3'>
              <CustomAvatar skin='light' color={meta.color} size={32}>
                <i className={`${meta.icon} text-lg`} />
              </CustomAvatar>
              <div className='flex flex-col min-is-0'>
                <Typography color='text.primary'>{meta.label}</Typography>
                {extra && (
                  <Typography variant='body2' color='text.secondary' className='break-words'>
                    {extra}
                  </Typography>
                )}
                <Typography variant='body2' color='text.disabled'>
                  {who} ·{' '}
                  {new Date(event.at).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </Typography>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

export default HistoryCard
