'use client'

// MUI Imports
import Alert from '@mui/material/Alert'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'

// Type Imports
import type { AuditEvent } from '@/types/contractTypes'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useAuditTrail } from '@/libs/api/queries/contracts'

import { formatMoney, useInvoiceRole } from '../shared'

const ACTIONS: Record<string, { label: string; icon: string }> = {
  run_created: { label: 'Created by an invoice run', icon: 'bx-plus' },
  updated: { label: 'Edited the draft', icon: 'bx-edit' },
  line_added: { label: 'Added a line', icon: 'bx-list-plus' },
  line_removed: { label: 'Removed a line', icon: 'bx-list-minus' },
  approved: { label: 'Approved', icon: 'bx-check' },
  synced: { label: 'Synced to accounting', icon: 'bx-book-bookmark' },
  sync_failed: { label: 'Sync failed', icon: 'bx-error-circle' },
  sync_retried: { label: 'Retried the sync', icon: 'bx-refresh' },
  send_requested: { label: 'Asked to send', icon: 'bx-send' },
  sent: { label: 'Emailed to the client with a pay link', icon: 'bx-envelope' },
  payment_recorded: { label: 'Payment received', icon: 'bx-dollar-circle' },
  payment_rejected: { label: 'A card payment was rejected', icon: 'bx-error' },
  paid: { label: 'Paid in full', icon: 'bx-check-circle' },
  voided: { label: 'Voided', icon: 'bx-block' },
  deleted: { label: 'Deleted', icon: 'bx-trash' }
}

const when = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** One line of detail from the event's diff, when it says something useful. */
const detailOf = (event: AuditEvent): string | null => {
  const diff = event.diff ?? {}

  const text = (key: string) =>
    typeof diff[key] === 'string' || typeof diff[key] === 'number' ? String(diff[key]) : null

  switch (event.action) {
    case 'approved':
      return text('total') ? `${formatMoney(text('total'))} over ${text('lines')} lines` : null
    case 'synced':
      return text('accountingRef') ? `Ref ${text('accountingRef')}` : null
    case 'sync_failed':
      return text('error') ?? text('lastError')
    case 'payment_recorded':
      return `${formatMoney(text('amount'))} by ${text('method') === 'stripe' ? 'card' : text('method')}${text('externalRef') ? ` · Ref ${text('externalRef')}` : ''}`
    case 'voided':
      return text('reason') ? `“${text('reason')}”` : null
    default:
      return null
  }
}

/** The invoice's audit trail, newest first as the server sends it (ADMIN only). */
const ActivityTab = ({ invoiceId }: { invoiceId: string }) => {
  const trail = useAuditTrail('invoice', invoiceId)
  const { session } = useInvoiceRole()

  const nameOf = (id: string | null) => (!id ? 'System' : id === session?.id ? 'You' : 'An admin')

  if (trail.isLoading) return <Skeleton height={120} />
  if (trail.isError) return <Alert severity='error'>{errorMessage(trail.error)}</Alert>
  if (!trail.data?.length) return <Typography color='text.secondary'>No activity yet.</Typography>

  return (
    <div className='flex flex-col gap-4'>
      {trail.data.map(event => {
        const meta = ACTIONS[event.action ?? ''] ?? { label: event.action ?? event.type, icon: 'bx-info-circle' }
        const extra = detailOf(event)

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
