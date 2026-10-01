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
import type { Timesheet } from '@/types/timesheetTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useRejectTimesheet } from '@/libs/api/queries/timesheets'

const MAX_REASON = 1000

type Props = {
  timesheet: Pick<Timesheet, 'id' | 'user' | 'site'> | null
  onClose: () => void
  onDone?: () => void
}

/** Send an entry back to the worker with a reason; they are notified and can correct and resubmit it. */
const RejectDialog = ({ timesheet, onClose, onDone }: Props) => {
  const reject = useRejectTimesheet()
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    setReason('')
    setTouched(false)
  }, [timesheet?.id])

  const trimmed = reason.trim()
  const error = touched && !trimmed ? 'Say what needs fixing.' : null

  const submit = async () => {
    setTouched(true)

    if (!timesheet || !trimmed) return

    try {
      await reject.mutateAsync({ id: timesheet.id, reason: trimmed })
      toast.success('Timesheet sent back to the worker')
      onDone?.()
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Dialog open={Boolean(timesheet)} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>Reject timesheet</DialogTitle>
      <DialogContent className='flex flex-col gap-4'>
        <Typography color='text.secondary'>
          {timesheet?.user?.name ?? 'The worker'} at {timesheet?.site.name} will be notified with your reason, and can
          correct the times and resubmit.
        </Typography>
        <CustomTextField
          autoFocus
          fullWidth
          multiline
          minRows={3}
          label='Reason'
          placeholder='e.g. The break is missing; you left at 14:00, not 16:00'
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
        <Button variant='contained' color='error' onClick={() => void submit()} disabled={reject.isPending}>
          {reject.isPending ? 'Rejecting…' : 'Reject'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default RejectDialog
