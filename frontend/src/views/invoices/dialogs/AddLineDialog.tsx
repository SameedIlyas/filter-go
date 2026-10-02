'use client'

// React Imports
import { useEffect, useState } from 'react'

// MUI Imports
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { InvoiceDetail } from '@/types/invoiceTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { BffError, errorMessage } from '@/libs/api/bff'
import { useClientSites, useTaxRatesQuery } from '@/libs/api/queries/contracts'
import { useAddInvoiceLine } from '@/libs/api/queries/invoices'

import { lineAmount, lineErrors } from '../logic/money'
import type { LineDraft } from '../logic/money'
import { formatMoney } from '../shared'

type Props = { invoice: InvoiceDetail | null; onClose: () => void }

const EMPTY: LineDraft & { siteId: string; taxCode: string } = {
  description: '',
  qty: '1',
  unitRate: '',
  siteId: '',
  taxCode: ''
}

/** A manual charge on a draft (call-out fee, equipment, a correction). Tax is worked out by the server from the code. */
const AddLineDialog = ({ invoice, onClose }: Props) => {
  const add = useAddInvoiceLine(invoice?.id ?? '')
  const sites = useClientSites(invoice?.client.id)
  const taxRates = useTaxRatesQuery(Boolean(invoice))
  const [line, setLine] = useState(EMPTY)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    setLine(EMPTY)
    setTouched(false)
  }, [invoice?.id])

  const errors = touched ? lineErrors(line) : {}
  const amount = lineAmount(line.qty, line.unitRate)
  const set = (patch: Partial<typeof line>) => setLine(current => ({ ...current, ...patch }))

  const submit = async () => {
    setTouched(true)

    if (!invoice || Object.keys(lineErrors(line)).length > 0) return

    try {
      await add.mutateAsync({
        description: line.description.trim(),
        qty: line.qty.trim(),
        unitRate: line.unitRate.trim(),
        ...(line.siteId ? { siteId: line.siteId } : {}),
        ...(line.taxCode ? { taxCode: line.taxCode } : {})
      })
      toast.success('Line added')
      onClose()
    } catch (error) {
      toast.error(
        error instanceof BffError && error.fieldMessage('siteId')
          ? 'That site does not belong to this client.'
          : errorMessage(error)
      )
    }
  }

  return (
    <Dialog open={Boolean(invoice)} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>Add a line</DialogTitle>
      <DialogContent className='flex flex-col gap-4'>
        <CustomTextField
          autoFocus
          fullWidth
          label='Description'
          placeholder='e.g. Call-out fee, 3 Sep'
          value={line.description}
          onChange={e => set({ description: e.target.value.slice(0, 500) })}
          error={Boolean(errors.description)}
          helperText={errors.description ?? ' '}
        />
        <div className='flex flex-wrap gap-4'>
          <CustomTextField
            label='Quantity'
            className='flex-1 min-is-[120px]'
            value={line.qty}
            onChange={e => set({ qty: e.target.value })}
            error={Boolean(errors.qty)}
            helperText={errors.qty ?? ' '}
            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
          />
          <CustomTextField
            label='Unit price ($)'
            className='flex-1 min-is-[120px]'
            value={line.unitRate}
            onChange={e => set({ unitRate: e.target.value })}
            error={Boolean(errors.unitRate)}
            helperText={errors.unitRate ?? ' '}
            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
          />
        </div>
        <div className='flex flex-wrap gap-4'>
          <CustomTextField
            select
            label='Site'
            className='flex-1 min-is-[160px]'
            value={line.siteId}
            onChange={e => set({ siteId: e.target.value })}
            slotProps={{ select: { displayEmpty: true } }}
          >
            <MenuItem value=''>No site</MenuItem>
            {(sites.data ?? []).map(site => (
              <MenuItem key={site.id} value={site.id}>
                {site.name}
              </MenuItem>
            ))}
          </CustomTextField>
          <CustomTextField
            select
            label='Tax'
            className='flex-1 min-is-[160px]'
            value={line.taxCode}
            onChange={e => set({ taxCode: e.target.value })}
            slotProps={{ select: { displayEmpty: true } }}
          >
            <MenuItem value=''>No tax</MenuItem>
            {(taxRates.data ?? []).map(rate => (
              <MenuItem key={rate.code} value={rate.code}>
                {rate.code} ({Number(rate.ratePercent)}%)
              </MenuItem>
            ))}
          </CustomTextField>
        </div>
        <Typography color='text.secondary'>
          Line total: <span className='font-medium text-textPrimary'>{amount ? formatMoney(amount) : '—'}</span>
          {line.taxCode ? ' before tax' : ''}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button variant='tonal' color='secondary' onClick={onClose}>
          Cancel
        </Button>
        <Button variant='contained' onClick={() => void submit()} disabled={add.isPending}>
          {add.isPending ? 'Adding…' : 'Add line'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default AddLineDialog
