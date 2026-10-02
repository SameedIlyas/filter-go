'use client'

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

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useDeleteInvoice } from '@/libs/api/queries/invoices'

type Props = {
  invoice: Pick<InvoiceSummary, 'id' | 'invoiceNumber'> | null
  onClose: () => void
  onDeleted?: () => void
}

/** Throw a draft away. Nothing left the building yet, so nothing is kept; its timesheets return to approved. */
const DeleteDialog = ({ invoice, onClose, onDeleted }: Props) => {
  const remove = useDeleteInvoice()

  const submit = async () => {
    if (!invoice) return

    try {
      await remove.mutateAsync(invoice.id)
      toast.success(`Draft ${invoice.invoiceNumber} deleted`)
      onClose()
      onDeleted?.()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <Dialog open={Boolean(invoice)} onClose={onClose} maxWidth='xs' fullWidth>
      <DialogTitle>Delete draft {invoice?.invoiceNumber}?</DialogTitle>
      <DialogContent>
        <Typography color='text.secondary'>
          The draft is removed and the timesheets it billed go back to approved, ready for the next run.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button variant='tonal' color='secondary' onClick={onClose}>
          Keep it
        </Button>
        <Button variant='contained' color='error' onClick={() => void submit()} disabled={remove.isPending}>
          {remove.isPending ? 'Deleting…' : 'Delete draft'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default DeleteDialog
