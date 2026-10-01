'use client'

// React Imports
import { useEffect, useState } from 'react'

// MUI Imports
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
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
import { EXCEPTION_META } from '../shared'

const MAX_NOTE = 1000

type Props = { exception: Pick<TimesheetException, 'id' | 'type' | 'detail'> | null; onClose: () => void }

/** Clear one exception without approving the entry, with an optional note for the record. */
const ResolveDialog = ({ exception, onClose }: Props) => {
  const resolve = useResolveException()
  const [note, setNote] = useState('')

  useEffect(() => setNote(''), [exception?.id])

  const onResolve = async () => {
    if (!exception) return

    try {
      await resolve.mutateAsync({ id: exception.id, note: note.trim() || undefined })
      toast.success(`${EXCEPTION_META[exception.type].label} resolved`)
      onClose()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <Dialog open={exception !== null} onClose={onClose} maxWidth='xs' fullWidth>
      {exception && (
        <>
          <DialogTitle>Resolve {EXCEPTION_META[exception.type].label.toLowerCase()}</DialogTitle>
          <DialogContent className='flex flex-col gap-4'>
            <Typography>{describeException(exception)}</Typography>
            <Typography variant='body2' color='text.secondary'>
              The timesheet still needs approval afterwards. Approving it resolves all of its exceptions at once.
            </Typography>
            <CustomTextField
              fullWidth
              multiline
              minRows={2}
              label='Note (optional)'
              placeholder='e.g. Called the site, the officer was there'
              value={note}
              onChange={e => setNote(e.target.value.slice(0, MAX_NOTE))}
            />
          </DialogContent>
          <DialogActions>
            <Button variant='tonal' color='secondary' onClick={onClose}>
              Cancel
            </Button>
            <Button variant='contained' onClick={onResolve} disabled={resolve.isPending}>
              {resolve.isPending ? 'Resolving…' : 'Resolve'}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  )
}

export default ResolveDialog
