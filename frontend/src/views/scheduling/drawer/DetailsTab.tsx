'use client'

// React Imports
import { useState } from 'react'
import type { ReactNode } from 'react'

// Next Imports
import Link from 'next/link'

// MUI Imports
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { Shift } from '@/types/scheduleTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { useCancelShift } from '@/libs/api/queries/scheduling'

import { ConfirmDialog } from '@views/contracts/detail/ActionDialogs'

import { toastSchedulingError } from '../notify'
import type { ShiftActions } from '../logic/lifecycle'
import EditShiftForm from './EditShiftForm'

type Props = {
  shift: Shift
  actions: ShiftActions
  onUnassign: () => void
  busy: boolean
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className='flex flex-col gap-0.5'>
    <Typography variant='caption' color='text.secondary'>
      {label}
    </Typography>
    <Typography component='div' color='text.primary'>
      {children}
    </Typography>
  </div>
)

const DetailsTab = ({ shift, actions, onUnassign, busy }: Props) => {
  const [editing, setEditing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const cancel = useCancelShift()

  const confirmCancel = async () => {
    try {
      await cancel.mutateAsync({ shiftId: shift.id, reason: reason.trim() })
      toast.success('Shift cancelled')
      setCancelling(false)
    } catch (error) {
      toastSchedulingError(error)
    }
  }

  if (editing) return <EditShiftForm shift={shift} onDone={() => setEditing(false)} />

  return (
    <>
      <div className='grid grid-cols-2 gap-4'>
        <Field label='Assigned to'>{shift.assignedUser?.name ?? <Typography color='error.main'>Unassigned</Typography>}</Field>
        <Field label='Schedule'>
          <Link href={`/schedules/${shift.scheduleId}`} className='text-primary'>
            Open schedule
          </Link>
        </Field>
        {shift.billableQty != null && <Field label='Billable quantity'>{shift.billableQty}</Field>}
        {shift.pendingOfferCount !== undefined && shift.pendingOfferCount > 0 && (
          <Field label='Pending offers'>{shift.pendingOfferCount}</Field>
        )}
        <Field label='Timezone'>{shift.site.timezone}</Field>
      </div>
      <Field label='Notes'>{shift.notes?.trim() ? <span className='whitespace-pre-wrap'>{shift.notes}</span> : '—'}</Field>
      {shift.cancelledReason && <Field label='Cancellation reason'>{shift.cancelledReason}</Field>}

      {actions.editable ? (
        <div className='flex flex-wrap gap-2'>
          <Button variant='tonal' startIcon={<i className='bx-edit' />} onClick={() => setEditing(true)}>
            Edit time & notes
          </Button>
          {actions.canUnassign && (
            <Button variant='tonal' color='secondary' disabled={busy} startIcon={<i className='bx-user-minus' />} onClick={onUnassign}>
              Unassign
            </Button>
          )}
          {actions.canCancel && (
            <Button
              variant='tonal'
              color='error'
              startIcon={<i className='bx-x-circle' />}
              onClick={() => {
                setReason('')
                setCancelling(true)
              }}
            >
              Cancel shift
            </Button>
          )}
        </div>
      ) : (
        <Typography variant='body2' color='text.secondary'>
          {shift.scheduleStatus === 'LOCKED' || shift.scheduleStatus === 'CLOSED'
            ? 'This schedule is locked, so the shift can no longer be changed.'
            : 'This shift has been worked or cancelled; changes happen in timesheets.'}
        </Typography>
      )}

      <ConfirmDialog
        open={cancelling}
        title='Cancel this shift?'
        confirmLabel='Cancel shift'
        color='error'
        busy={cancel.isPending || reason.trim().length === 0}
        onConfirm={() => void confirmCancel()}
        onClose={() => setCancelling(false)}
      >
        <span className='flex flex-col gap-3'>
          <span>The assignee (if any) is notified once the schedule is published. A reason is required.</span>
          <CustomTextField
            autoFocus
            fullWidth
            multiline
            minRows={2}
            label='Reason'
            value={reason}
            onChange={event => setReason(event.target.value.slice(0, 500))}
          />
        </span>
      </ConfirmDialog>
    </>
  )
}

export default DetailsTab
