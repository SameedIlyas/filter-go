'use client'

// React Imports
import { useEffect, useState } from 'react'

// MUI Imports
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { InvoiceSummary } from '@/types/invoiceTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useVoidInvoice } from '@/libs/api/queries/invoices'

const MAX_REASON = 500

type Props = { invoice: Pick<InvoiceSummary, 'id' | 'invoiceNumber' | 'status'> | null; onClose: () => void }

/** Cancel an invoice for good. Its timesheets go back to approved so a corrected run can bill them again. */
const VoidDialog = ({ invoice, onClose }: Props) => {
  const voidInvoice = useVoidInvoice()
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    setReason('')
    setTouched(false)
  }, [invoice?.id])

  const trimmed = reason.trim()
  const error = touched && !trimmed ? 'Say why, for the audit trail.' : null
  const live = invoice && invoice.status !== 'DRAFT'

  const submit = async () => {
    setTouched(true)

    if (!invoice || !trimmed) return

    try {
      await voidInvoice.mutateAsync({ id: invoice.id, reason: trimmed })
      toast.success(`${invoice.invoiceNumber} voided`)
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Dialog open={Boolean(invoice)} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>Void {invoice?.invoiceNumber}</DialogTitle>
      <DialogContent className='flex flex-col gap-4'>
        <Typography color='text.secondary'>
          This cannot be undone. The timesheets it billed become available to a new run.
          {live ? ' It is also voided in accounting, and its pay link stops working.' : ''}
        </Typography>
        <CustomTextField
          autoFocus
          fullWidth
          multiline
          minRows={3}
          label='Reason'
          placeholder='e.g. Billed at the old rate; re-running with the new contract version'
          value={reason}
          onChange={e => setReason(e.target.value.slice(0, MAX_REASON))}
          onBlur={() => setTouched(true)}
          error={Boolean(error)}
          helperText={error ?? `${reason.length}/${MAX_REASON}`}
        />
      </DialogContent>
      <DialogActions>
        <Button variant='tonal' color='secondary' onClick={onClose}>
          Cancel
        </Button>
        <Button variant='contained' color='error' onClick={() => void submit()} disabled={voidInvoice.isPending}>
          {voidInvoice.isPending ? 'Voiding…' : 'Void invoice'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default VoidDialog
