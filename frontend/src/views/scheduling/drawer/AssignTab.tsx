'use client'

// React Imports
import { useEffect, useState } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'

// Type Imports
import type { Shift } from '@/types/scheduleTypes'
import type { User } from '@/types/userTypes'

// Component Imports
import CustomAutocomplete from '@core/components/mui/Autocomplete'
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { useStaffOptions, useValidateAssignment } from '@/libs/api/queries/scheduling'

import type { useAssignFlow } from '../board/useAssignFlow'
import { classifyValidation, schedulingError } from '../logic/assignmentFlow'
import { BlockingList, WarningList } from './WarningList'

type Props = {
  shift: Shift
  assignFlow: ReturnType<typeof useAssignFlow>
  onDone: () => void
}

/**
 * Pick a person and see straight away what the server thinks (the dry run: nothing is saved). Blocking issues
 * disable the button; warnings are shown and confirmed once more on Assign, where the override is audited.
 */
const AssignTab = ({ shift, assignFlow, onDone }: Props) => {
  const staff = useStaffOptions()
  const validate = useValidateAssignment()
  const [picked, setPicked] = useState<User | null>(null)

  const { reset } = validate

  useEffect(() => {
    setPicked(null)
    reset()
  }, [shift.id, reset])

  // Assigned (possibly after confirming warnings in the board's dialog): back to the details
  useEffect(() => {
    if (picked && shift.assignedUser?.id === picked.id) onDone()
  }, [shift.assignedUser?.id, picked, onDone])

  const pick = (user: User | null) => {
    setPicked(user)
    if (user) validate.mutate({ shiftId: shift.id, userId: user.id })
    else validate.reset()
  }

  // Ignore a late answer for someone who is no longer picked
  const current = validate.variables?.userId === picked?.id ? validate : null
  const result = current?.data ? classifyValidation(current.data) : null
  const options = (staff.data ?? []).filter(user => user.id !== shift.assignedUser?.id)

  const assign = async () => {
    if (!picked) return
    await assignFlow.assign({ shiftId: shift.id, userId: picked.id, userName: picked.name })
  }

  return (
    <div className='flex flex-col gap-4'>
      {shift.assignedUser && (
        <Typography color='text.secondary'>
          Currently assigned to <strong>{shift.assignedUser.name}</strong>. Picking someone else reassigns the shift.
        </Typography>
      )}
      <CustomAutocomplete
        options={options}
        loading={staff.isLoading}
        value={picked}
        onChange={(_event, user) => pick(user)}
        getOptionLabel={user => user.name}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        renderOption={(props, user) => (
          <li {...props} key={user.id}>
            <div className='flex flex-col'>
              <span>{user.name}</span>
              <Typography variant='caption' color='text.secondary'>
                {user.role === 'SUPERVISOR' ? 'Supervisor' : 'Field staff'} · {user.email}
              </Typography>
            </div>
          </li>
        )}
        renderInput={params => <CustomTextField {...params} autoFocus label='Assign to' placeholder='Search staff' />}
      />

      {current?.isPending && (
        <div className='flex items-center gap-2'>
          <CircularProgress size={18} />
          <Typography color='text.secondary'>Checking availability, access, documents and hours…</Typography>
        </div>
      )}
      {current?.isError && <Alert severity='error'>{schedulingError(current.error).message}</Alert>}
      {result?.kind === 'blocked' && <BlockingList issues={result.issues} />}
      {result?.kind === 'warn' && (
        <>
          <WarningList warnings={result.warnings} />
          <Typography variant='body2' color='text.secondary'>
            You can still assign them; you will be asked to confirm.
          </Typography>
        </>
      )}
      {result?.kind === 'clear' && <Alert severity='success'>No problems found.</Alert>}

      <div>
        <Button
          variant='contained'
          disabled={!picked || !result || result.kind === 'blocked' || assignFlow.busy}
          onClick={() => void assign()}
        >
          {assignFlow.busy ? 'Assigning…' : result?.kind === 'warn' ? 'Assign anyway…' : 'Assign'}
        </Button>
      </div>
    </div>
  )
}

export default AssignTab
