'use client'

// React Imports
import { useEffect, useState } from 'react'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Switch from '@mui/material/Switch'
import Skeleton from '@mui/material/Skeleton'
import Alert from '@mui/material/Alert'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { AvailabilityWindow } from '@/types/userTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useSaveAvailability, useUserAvailability } from '@/libs/api/queries/users'

import { WEEKDAYS } from '../shared'
import { sortWindows, windowProblems } from './availability'

const DEFAULT_WINDOW = { startTime: '09:00', endTime: '17:00' }

type Props = { userId: string; canEdit: boolean }

const AvailabilityTab = ({ userId, canEdit }: Props) => {
  const availability = useUserAvailability(userId)
  const save = useSaveAvailability(userId)
  const [draft, setDraft] = useState<AvailabilityWindow[]>([])
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (availability.data && !editing) setDraft(sortWindows(availability.data.windows))
  }, [availability.data, editing])

  if (availability.isPending) return <Skeleton variant='rounded' height={420} />

  if (availability.isError) {
    return (
      <Alert
        severity='error'
        action={
          <Button color='inherit' size='small' onClick={() => availability.refetch()}>
            Retry
          </Button>
        }
      >
        {errorMessage(availability.error)}
      </Alert>
    )
  }

  const problems = windowProblems(draft)
  const hasProblems = Object.keys(problems).length > 0

  const update = (index: number, patch: Partial<AvailabilityWindow>) =>
    setDraft(current => current.map((w, i) => (i === index ? { ...w, ...patch } : w)))

  const remove = (index: number) => setDraft(current => current.filter((_, i) => i !== index))

  const add = (weekday: number) => {
    const last = draft.filter(w => w.weekday === weekday).at(-1)
    const next = last && last.endTime < '22:00' ? { startTime: last.endTime, endTime: '23:59' } : DEFAULT_WINDOW

    setDraft(current => sortWindows([...current, { weekday, ...next }]))
  }

  const toggleDay = (weekday: number, on: boolean) =>
    setDraft(current =>
      on ? sortWindows([...current, { weekday, ...DEFAULT_WINDOW }]) : current.filter(w => w.weekday !== weekday)
    )

  const onSave = async () => {
    try {
      await save.mutateAsync(draft)
      toast.success('Availability saved')
      setEditing(false)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const onCancel = () => {
    setEditing(false)
    setDraft(sortWindows(availability.data.windows))
  }

  return (
    <Card>
      <CardHeader
        title='Weekly availability'
        subheader={`When they can be scheduled. Times are in ${availability.data.timezone}.`}
        action={
          canEdit && !editing ? (
            <Button variant='tonal' startIcon={<i className='bx-edit' />} onClick={() => setEditing(true)}>
              Edit
            </Button>
          ) : null
        }
      />
      <CardContent className='flex flex-col'>
        {WEEKDAYS.map((label, i) => {
          const weekday = i + 1

          const slots = draft
            .map((window, index) => ({ window, index }))
            .filter(({ window }) => window.weekday === weekday)

          return (
            <div key={label} className='flex flex-wrap items-start gap-4 plb-3 border-be last:border-be-0'>
              <div className='flex items-center gap-2 is-[170px]'>
                {editing && (
                  <Switch size='small' checked={slots.length > 0} onChange={e => toggleDay(weekday, e.target.checked)} />
                )}
                <Typography className='font-medium'>{label}</Typography>
              </div>
              <div className='flex flex-col gap-2 flex-1 min-is-[240px]'>
                {slots.length === 0 && <Typography color='text.disabled'>Unavailable</Typography>}
                {slots.map(({ window, index }) =>
                  editing ? (
                    <div key={index} className='flex flex-col gap-1'>
                      <div className='flex items-center gap-2'>
                        <CustomTextField
                          type='time'
                          size='small'
                          value={window.startTime}
                          onChange={e => update(index, { startTime: e.target.value })}
                          error={!!problems[index]}
                          slotProps={{ htmlInput: { 'aria-label': `${label} start` } }}
                        />
                        <Typography color='text.secondary'>to</Typography>
                        <CustomTextField
                          type='time'
                          size='small'
                          value={window.endTime}
                          onChange={e => update(index, { endTime: e.target.value })}
                          error={!!problems[index]}
                          slotProps={{ htmlInput: { 'aria-label': `${label} end` } }}
                        />
                        <IconButton size='small' onClick={() => remove(index)} aria-label='Remove time'>
                          <i className='bx-trash text-textSecondary' />
                        </IconButton>
                      </div>
                      {problems[index] && (
                        <Typography variant='body2' color='error'>
                          {problems[index]}
                        </Typography>
                      )}
                    </div>
                  ) : (
                    <Typography key={index}>
                      {window.startTime} – {window.endTime}
                    </Typography>
                  )
                )}
              </div>
              {editing && slots.length > 0 && (
                <Button size='small' startIcon={<i className='bx-plus' />} onClick={() => add(weekday)}>
                  Add time
                </Button>
              )}
            </div>
          )
        })}
        {editing && (
          <div className='flex justify-end gap-3 pbs-4'>
            <Button variant='tonal' color='secondary' onClick={onCancel}>
              Cancel
            </Button>
            <Button variant='contained' onClick={onSave} disabled={save.isPending || hasProblems}>
              {save.isPending ? 'Saving…' : 'Save availability'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default AvailabilityTab
