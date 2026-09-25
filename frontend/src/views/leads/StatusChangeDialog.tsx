'use client'

// React Imports
import { useEffect, useState } from 'react'

// MUI Imports
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { Lead, LeadStatus } from '@/types/leadTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useChangeLeadStatus } from '@/libs/api/queries/leads'

import { STATUS_META } from './shared'

type Props = {
  lead: Lead | null
  target: LeadStatus | null
  onClose: () => void
}

/** Confirms a status move. Asking for a reason is mandatory when marking a lead as lost. */
const StatusChangeDialog = ({ lead, target, onClose }: Props) => {
  const [reason, setReason] = useState('')
  const changeStatus = useChangeLeadStatus()
  const isLost = target === 'LOST'

  useEffect(() => {
    if (target) setReason('')
  }, [target])

  const submit = async () => {
    if (!lead || !target) return

    try {
      await changeStatus.mutateAsync({ id: lead.id, status: target, lostReason: isLost ? reason.trim() : undefined })
      toast.success(`${lead.companyName} moved to ${STATUS_META[target].label}`)
      onClose()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <Dialog open={!!lead && !!target} onClose={onClose} maxWidth='xs' fullWidth>
      <DialogTitle>{isLost ? 'Mark lead as lost' : `Move to ${target ? STATUS_META[target].label : ''}`}</DialogTitle>
      <DialogContent className='flex flex-col gap-4'>
        <Typography color='text.secondary'>
          {lead?.companyName} is currently <b>{lead ? STATUS_META[lead.status].label : ''}</b>.
          {target === 'NEW' && ' Reopening puts it back at the start of the pipeline.'}
        </Typography>
        {isLost && (
          <CustomTextField
            autoFocus
            fullWidth
            multiline
            minRows={3}
            label='Reason'
            placeholder='e.g. Went with a competitor, budget, no response…'
            value={reason}
            onChange={e => setReason(e.target.value)}
            required
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button variant='tonal' color='secondary' onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant='contained'
          color={isLost ? 'error' : 'primary'}
          onClick={submit}
          disabled={changeStatus.isPending || (isLost && !reason.trim())}
        >
          {changeStatus.isPending ? 'Saving…' : 'Confirm'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default StatusChangeDialog
