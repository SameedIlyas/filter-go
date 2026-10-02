// MUI Imports
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'

// Type Imports
import type { ThemeColor } from '@core/types'
import type { InvoiceStatus, InvoiceSync, SyncChannel } from '@/types/invoiceTypes'

// Context Imports
import { useSession } from '@/contexts/sessionContext'

import { STATUS_LABEL } from './logic/labels'

export { formatDay, formatMoney } from '../contracts/shared'

/** One colour per invoice status, so a status reads the same in the table, the drawer and the filter. */
export const INVOICE_STATUS_META: Record<InvoiceStatus, { color: ThemeColor; icon: string }> = {
  DRAFT: { color: 'secondary', icon: 'bx-edit' },
  APPROVED: { color: 'info', icon: 'bx-check' },
  SYNCED: { color: 'primary', icon: 'bx-book-bookmark' },
  SENT: { color: 'warning', icon: 'bx-send' },
  PARTIALLY_PAID: { color: 'warning', icon: 'bx-pie-chart-alt' },
  PAID: { color: 'success', icon: 'bx-check-circle' },
  VOID: { color: 'error', icon: 'bx-block' }
}

export const InvoiceStatusChip = ({ status, size = 'small' }: { status: InvoiceStatus; size?: 'small' | 'medium' }) => (
  <Chip
    variant='tonal'
    size={size}
    color={INVOICE_STATUS_META[status].color}
    label={STATUS_LABEL[status]}
    icon={<i className={`${INVOICE_STATUS_META[status].icon} text-base`} />}
  />
)

const channelChip = (name: string, channel: SyncChannel) => {
  if (channel.state === 'DEAD')
    return {
      label: `${name} failed`,
      color: 'error' as const,
      icon: 'bx-error-circle',
      tip: channel.lastError ?? 'Gave up after several attempts.'
    }
  if (channel.state === 'PENDING')
    return {
      label: `${name}…`,
      color: 'info' as const,
      icon: 'bx-loader-alt',
      tip: channel.lastError ? `Retrying: ${channel.lastError}` : 'In progress'
    }

  return null
}

/** A small chip when an integration is still working or has failed; nothing when all is well. */
export const SyncChip = ({ sync }: { sync: InvoiceSync | undefined }) => {
  if (!sync) return null

  const chip = channelChip('Accounting', sync.accounting) ?? channelChip('Pay link', sync.payment)

  if (!chip) return null

  return (
    <Tooltip title={chip.tip}>
      <Chip
        size='small'
        variant='outlined'
        color={chip.color}
        label={chip.label}
        icon={<i className={`${chip.icon} text-base`} />}
      />
    </Tooltip>
  )
}

/** Role helpers for invoice screens. The backend enforces access; this only decides what to render. */
export const useInvoiceRole = () => {
  const session = useSession()
  const role = session?.role

  return {
    session,
    isAdmin: role === 'ADMIN',
    isClient: role === 'CLIENT_USER',
    canRead: role === 'ADMIN' || role === 'CLIENT_USER'
  }
}
