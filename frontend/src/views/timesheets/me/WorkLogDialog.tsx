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
import IconButton from '@mui/material/IconButton'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { WorkLogKind } from '@/types/timesheetTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { uploadFile } from '@/libs/api/files'
import { useAddWorkLog } from '@/libs/api/queries/timesheets'

import { MAX_BODY, MAX_ITEMS, MAX_LABEL, buildWorkLog, emptyWorkLogForm } from './workLogForm'
import type { WorkLogForm } from './workLogForm'

type Props = { shiftId: string | null; onClose: () => void }

const KINDS: Array<{ value: WorkLogKind; label: string; icon: string }> = [
  { value: 'NOTE', label: 'Note', icon: 'bx-note' },
  { value: 'ISSUE', label: 'Issue', icon: 'bx-error' },
  { value: 'CHECKLIST', label: 'Checklist', icon: 'bx-list-check' },
  { value: 'PHOTO', label: 'Photo', icon: 'bx-camera' }
]

const UPLOAD_PURPOSE = 'work_log'

type FieldsProps = { form: WorkLogForm; setForm: (update: (form: WorkLogForm) => WorkLogForm) => void }

/** Checklist rows: a done box, a label, and remove; blank rows are dropped when sending. */
const ChecklistFields = ({ form, setForm }: FieldsProps) => {
  const setItem = (index: number, patch: Partial<WorkLogForm['items'][number]>) =>
    setForm(current => ({ ...current, items: current.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) }))

  return (
    <div className='flex flex-col gap-2'>
      {form.items.map((item, index) => (
        <div key={index} className='flex items-center gap-2'>
          <Checkbox checked={item.done} onChange={event => setItem(index, { done: event.target.checked })} slotProps={{ input: { 'aria-label': 'Done' } }} />
          <CustomTextField fullWidth placeholder={`Item ${index + 1}`} value={item.label} onChange={event => setItem(index, { label: event.target.value })} slotProps={{ htmlInput: { maxLength: MAX_LABEL } }} />
          <IconButton
            size='small'
            aria-label='Remove item'
            disabled={form.items.length === 1}
            onClick={() => setForm(current => ({ ...current, items: current.items.filter((_, i) => i !== index) }))}
          >
            <i className='bx-trash text-xl' />
          </IconButton>
        </div>
      ))}
      <Button
        variant='text'
        className='self-start'
        startIcon={<i className='bx-plus' />}
        disabled={form.items.length >= MAX_ITEMS}
        onClick={() => setForm(current => ({ ...current, items: [...current.items, { label: '', done: false }] }))}
      >
        Add item
      </Button>
    </div>
  )
}

/** Photo: pick (or take) one, it uploads straight away, then an optional caption. */
const PhotoFields = ({ form, setForm }: FieldsProps) => {
  const [uploading, setUploading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)

  const onPick = async (file: File | undefined) => {
    if (!file) return

    setUploading(true)

    try {
      const uploaded = await uploadFile(file, UPLOAD_PURPOSE)

      setFileName(uploaded.originalName)
      setForm(current => ({ ...current, fileId: uploaded.id }))
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className='flex flex-col gap-3'>
      <Button variant='tonal' component='label' startIcon={<i className='bx-camera' />} disabled={uploading} className='self-start'>
        {uploading ? 'Uploading…' : form.fileId ? 'Choose another photo' : 'Take or choose a photo'}
        <input hidden type='file' accept='image/*' capture='environment' onChange={event => void onPick(event.target.files?.[0])} />
      </Button>
      {fileName && <Typography variant='body2'>Attached: {fileName}</Typography>}
      <CustomTextField label='Caption (optional)' fullWidth value={form.body} onChange={event => setForm(current => ({ ...current, body: event.target.value }))} slotProps={{ htmlInput: { maxLength: MAX_BODY } }} />
    </div>
  )
}

/** Log a note, an issue (the site's supervisors are told), a checklist or a photo against one of my shifts. */
const WorkLogDialog = ({ shiftId, onClose }: Props) => {
  const add = useAddWorkLog()
  const [form, setFormState] = useState<WorkLogForm>(() => emptyWorkLogForm())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (shiftId) {
      setFormState(emptyWorkLogForm())
      setError(null)
    }
  }, [shiftId])

  const setForm = (update: (form: WorkLogForm) => WorkLogForm) => setFormState(update)

  const onSubmit = async () => {
    const result = buildWorkLog(form)

    if (!result.ok) return setError(result.error)
    if (!shiftId) return

    try {
      await add.mutateAsync({ shiftId, input: result.input })
      toast.success(form.kind === 'ISSUE' ? 'Issue reported to your supervisor' : 'Work log added')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Dialog open={Boolean(shiftId)} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>Add work log</DialogTitle>
      <DialogContent className='flex flex-col gap-4'>
        <ToggleButtonGroup exclusive size='small' value={form.kind} onChange={(_event, kind: WorkLogKind | null) => kind && setForm(current => ({ ...current, kind }))} className='flex-wrap'>
          {KINDS.map(kind => (
            <ToggleButton key={kind.value} value={kind.value} className='gap-1'>
              <i className={`${kind.icon} text-lg`} />
              {kind.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {(form.kind === 'NOTE' || form.kind === 'ISSUE') && (
          <>
            {form.kind === 'ISSUE' && <Alert severity='warning'>The site&apos;s supervisors are notified as soon as you send an issue.</Alert>}
            <CustomTextField
              multiline
              minRows={4}
              fullWidth
              label={form.kind === 'ISSUE' ? 'What is wrong?' : 'Note'}
              value={form.body}
              onChange={event => setForm(current => ({ ...current, body: event.target.value }))}
              slotProps={{ htmlInput: { maxLength: MAX_BODY } }}
              helperText={`${form.body.length}/${MAX_BODY}`}
            />
          </>
        )}
        {form.kind === 'CHECKLIST' && <ChecklistFields form={form} setForm={setForm} />}
        {form.kind === 'PHOTO' && <PhotoFields form={form} setForm={setForm} />}
        {error && <Alert severity='error'>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button variant='tonal' color='secondary' onClick={onClose}>
          Cancel
        </Button>
        <Button variant='contained' onClick={onSubmit} disabled={add.isPending}>
          {add.isPending ? 'Saving…' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default WorkLogDialog
