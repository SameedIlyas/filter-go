'use client'

// React Imports
import { useState } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { Timesheet, TimesheetDetail } from '@/types/timesheetTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useAdjustTimesheet } from '@/libs/api/queries/timesheets'

import { formatTimeIn } from '../../scheduling/logic/zoned'
import { formatMinutes } from '../logic/format'
import { buildAdjust, clockRange, timesFormOf, timesPatch } from '../logic/times'
import type { AdjustForm } from '../logic/times'
import { formatEntryDay } from '../shared'

type Props = {
  timesheet: Timesheet | TimesheetDetail | null
  onClose: () => void
  onDone?: () => void
}

const formOf = (entry: Timesheet | TimesheetDetail): AdjustForm => ({
  ...timesFormOf(entry, entry.site.timezone),
  billable: entry.billable,
  payable: entry.payable,
  reason: ''
})

/** Scheduled and logged times side by side, so the supervisor sees what they are correcting. */
const Reference = ({ entry }: { entry: Timesheet | TimesheetDetail }) => {
  const zone = entry.site.timezone

  return (
    <div className='grid grid-cols-2 gap-3 rounded border p-3'>
      <div>
        <Typography variant='caption' color='text.secondary'>
          Scheduled
        </Typography>
        <Typography color='text.primary'>
          {formatTimeIn(entry.shift.scheduledStart, zone)} – {formatTimeIn(entry.shift.scheduledEnd, zone)} (
          {formatMinutes(entry.scheduledMinutes)})
        </Typography>
      </div>
      <div>
        <Typography variant='caption' color='text.secondary'>
          Logged
        </Typography>
        <Typography color='text.primary'>
          {clockRange(entry, zone)} ({formatMinutes(entry.actualMinutes)})
        </Typography>
      </div>
    </div>
  )
}

type BodyProps = { timesheet: Timesheet | TimesheetDetail; onClose: () => void; onDone?: () => void }

/** The form, mounted per entry (keyed by id) so a refetch of the same entry never wipes what was typed. */
const AdjustBody = ({ timesheet, onClose, onDone }: BodyProps) => {
  const adjust = useAdjustTimesheet()
  const [form, setForm] = useState<AdjustForm>(() => formOf(timesheet))
  const [submitted, setSubmitted] = useState(false)

  const zone = timesheet.site.timezone
  const live = timesPatch(timesheet, form, zone)
  const result = buildAdjust(timesheet, form, zone)

  // Time errors show as you type; "nothing changed" and "reason missing" only after a save attempt
  const error = !result.ok && (submitted || !live.ok) ? result : null
  const fieldError = (field: keyof AdjustForm) => (error && error.field === field ? error.error : undefined)
  const set = (patch: Partial<AdjustForm>) => setForm(current => ({ ...current, ...patch }))

  const submit = async () => {
    setSubmitted(true)

    if (!result.ok) return

    try {
      await adjust.mutateAsync({ id: timesheet.id, input: result.input })
      toast.success('Timesheet adjusted; it still needs approval')
      onDone?.()
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <DialogTitle className='flex flex-col gap-1'>
        <span>Adjust {timesheet.user?.name ?? 'timesheet'}</span>
        <Typography color='text.secondary'>
          {timesheet.site.name} · {formatEntryDay(timesheet.shift.scheduledStart, zone)} · site time ({zone})
        </Typography>
      </DialogTitle>
      <DialogContent className='flex flex-col gap-4'>
        <Reference entry={timesheet} />
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
          <CustomTextField
            type='datetime-local'
            fullWidth
            label='Clock in'
            value={form.clockIn}
            onChange={e => set({ clockIn: e.target.value })}
            error={Boolean(fieldError('clockIn'))}
            helperText={fieldError('clockIn')}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <CustomTextField
            type='datetime-local'
            fullWidth
            label='Clock out'
            value={form.clockOut}
            onChange={e => set({ clockOut: e.target.value })}
            error={Boolean(fieldError('clockOut'))}
            helperText={fieldError('clockOut')}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </div>
        <CustomTextField
          type='number'
          label='Break (minutes)'
          value={form.breakMinutes}
          onChange={e => set({ breakMinutes: e.target.value })}
          error={Boolean(fieldError('breakMinutes'))}
          helperText={fieldError('breakMinutes')}
          className='max-is-[200px]'
          slotProps={{ htmlInput: { min: 0, max: 1440, step: 5 } }}
        />
        <div className='flex flex-wrap gap-4'>
          <FormControlLabel
            control={<Switch checked={form.billable} onChange={e => set({ billable: e.target.checked })} />}
            label='Billable'
          />
          <FormControlLabel
            control={<Switch checked={form.payable} onChange={e => set({ payable: e.target.checked })} />}
            label='Payable'
          />
        </div>
        <Typography variant='body2' color='text.secondary' className='-mbs-2'>
          A redo: not billable, still payable.
        </Typography>
        <CustomTextField
          fullWidth
          multiline
          minRows={2}
          label='Reason'
          placeholder='Why are you changing it?'
          value={form.reason}
          onChange={e => set({ reason: e.target.value.slice(0, 1000) })}
          error={Boolean(fieldError('reason'))}
          helperText={fieldError('reason')}
        />
        {error && error.field === null && <Alert severity='warning'>{error.error}</Alert>}
        <Typography color='text.primary'>
          Worked:{' '}
          <span className='font-medium'>{formatMinutes(live.ok ? live.actualMinutes : timesheet.actualMinutes)}</span>
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button variant='tonal' color='secondary' onClick={onClose}>
          Cancel
        </Button>
        <Button variant='contained' onClick={() => void submit()} disabled={adjust.isPending}>
          {adjust.isPending ? 'Saving…' : 'Save adjustment'}
        </Button>
      </DialogActions>
    </>
  )
}

/**
 * The supervisor's correction of an entry's times, break and billable/payable flags (UAT "edit approved time").
 * Times are entered in the site's timezone; the entry stays waiting for approval afterwards (ADJUSTED).
 */
const AdjustDialog = ({ timesheet, onClose, onDone }: Props) => (
  <Dialog open={Boolean(timesheet)} onClose={onClose} maxWidth='sm' fullWidth>
    {timesheet && <AdjustBody key={timesheet.id} timesheet={timesheet} onClose={onClose} onDone={onDone} />}
  </Dialog>
)

export default AdjustDialog
