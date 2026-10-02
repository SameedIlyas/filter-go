'use client'

// MUI Imports
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

// Type Imports
import type { InvoiceSummary } from '@/types/invoiceTypes'

import { invoiceActions } from '../logic/actions'
import { isoDay } from '../logic/period'
import { InvoiceStatusChip, SyncChip, formatDay, formatMoney } from '../shared'

export const HEADERS = [
  'Invoice',
  'Client',
  'Contract',
  'Issued',
  'Due',
  'Status',
  'Period',
  'Subtotal',
  'Tax',
  'Total',
  'Balance',
  'Sent'
]

/** Every header plus the actions column. */
export const COLUMNS = HEADERS.length + 1

export const STICKY_END = 'sticky inline-end-0 bg-backgroundPaper z-[1]'

type Props = {
  invoice: InvoiceSummary
  isAdmin: boolean
  busy: boolean
  onOpen: () => void
  onRetrySync: () => void
  onDelete: () => void
}

const today = () => isoDay(new Date())

/** Overdue: still owed after the due date, and the client has it (sent or partly paid). */
const isOverdue = (invoice: InvoiceSummary) =>
  (invoice.status === 'SENT' || invoice.status === 'PARTIALLY_PAID') &&
  Number(invoice.balance) > 0 &&
  invoice.dueDate < today()

const InvoiceRow = ({ invoice, isAdmin, busy, onOpen, onRetrySync, onDelete }: Props) => {
  const actions = invoiceActions(invoice, isAdmin)
  const flagged = (invoice.flags?.unapprovedTimesheets ?? 0) + (invoice.flags?.noShows ?? 0)

  return (
    <tr className='cursor-pointer hover:bg-actionHover' onClick={onOpen}>
      <td>
        <div className='flex items-center gap-2'>
          <Typography color='primary.main' className='font-medium whitespace-nowrap'>
            {invoice.invoiceNumber}
          </Typography>
          {flagged > 0 && invoice.status === 'DRAFT' && (
            <Tooltip title='Some work in this period was not billed: unapproved timesheets or no-shows. Open it for details.'>
              <i className='bx-error text-warning text-lg' />
            </Tooltip>
          )}
        </div>
      </td>
      <td className='whitespace-nowrap'>{invoice.client.legalName}</td>
      <td>
        <Chip
          size='small'
          variant='outlined'
          label={`${invoice.contract.contractNumber} v${invoice.contract.version}`}
        />
      </td>
      <td className='whitespace-nowrap'>{formatDay(invoice.issueDate)}</td>
      <td className='whitespace-nowrap'>
        <Typography color={isOverdue(invoice) ? 'error.main' : undefined} component='span'>
          {formatDay(invoice.dueDate)}
        </Typography>
        {isOverdue(invoice) && (
          <Typography variant='caption' color='error.main' className='block'>
            Overdue
          </Typography>
        )}
      </td>
      <td>
        <div className='flex flex-col items-start gap-1'>
          <InvoiceStatusChip status={invoice.status} />
          <SyncChip sync={invoice.sync} />
        </div>
      </td>
      <td className='whitespace-nowrap'>
        {formatDay(invoice.periodStart)} – {formatDay(invoice.periodEnd)}
      </td>
      <td className='text-end whitespace-nowrap'>{formatMoney(invoice.subtotal)}</td>
      <td className='text-end whitespace-nowrap'>{formatMoney(invoice.tax)}</td>
      <td className='text-end whitespace-nowrap font-medium'>{formatMoney(invoice.total)}</td>
      <td className='text-end whitespace-nowrap'>{invoice.status === 'VOID' ? '—' : formatMoney(invoice.balance)}</td>
      <td className='whitespace-nowrap'>{invoice.sentAt ? formatDay(isoDay(new Date(invoice.sentAt))) : '—'}</td>
      <td className={STICKY_END} onClick={event => event.stopPropagation()}>
        <div className='flex items-center justify-end'>
          <Tooltip title='Open'>
            <IconButton size='small' onClick={onOpen} aria-label={`Open ${invoice.invoiceNumber}`}>
              <i className='bx-show text-xl' />
            </IconButton>
          </Tooltip>
          {actions.retrySync && (
            <Tooltip title='Retry sync'>
              <span>
                <IconButton size='small' color='warning' disabled={busy} onClick={onRetrySync} aria-label='Retry sync'>
                  <i className='bx-refresh text-xl' />
                </IconButton>
              </span>
            </Tooltip>
          )}
          {actions.remove && (
            <Tooltip title='Delete draft'>
              <span>
                <IconButton
                  size='small'
                  color='error'
                  disabled={busy}
                  onClick={onDelete}
                  aria-label={`Delete ${invoice.invoiceNumber}`}
                >
                  <i className='bx-trash text-xl' />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </div>
      </td>
    </tr>
  )
}

export default InvoiceRow
