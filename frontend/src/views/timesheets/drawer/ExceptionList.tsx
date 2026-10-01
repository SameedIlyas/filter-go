'use client'

// React Imports
import { useState } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { TimesheetException } from '@/types/timesheetTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useResolveException } from '@/libs/api/queries/timesheets'

import { describeException } from '../logic/format'
import { ExceptionChip, formatStamp } from '../shared'


/** "Resolve" with an optional note, inline under the exception. */
const ResolveForm = ({ exceptionId, onCancel }: { exceptionId: string; onCancel: () => void }) => {
  const resolve = useResolveException()
  const [note, setNote] = useState('')

  const submit = async () => {
    try {
      await resolve.mutateAsync({ id: exceptionId, note: note.trim() || undefined })
      toast.success('Exception resolved')
      onCancel()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <div className='flex flex-col gap-2'>
      <CustomTextField
        size='small'
        fullWidth
        placeholder='Note (optional), e.g. Called the client, the guard was at the back gate'
        value={note}
        onChange={e => setNote(e.target.value.slice(0, 1000))}
      />
      <div className='flex gap-2'>
        <Button size='small' variant='contained' onClick={() => void submit()} disabled={resolve.isPending}>
          {resolve.isPending ? 'Resolving…' : 'Resolve'}
        </Button>
        <Button size='small' variant='text' color='secondary' onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

/** The entry's exceptions, open ones first. Resolving one clears it without approving the entry. */
const ExceptionList = ({ exceptions, canResolve, zone }: { exceptions: TimesheetException[]; canResolve: boolean; zone: string }) => {
  const [resolving, setResolving] = useState<string | null>(null)
  const sorted = [...exceptions].sort((a, b) => Number(a.resolved) - Number(b.resolved))

  if (sorted.length === 0) return <Typography color='text.secondary'>No exceptions on this entry.</Typography>

  return (
    <div className='flex flex-col gap-4'>
      {canResolve && sorted.some(exception => !exception.resolved) && (
        <Alert severity='info'>Approving the entry resolves all of its exceptions at once.</Alert>
      )}
      {sorted.map(exception => (
        <div key={exception.id} className='flex flex-col gap-2 rounded border p-3'>
          <div className='flex items-center justify-between gap-2'>
            <ExceptionChip exception={exception} />
            <Typography variant='caption' color='text.disabled'>
              {exception.resolved && exception.resolvedAt
                ? `Resolved ${formatStamp(exception.resolvedAt, zone)}`
                : `Raised ${formatStamp(exception.createdAt, zone)}`}
            </Typography>
          </div>
          <Typography color={exception.resolved ? 'text.secondary' : 'text.primary'}>
            {describeException(exception)}
          </Typography>
          {canResolve && !exception.resolved && resolving !== exception.id && (
            <Button size='small' variant='tonal' className='self-start' onClick={() => setResolving(exception.id)}>
              Resolve
            </Button>
          )}
          {resolving === exception.id && <ResolveForm exceptionId={exception.id} onCancel={() => setResolving(null)} />}
        </div>
      ))}
    </div>
  )
}

export default ExceptionList
