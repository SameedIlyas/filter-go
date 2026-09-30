'use client'

// React Imports
import { useEffect, useState } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { AssignmentWarning, Schedule } from '@/types/scheduleTypes'
import type { User } from '@/types/userTypes'

// Component Imports
import CustomAutocomplete from '@core/components/mui/Autocomplete'
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { useAddShift, useScheduleQuery, useSchedulesQuery, useStaffOptions } from '@/libs/api/queries/scheduling'

import { toastSchedulingError } from '../notify'
import { assignOutcome } from '../logic/assignmentFlow'
import { shiftTimes } from '../logic/shiftTimes'
import { formatPeriod } from '../shared'
import WarningsConfirmDialog from './WarningsConfirmDialog'

type Props = {
  open: boolean

  /** Fixed when opened from a schedule's page; otherwise the user picks one. */
  scheduleId?: string

  /** A day to start from (the board's current day), used when it falls inside the schedule's period. */
  defaultDate?: string
  onClose: () => void
}

const scheduleLabel = (schedule: Schedule) => `${schedule.contractNumber} · ${schedule.site.name} · ${formatPeriod(schedule.periodStart, schedule.periodEnd)}`

/**
 * `POST /schedules/:id/shifts`: a one-off shift (ad-hoc visits, cover, extras). Times are entered in the SITE's
 * timezone. With an assignee, warnings come back as 422 ASSIGNMENT_WARNINGS and are confirmed like on the board.
 */
const AddShiftDialog = ({ open, scheduleId, defaultDate, onClose }: Props) => {
  const [pickedId, setPickedId] = useState<string | null>(scheduleId ?? null)
  const [date, setDate] = useState('')
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('17:00')
  const [notes, setNotes] = useState('')
  const [isExtra, setIsExtra] = useState(false)
  const [assignee, setAssignee] = useState<User | null>(null)
  const [warnings, setWarnings] = useState<AssignmentWarning[] | null>(null)

  // The picker is only needed when no schedule is fixed; the 100 most recent of each are plenty to choose from
  const drafts = useSchedulesQuery({ status: 'DRAFT', limit: 100 }, !scheduleId)
  const published = useSchedulesQuery({ status: 'PUBLISHED', limit: 100 }, !scheduleId)
  const choices = [...(drafts.data?.schedules ?? []), ...(published.data?.schedules ?? [])]
  const schedule = useScheduleQuery(pickedId ?? undefined)
  const staff = useStaffOptions(open)
  const add = useAddShift(pickedId ?? '')

  const zone = schedule.data?.termsSnapshot?.siteTimezone
  const period = schedule.data ? { start: schedule.data.periodStart, end: schedule.data.periodEnd } : null

  useEffect(() => {
    if (!open) return

    setPickedId(scheduleId ?? null)
    setStart('09:00')
    setEnd('17:00')
    setNotes('')
    setIsExtra(false)
    setAssignee(null)
    setWarnings(null)
  }, [open, scheduleId])

  // Start on the board's day when it is inside the period, else on the first day
  useEffect(() => {
    if (!period) return

    setDate(defaultDate && defaultDate >= period.start && defaultDate <= period.end ? defaultDate : period.start)
  }, [period?.start, period?.end, defaultDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const times = zone ? shiftTimes(date, start, end, zone) : null
  const outsidePeriod = Boolean(period && date && (date < period.start || date > period.end))
  const ready = Boolean(pickedId && times?.ok && !outsidePeriod)

  const submit = async (override?: { reason?: string }) => {
    if (!times?.ok || !pickedId) return

    try {
      await add.mutateAsync({
        start: times.start,
        end: times.end,
        notes: notes.trim() || undefined,
        isExtra: isExtra || undefined,
        assignedUserId: assignee?.id,
        ...(override ? { overrideWarnings: true, reason: override.reason } : {})
      })
      toast.success(assignee ? `Shift added and assigned to ${assignee.name}` : 'Shift added')
      setWarnings(null)
      onClose()
    } catch (error) {
      const outcome = assignOutcome(error)

      if (outcome.kind === 'warnings' && !override) setWarnings(outcome.warnings)
      else toastSchedulingError(error)
    }
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
        <DialogTitle>Add shift</DialogTitle>
        <DialogContent className='flex flex-col gap-4 pbs-2'>
          {!scheduleId && (
            <CustomAutocomplete
              options={choices}
              loading={drafts.isLoading || published.isLoading}
              value={choices.find(choice => choice.id === pickedId) ?? null}
              onChange={(_event, picked) => setPickedId(picked?.id ?? null)}
              getOptionLabel={scheduleLabel}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              renderInput={params => <CustomTextField {...params} label='Schedule' placeholder='Draft or published schedule' helperText='Locked and closed schedules cannot take new shifts.' />}
            />
          )}
          {pickedId && (
            <>
              <CustomTextField
                type='date'
                label='Date'
                value={date}
                onChange={event => setDate(event.target.value)}
                inputProps={period ? { min: period.start, max: period.end } : undefined}
                error={outsidePeriod}
                helperText={outsidePeriod ? 'Pick a day inside the schedule period.' : undefined}
              />
              <div className='grid grid-cols-2 gap-4'>
                <CustomTextField type='time' label='Start' value={start} onChange={event => setStart(event.target.value)} />
                <CustomTextField type='time' label='End' value={end} onChange={event => setEnd(event.target.value)} />
              </div>
              {times && !times.ok && <Alert severity='error'>{times.error}</Alert>}
              {times?.ok && times.overnight && <Alert severity='info'>Ends the next day ({times.hours}h).</Alert>}
              <CustomAutocomplete
                options={staff.data ?? []}
                value={assignee}
                onChange={(_event, user) => setAssignee(user)}
                getOptionLabel={user => user.name}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderInput={params => <CustomTextField {...params} label='Assign to (optional)' placeholder='Leave open' />}
              />
              <CustomTextField
                label='Notes'
                multiline
                minRows={2}
                value={notes}
                onChange={event => setNotes(event.target.value.slice(0, 1000))}
                helperText={zone ? `Times are in the site's timezone (${zone}).` : 'Loading the site timezone…'}
              />
              <FormControlLabel
                control={<Checkbox checked={isExtra} onChange={event => setIsExtra(event.target.checked)} />}
                label="Mark as extra work (outside the contract's regular coverage)"
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant='tonal' color='secondary' onClick={onClose}>
            Cancel
          </Button>
          <Button variant='contained' disabled={!ready || add.isPending} onClick={() => void submit()}>
            {add.isPending ? 'Adding…' : 'Add shift'}
          </Button>
        </DialogActions>
      </Dialog>
      <WarningsConfirmDialog
        open={warnings !== null}
        userName={assignee?.name ?? ''}
        warnings={warnings ?? []}
        busy={add.isPending}
        onConfirm={reason => void submit({ reason })}
        onClose={() => setWarnings(null)}
      />
    </>
  )
}

export default AddShiftDialog
