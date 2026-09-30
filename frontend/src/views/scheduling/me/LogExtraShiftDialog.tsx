'use client'

// React Imports
import { useEffect } from 'react'

// MUI Imports
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Alert from '@mui/material/Alert'

// Third-party Imports
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'react-toastify'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { BffError } from '@/libs/api/bff'
import { useLogExtraShift, useMyPublishedSchedules } from '@/libs/api/queries/scheduling'

import { buildExtraShift } from './myShiftsLogic'
import { schedulingError } from '../logic/assignmentFlow'
import { todayKey } from '../logic/zoned'
import { formatPeriod } from '../shared'

type FormValues = { scheduleId: string; date: string; startTime: string; endTime: string; notes: string }

type Props = {
  open: boolean
  onClose: () => void

  /** siteId -> timezone, from the shifts already loaded; a Schedule does not carry its site's zone. */
  zones: Map<string, string>
}

const NOTES_MAX = 1000

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** Unplanned work on a published schedule at one of my sites. It lands as an assigned "Extra" shift for review. */
const LogExtraShiftDialog = ({ open, onClose, zones }: Props) => {
  const schedules = useMyPublishedSchedules(open)
  const logExtra = useLogExtraShift()

  const {
    control,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors }
  } = useForm<FormValues>({ defaultValues: { scheduleId: '', date: '', startTime: '', endTime: '', notes: '' } })

  useEffect(() => {
    if (open) reset({ scheduleId: '', date: todayKey(), startTime: '', endTime: '', notes: '' })
  }, [open, reset])

  const schedule = schedules.data?.find(item => item.id === watch('scheduleId'))
  const knownZone = schedule ? zones.get(schedule.siteId) : undefined
  const zone = knownZone ?? browserZone()

  const zoneHelper = !schedule
    ? undefined
    : knownZone
      ? `Times are in the site's time zone (${knownZone}).`
      : `This site's time zone is not known here, so times use your device's (${zone}).`

  const onSubmit = async (values: FormValues) => {
    if (!schedule) return

    const built = buildExtraShift({
      date: values.date,
      startTime: values.startTime,
      endTime: values.endTime,
      zone,
      period: { start: schedule.periodStart, end: schedule.periodEnd }
    })

    if (!built.ok) {
      setError(built.field, { message: built.message })

      return
    }

    try {
      await logExtra.mutateAsync({ scheduleId: schedule.id, start: built.start, end: built.end, notes: values.notes.trim() || undefined })
      toast.success('Extra shift logged. Your supervisor will review it.')
      onClose()
    } catch (error) {
      if (error instanceof BffError) {
        error.details?.issues?.forEach(issue => {
          if (issue.field === 'notes' || issue.field === 'scheduleId') setError(issue.field, { message: issue.message })
        })
      }

      toast.error(schedulingError(error).message)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>Log extra shift</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogContent className='grid gap-4 grid-cols-1 sm:grid-cols-3'>
          <Alert severity='info' className='sm:col-span-3'>
            Your supervisor will be notified and it will be reviewed.
          </Alert>
          <Controller
            name='scheduleId'
            control={control}
            rules={{ required: 'Choose a schedule.' }}
            render={({ field }) => (
              <CustomTextField
                {...field}
                select
                fullWidth
                label='Schedule'
                className='sm:col-span-3'
                disabled={schedules.isPending}
                error={!!errors.scheduleId || schedules.isError}
                helperText={
                  errors.scheduleId?.message ??
                  (schedules.isError
                    ? 'Could not load your schedules.'
                    : schedules.data?.length === 0
                      ? 'No published schedules at your sites.'
                      : undefined)
                }
              >
                {(schedules.data ?? []).map(item => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.site.name} · {formatPeriod(item.periodStart, item.periodEnd)}
                  </MenuItem>
                ))}
              </CustomTextField>
            )}
          />
          <Controller
            name='date'
            control={control}
            rules={{ required: 'Pick a date.' }}
            render={({ field }) => (
              <CustomTextField
                {...field}
                fullWidth
                type='date'
                label='Date'
                error={!!errors.date}
                helperText={errors.date?.message}
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: schedule ? { min: schedule.periodStart, max: schedule.periodEnd } : undefined
                }}
              />
            )}
          />
          <Controller
            name='startTime'
            control={control}
            rules={{ required: 'Start time is required.' }}
            render={({ field }) => (
              <CustomTextField
                {...field}
                fullWidth
                type='time'
                label='Start'
                error={!!errors.startTime}
                helperText={errors.startTime?.message}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            )}
          />
          <Controller
            name='endTime'
            control={control}
            rules={{ required: 'End time is required.' }}
            render={({ field }) => (
              <CustomTextField
                {...field}
                fullWidth
                type='time'
                label='End'
                error={!!errors.endTime}
                helperText={errors.endTime?.message ?? 'Earlier than start = next day'}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            )}
          />
          {zoneHelper && <Alert severity={knownZone ? 'success' : 'warning'} className='sm:col-span-3'>{zoneHelper}</Alert>}
          <Controller
            name='notes'
            control={control}
            rules={{ maxLength: { value: NOTES_MAX, message: `At most ${NOTES_MAX} characters.` } }}
            render={({ field }) => (
              <CustomTextField
                {...field}
                fullWidth
                multiline
                minRows={3}
                label='Notes (optional)'
                placeholder='What was the work?'
                className='sm:col-span-3'
                error={!!errors.notes}
                helperText={errors.notes?.message ?? `${field.value.length}/${NOTES_MAX}`}
                slotProps={{ htmlInput: { maxLength: NOTES_MAX } }}
              />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button variant='tonal' color='secondary' onClick={onClose}>
            Cancel
          </Button>
          <Button variant='contained' type='submit' disabled={logExtra.isPending}>
            {logExtra.isPending ? 'Logging…' : 'Log shift'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export default LogExtraShiftDialog
