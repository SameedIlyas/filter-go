'use client'

// MUI Imports
import Alert from '@mui/material/Alert'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'

// Type Imports
import type { AuditEvent } from '@/types/contractTypes'
import type { WarningCode } from '@/types/scheduleTypes'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useAuditTrail } from '@/libs/api/queries/contracts'
import { useStaffOptions } from '@/libs/api/queries/scheduling'

import { WARNING_META, useSchedulingRole } from '../shared'

const ACTIONS: Record<string, { label: string; icon: string }> = {
  created: { label: 'Added the shift', icon: 'bx-plus' },
  updated: { label: 'Changed the shift', icon: 'bx-edit' },
  assigned: { label: 'Assigned', icon: 'bx-user-check' },
  assign_override: { label: 'Assigned despite warnings', icon: 'bx-error' },
  unassigned: { label: 'Unassigned', icon: 'bx-user-minus' },
  cancelled: { label: 'Cancelled', icon: 'bx-x-circle' },
  confirmed: { label: 'Confirmed by the assignee', icon: 'bx-check-double' },
  offered: { label: 'Offered', icon: 'bx-send' },
  extra_added: { label: 'Logged as extra work', icon: 'bx-time' }
}

const when = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** The shift's audit trail (ADMIN only on the server). Overrides show their warnings and reason. */
const ActivityTab = ({ shiftId }: { shiftId: string }) => {
  const trail = useAuditTrail('shift', shiftId)
  const staff = useStaffOptions()
  const { session } = useSchedulingRole()

  const nameOf = (id: string | null | undefined) => {
    if (!id) return 'System'
    if (id === session?.id) return 'You'

    return staff.data?.find(user => user.id === id)?.name ?? 'An admin'
  }

  const detail = (event: AuditEvent) => {
    const diff = event.diff ?? {}

    if (event.action === 'assign_override') {
      const warnings = Array.isArray(diff.warnings) ? diff.warnings.map(warning => WARNING_META[(warning as { code: WarningCode }).code]?.label ?? String((warning as { code?: string }).code)).join(', ') : ''

      return `${nameOf(diff.userId as string)}: ${warnings}${diff.reason ? ` — “${String(diff.reason)}”` : ''}`
    }

    if (event.action === 'assigned' && typeof diff.userId === 'string') return nameOf(diff.userId)
    if (event.action === 'cancelled' && typeof diff.reason === 'string') return `“${diff.reason}”`

    return null
  }

  if (trail.isLoading) return <Skeleton height={120} />
  if (trail.isError) return <Alert severity='error'>{errorMessage(trail.error)}</Alert>
  if (!trail.data?.length) return <Typography color='text.secondary'>No activity yet.</Typography>

  return (
    <div className='flex flex-col gap-4'>
      {trail.data.map(event => {
        const meta = ACTIONS[event.action ?? ''] ?? { label: event.action ?? event.type, icon: 'bx-info-circle' }
        const extra = detail(event)

        return (
          <div key={event.id} className='flex gap-3'>
            <i className={`${meta.icon} text-xl`} />
            <div className='flex flex-col'>
              <Typography color='text.primary'>{meta.label}</Typography>
              {extra && (
                <Typography variant='body2' color='text.secondary'>
                  {extra}
                </Typography>
              )}
              <Typography variant='caption' color='text.disabled'>
                {when.format(new Date(event.at))} · {nameOf(event.actorId)}
              </Typography>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ActivityTab
