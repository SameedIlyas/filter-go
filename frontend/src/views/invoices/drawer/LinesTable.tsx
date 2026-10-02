'use client'

// MUI Imports
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { InvoiceDetail, InvoiceLine } from '@/types/invoiceTypes'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useRemoveInvoiceLine } from '@/libs/api/queries/invoices'

import { formatMoney } from '../shared'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

type Props = { invoice: InvoiceDetail; isAdmin: boolean; editable: boolean; onAddLine: () => void }

const SOURCE: Record<
  NonNullable<InvoiceLine['sourceType']>,
  { label: string; color: 'primary' | 'info' | 'secondary' | 'warning' }
> = {
  TIMESHEET: { label: 'Timesheet', color: 'primary' },
  SHIFT: { label: 'Visit', color: 'info' },
  CONTRACT_LINE: { label: 'Fixed fee', color: 'secondary' },
  MANUAL: { label: 'Manual', color: 'warning' }
}

/** "7.5000" → "7.5", "1.0000" → "1". */
const qtyText = (qty: string) => String(Number(qty))

const TotalRow = ({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) => (
  <div className='flex justify-between gap-6 plb-1'>
    <Typography className={strong ? 'font-medium' : undefined} color={strong ? 'text.primary' : 'text.secondary'}>
      {label}
    </Typography>
    <Typography className={strong ? 'font-medium' : undefined}>{formatMoney(value)}</Typography>
  </div>
)

/** Lines per site with a site subtotal, then the invoice totals. Drafts can drop lines and take manual ones. */
const LinesTable = ({ invoice, isAdmin, editable, onAddLine }: Props) => {
  const remove = useRemoveInvoiceLine(invoice.id)
  const lineCount = invoice.sites.reduce((count, group) => count + group.lines.length, 0)

  // Description, (source), qty, (unit price), total
  const columns = isAdmin ? 5 : 3

  const onRemove = async (line: InvoiceLine) => {
    try {
      await remove.mutateAsync(line.id)
      toast.success(
        line.sourceType === 'TIMESHEET' ? 'Line removed; its timesheet is back to approved' : 'Line removed'
      )
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex items-center justify-between gap-3'>
        <Typography variant='h6'>Line items ({lineCount})</Typography>
        {editable && (
          <Button size='small' variant='tonal' startIcon={<i className='bx-plus' />} onClick={onAddLine}>
            Line item
          </Button>
        )}
      </div>
      <div className='overflow-x-auto border rounded'>
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th>Description</th>
              {isAdmin && <th>Source</th>}
              <th className='text-end'>Qty</th>
              {isAdmin && <th className='text-end'>Unit price</th>}
              <th className='text-end'>Total</th>
              {editable && <th aria-label='Actions' />}
            </tr>
          </thead>
          <tbody>
            {lineCount === 0 && (
              <tr>
                <td colSpan={columns + (editable ? 1 : 0)} className='text-center plb-6'>
                  <Typography color='text.secondary'>No lines. Add one, or delete this draft.</Typography>
                </td>
              </tr>
            )}
            {invoice.sites.map(group => [
              <tr key={`site-${group.siteId ?? 'none'}`} className='bg-actionHover'>
                <td colSpan={columns - 1}>
                  <Typography className='font-medium'>{group.siteName ?? 'Other charges'}</Typography>
                </td>
                <td className='text-end'>
                  <Typography className='font-medium'>{formatMoney(group.subtotal)}</Typography>
                </td>
                {editable && <td />}
              </tr>,
              ...group.lines.map(line => (
                <tr key={line.id}>
                  <td>
                    <Typography>{line.description}</Typography>
                    {line.taxCode && (
                      <Typography variant='caption' color='text.secondary'>
                        Tax {line.taxCode}: {formatMoney(line.taxAmount)}
                      </Typography>
                    )}
                  </td>
                  {isAdmin && (
                    <td>
                      {line.sourceType && (
                        <Chip
                          size='small'
                          variant='tonal'
                          color={SOURCE[line.sourceType].color}
                          label={SOURCE[line.sourceType].label}
                        />
                      )}
                    </td>
                  )}
                  <td className='text-end'>{qtyText(line.qty)}</td>
                  {isAdmin && <td className='text-end whitespace-nowrap'>{formatMoney(line.unitRate)}</td>}
                  <td className='text-end whitespace-nowrap'>{formatMoney(line.amount)}</td>
                  {editable && (
                    <td className='text-end'>
                      <Tooltip title='Remove line'>
                        <span>
                          <IconButton
                            size='small'
                            color='error'
                            disabled={remove.isPending}
                            onClick={() => void onRemove(line)}
                            aria-label={`Remove ${line.description}`}
                          >
                            <i className='bx-trash text-lg' />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </td>
                  )}
                </tr>
              ))
            ])}
          </tbody>
        </table>
      </div>
      <div className='flex justify-end'>
        <div className='flex flex-col min-is-[260px]'>
          <TotalRow label='Line items' value={invoice.subtotal} />
          <TotalRow label='Taxes' value={invoice.tax} />
          <TotalRow label='Grand total' value={invoice.total} strong />
          {Number(invoice.amountPaid) > 0 && (
            <>
              <TotalRow label='Paid' value={invoice.amountPaid} />
              <TotalRow label='Balance due' value={invoice.balance} strong />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default LinesTable
