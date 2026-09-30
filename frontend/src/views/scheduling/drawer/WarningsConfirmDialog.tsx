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

// Type Imports
import type { AssignmentWarning } from '@/types/scheduleTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

import { WarningList } from './WarningList'

type Props = {
  open: boolean
  userName: string
  warnings: AssignmentWarning[]
  busy: boolean
  onConfirm: (reason: string | undefined) => void
  onClose: () => void
}

/** "Assign anyway?" after 422 ASSIGNMENT_WARNINGS. The override and its reason are audited by the server. */
const WarningsConfirmDialog = ({ open, userName, warnings, busy, onConfirm, onClose }: Props) => {
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open) setReason('')
  }, [open])

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>Assign {userName} anyway?</DialogTitle>
      <DialogContent className='flex flex-col gap-4'>
        <Typography color='text.secondary'>
          This assignment has {warnings.length === 1 ? 'a warning' : `${warnings.length} warnings`}. You can still go
          ahead; the override and your reason are recorded.
        </Typography>
        <WarningList warnings={warnings} />
        <CustomTextField
          fullWidth
          multiline
          minRows={2}
          label='Reason (optional)'
          placeholder='e.g. Covering for sick leave, access being arranged'
          value={reason}
          onChange={event => setReason(event.target.value.slice(0, 500))}
          helperText={`${reason.length}/500`}
        />
      </DialogContent>
      <DialogActions>
        <Button variant='tonal' color='secondary' onClick={onClose}>
          Cancel
        </Button>
        <Button variant='contained' color='warning' disabled={busy} onClick={() => onConfirm(reason.trim() || undefined)}>
          {busy ? 'Assigning…' : 'Assign anyway'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default WarningsConfirmDialog
