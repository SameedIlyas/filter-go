'use client'

// React Imports
import { useState } from 'react'

// MUI Imports
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { WorkLog, WorkLogKind } from '@/types/timesheetTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import SurveyPhotos from '@views/leads/detail/SurveyPhotos'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useAddWorkLog } from '@/libs/api/queries/timesheets'
import { formatStamp } from '../shared'

const KIND_META: Record<WorkLogKind, { label: string; icon: string }> = {
  NOTE: { label: 'Note', icon: 'bx-note' },
  ISSUE: { label: 'Issue', icon: 'bx-error' },
  CHECKLIST: { label: 'Checklist', icon: 'bx-list-check' },
  PHOTO: { label: 'Photo', icon: 'bx-camera' }
}


const LogBody = ({ log }: { log: WorkLog }) => {
  if (log.kind === 'CHECKLIST') {
    return (
      <div className='flex flex-col gap-1'>
        {(log.data?.items ?? []).map((item, index) => (
          <div key={index} className='flex items-center gap-2'>
            <i className={`${item.done ? 'bx-check-square text-success' : 'bx-square text-textDisabled'} text-lg`} />
            <Typography color={item.done ? 'text.primary' : 'text.secondary'}>{item.label}</Typography>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-2'>
      {log.kind === 'PHOTO' && log.fileId && <SurveyPhotos ids={[log.fileId]} />}
      {log.body && (
        <Typography color={log.kind === 'ISSUE' ? 'warning.main' : 'text.primary'} className='whitespace-pre-line'>
          {log.body}
        </Typography>
      )}
    </div>
  )
}

/** A supervisor's note on the shift (the worker's own logs come from the field). */
const AddNote = ({ shiftId }: { shiftId: string }) => {
  const add = useAddWorkLog()
  const [body, setBody] = useState('')

  const submit = async () => {
    if (!body.trim()) return

    try {
      await add.mutateAsync({ shiftId, input: { kind: 'NOTE', body: body.trim() } })
      setBody('')
      toast.success('Note added')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <div className='flex flex-col gap-2'>
      <CustomTextField
        fullWidth
        multiline
        minRows={2}
        placeholder='Add a note to this shift'
        value={body}
        onChange={e => setBody(e.target.value.slice(0, 4000))}
      />
      <Button
        size='small'
        variant='tonal'
        className='self-start'
        onClick={() => void submit()}
        disabled={!body.trim() || add.isPending}
      >
        {add.isPending ? 'Adding…' : 'Add note'}
      </Button>
    </div>
  )
}

/** What happened on the shift (UAT "Reports"): notes, issues, checklists and photos, oldest first. */
const WorkLogList = ({ logs, shiftId, canAdd, zone }: { logs: WorkLog[]; shiftId: string; canAdd: boolean; zone: string }) => (
  <div className='flex flex-col gap-4'>
    {logs.length === 0 && <Typography color='text.secondary'>Nothing logged on this shift.</Typography>}
    {logs.map(log => (
      <div key={log.id} className='flex gap-3'>
        <i
          className={`${KIND_META[log.kind].icon} text-xl ${log.kind === 'ISSUE' ? 'text-warning' : 'text-textSecondary'}`}
        />
        <div className='flex flex-1 flex-col gap-1 min-is-0'>
          <LogBody log={log} />
          <Typography variant='caption' color='text.disabled'>
            {KIND_META[log.kind].label} · {log.user?.name ?? 'Unknown'} · {formatStamp(log.at, zone)}
          </Typography>
        </div>
      </div>
    ))}
    {canAdd && <AddNote shiftId={shiftId} />}
  </div>
)

export default WorkLogList
