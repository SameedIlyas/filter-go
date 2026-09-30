'use client'

// React Imports
import { useState } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { Shift } from '@/types/scheduleTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { useUpdateShift } from '@/libs/api/queries/scheduling'

import { toastSchedulingError } from '../notify'
import { shiftTimes } from '../logic/shiftTimes'
import { dayKeyIn, formatTimeIn } from '../logic/zoned'

/** Change a shift's date, times (in the SITE's timezone) and notes: `PATCH /shifts/:id`. */
const EditShiftForm = ({ shift, onDone }: { shift: Shift; onDone: () => void }) => {
  const zone = shift.site.timezone
  const [date, setDate] = useState(dayKeyIn(shift.scheduledStart, zone))
  const [start, setStart] = useState(formatTimeIn(shift.scheduledStart, zone))
  const [end, setEnd] = useState(formatTimeIn(shift.scheduledEnd, zone))
  const [notes, setNotes] = useState(shift.notes ?? '')
  const update = useUpdateShift(shift.id)

  const times = shiftTimes(date, start, end, zone)

  const save = async () => {
    if (!times.ok) return

    try {
      await update.mutateAsync({ start: times.start, end: times.end, notes: notes.trim() || null })
      toast.success('Shift updated')
      onDone()
    } catch (error) {
      toastSchedulingError(error)
    }
  }

  return (
    <div className='flex flex-col gap-4'>
      <CustomTextField type='date' label='Date' value={date} onChange={event => setDate(event.target.value)} fullWidth />
      <div className='grid grid-cols-2 gap-4'>
        <CustomTextField type='time' label='Start' value={start} onChange={event => setStart(event.target.value)} />
        <CustomTextField type='time' label='End' value={end} onChange={event => setEnd(event.target.value)} />
      </div>
      {times.ok ? (
        times.overnight && <Alert severity='info'>Ends the next day ({times.hours}h).</Alert>
      ) : (
        <Alert severity='error'>{times.error}</Alert>
      )}
      <CustomTextField
        label='Notes'
        multiline
        minRows={3}
        value={notes}
        onChange={event => setNotes(event.target.value.slice(0, 1000))}
        helperText={`Times are in the site's timezone (${zone}). ${notes.length}/1000`}
      />
      <div className='flex gap-2'>
        <Button variant='contained' disabled={!times.ok || update.isPending} onClick={() => void save()}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button variant='tonal' color='secondary' onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export default EditShiftForm
