'use client'

// MUI Imports
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { Shift } from '@/types/scheduleTypes'

// Lib Imports
import { useConfirmShift } from '@/libs/api/queries/scheduling'

import { schedulingError } from '../logic/assignmentFlow'
import { shiftActions } from '../logic/lifecycle'
import { timeRange } from '../logic/placeShifts'
import { ShiftStatusChip, formatShiftDay } from '../shared'

type Props = { shift: Shift | null; onClose: () => void }

/** One of my shifts, opened from the calendar: when and where, notes, and "Confirm" while it is only assigned. */
const ShiftDialog = ({ shift, onClose }: Props) => {
  const confirm = useConfirmShift()

  const onConfirm = async () => {
    if (!shift) return

    try {
      await confirm.mutateAsync(shift.id)
      toast.success('Shift confirmed')
      onClose()
    } catch (error) {
      toast.error(schedulingError(error).message)
    }
  }

  return (
    <Dialog open={Boolean(shift)} onClose={onClose} maxWidth='xs' fullWidth>
      {shift && (
        <>
          <DialogTitle className='flex items-center justify-between gap-2'>
            <span>{shift.site.name}</span>
            <ShiftStatusChip status={shift.status} />
          </DialogTitle>
          <DialogContent className='flex flex-col gap-3'>
            <div className='flex items-center gap-2'>
              <i className='bx-calendar text-xl text-textSecondary' />
              <Typography>
                {formatShiftDay(shift.scheduledStart, shift.site.timezone)} · {timeRange(shift)}
              </Typography>
            </div>
            <Typography variant='body2' color='text.secondary'>
              Site time ({shift.site.timezone})
            </Typography>
            {shift.isExtra && <Chip size='small' variant='tonal' color='warning' label='Extra shift' className='self-start' />}
            {shift.notes && (
              <div className='flex items-start gap-2'>
                <i className='bx-note text-xl text-textSecondary' />
                <Typography className='whitespace-pre-line'>{shift.notes}</Typography>
              </div>
            )}
            {shift.status === 'CANCELLED' && shift.cancelledReason && (
              <Typography color='error.main'>Cancelled: {shift.cancelledReason}</Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button variant='tonal' color='secondary' onClick={onClose}>
              Close
            </Button>
            {shiftActions(shift).canConfirm && (
              <Button variant='contained' onClick={onConfirm} disabled={confirm.isPending}>
                {confirm.isPending ? 'Confirming…' : 'Confirm'}
              </Button>
            )}
          </DialogActions>
        </>
      )}
    </Dialog>
  )
}

export default ShiftDialog
