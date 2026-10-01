'use client'

// React Imports
import { useEffect, useState } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
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
import { useCorrectTimesheet, useResubmitTimesheet } from '@/libs/api/queries/timesheets'

import { formatMinutes } from '../logic/format'
import { buildCorrect, timesFormOf } from '../logic/times'
import type { TimesForm } from '../logic/times'
import { formatEntryDay } from '../shared'
import { timeRange } from '../../scheduling/logic/placeShifts'

type Props = { timesheet: Timesheet | null; onClose: () => void }

type Form = TimesForm & { note: string }

const blank: Form = { clockIn: '', clockOut: '', breakMinutes: '0', note: '' }

/**
 * Fixing a rejected entry: the supervisor's reason up top, my times in the site's timezone and a note back. Saving
 * makes it CORRECTED; it only goes back to the supervisor once resubmitted, so "Save and resubmit" does both.
 */
const CorrectDialog = ({ timesheet, onClose }: Props) => {
  const correct = useCorrectTimesheet()
  const resubmit = useResubmitTimesheet()
  const [form, setForm] = useState<Form>(blank)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (timesheet) {
      setForm({ ...timesFormOf(timesheet, timesheet.site.timezone), note: '' })
      setError(null)
    }
  }, [timesheet])

  const zone = timesheet?.site.timezone ?? 'UTC'
  const preview = timesheet ? buildCorrect(timesheet, form, zone) : null

  const onSave = async (andResubmit: boolean) => {
    if (!timesheet || !preview) return
    if (!preview.ok) return setError(preview.error)

    try {
      await correct.mutateAsync({ id: timesheet.id, input: preview.input })

      if (andResubmit) await resubmit.mutateAsync(timesheet.id)
      toast.success(andResubmit ? 'Corrected and sent back to your supervisor' : 'Saved — resubmit it when you are ready')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const set = (key: keyof Form) => (event: { target: { value: string } }) => setForm(current => ({ ...current, [key]: event.target.value }))
  const busy = correct.isPending || resubmit.isPending

  return (
    <Dialog open={Boolean(timesheet)} onClose={onClose} maxWidth='sm' fullWidth>
      {timesheet && (
        <>
          <DialogTitle className='flex flex-col gap-1'>
            <span>Correct your timesheet</span>
            <Typography variant='body2' color='text.secondary'>
              {timesheet.site.name} · {formatEntryDay(timesheet.shift.scheduledStart, zone)} · scheduled {timeRange({ ...timesheet.shift, site: timesheet.site })}
            </Typography>
          </DialogTitle>
          <DialogContent className='flex flex-col gap-4'>
            {timesheet.rejectionReason && (
              <Alert severity='error' icon={<i className='bx-message-error' />}>
                <strong>Your supervisor said:</strong> {timesheet.rejectionReason}
              </Alert>
            )}
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
              <CustomTextField type='datetime-local' label='Clocked in' value={form.clockIn} onChange={set('clockIn')} slotProps={{ inputLabel: { shrink: true } }} />
              <CustomTextField type='datetime-local' label='Clocked out' value={form.clockOut} onChange={set('clockOut')} slotProps={{ inputLabel: { shrink: true } }} />
              <CustomTextField
                type='number'
                label='Break (minutes)'
                value={form.breakMinutes}
                onChange={set('breakMinutes')}
                slotProps={{ htmlInput: { min: 0, max: 1440, step: 1, inputMode: 'numeric' } }}
              />
              <div className='flex flex-col justify-end'>
                <Typography variant='body2' color='text.secondary'>
                  Worked
                </Typography>
                <Typography variant='h6'>{preview?.ok ? formatMinutes(preview.actualMinutes) : '—'}</Typography>
              </div>
            </div>
            <Typography variant='body2' color='text.secondary'>
              Times are in site time ({zone}) and must be within 12 hours of the scheduled shift.
            </Typography>
            <CustomTextField multiline minRows={2} label='Note to your supervisor (optional)' value={form.note} onChange={set('note')} slotProps={{ htmlInput: { maxLength: 1000 } }} />
            {error && <Alert severity='error'>{error}</Alert>}
          </DialogContent>
          <DialogActions className='flex-wrap gap-2'>
            <Button variant='tonal' color='secondary' onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant='tonal' onClick={() => onSave(false)} disabled={busy}>
              Save only
            </Button>
            <Button variant='contained' onClick={() => onSave(true)} disabled={busy}>
              {busy ? 'Saving…' : 'Save and resubmit'}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  )
}

export default CorrectDialog
