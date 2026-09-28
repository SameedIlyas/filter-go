'use client'

// React Imports
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FocusEvent } from 'react'

// MUI Imports
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Alert from '@mui/material/Alert'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { Service } from '@/types/contractTypes'
import type { LeadSurvey } from '@/types/leadTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { BffError, errorMessage } from '@/libs/api/bff'
import { uploadFile } from '@/libs/api/files'
import { useSaveSurvey } from '@/libs/api/queries/leads'

import SurveyPhotos from './SurveyPhotos'
import {
  SURVEY_LIMITS,
  emptyUnit,
  isAcceptedPhoto,
  isFieldKey,
  issueKey,
  toSurveyInput,
  toUnitRows,
  validateSurvey
} from './surveyForm'
import type { SurveyErrors, UnitRow } from './surveyForm'

type Props = {
  leadId: string
  open: boolean
  survey: LeadSurvey | null
  defaultAddress: string
  services: Service[]
  onClose: () => void
}

// Qty defaults to "1": select it on focus so typing replaces it instead of appending ("16")
const selectOnFocus = (event: FocusEvent<HTMLInputElement>) => event.target.select()

const withoutKeys = (errors: SurveyErrors, drop: (key: string) => boolean): SurveyErrors =>
  Object.fromEntries(Object.entries(errors).filter(([key]) => !drop(key)))

const SurveyDialog = ({ leadId, open, survey, defaultAddress, services, onClose }: Props) => {
  const [address, setAddress] = useState('')
  const [accessNotes, setAccessNotes] = useState('')
  const [units, setUnits] = useState<UnitRow[]>([emptyUnit()])
  const [photoFileIds, setPhotoFileIds] = useState<string[]>([])
  const [uploading, setUploading] = useState(0)
  const [errors, setErrors] = useState<SurveyErrors>({})
  const [formError, setFormError] = useState('')
  const save = useSaveSurvey(leadId)
  const fileInput = useRef<HTMLInputElement>(null)

  // Bumped on every open, so an upload that finishes after the dialog was closed or reopened is dropped
  const session = useRef(0)

  useEffect(() => {
    if (!open) return

    session.current += 1
    setAddress(survey?.address ?? defaultAddress)
    setAccessNotes(survey?.accessNotes ?? '')
    setUnits(toUnitRows(survey))
    setPhotoFileIds(survey?.photoFileIds ?? [])
    setUploading(0)
    setErrors({})
    setFormError('')
  }, [open, survey, defaultAddress])

  const clearError = (key: string) =>
    setErrors(current => (key in current ? withoutKeys(current, k => k === key) : current))

  const serviceName = (id: string) => services.find(service => service.id === id)?.name

  const setUnit = (index: number, patch: Partial<UnitRow>) => {
    setUnits(rows => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
    Object.keys(patch).forEach(field => clearError(`units.${index}.${field}`))
  }

  const pickService = (index: number, serviceId: string) => {
    const row = units[index]
    const previous = serviceName(row.serviceId)

    // Fill the name from the service unless the user already typed their own
    setUnit(index, {
      serviceId,
      ...(!row.name.trim() || row.name === previous ? { name: serviceName(serviceId) ?? '' } : {})
    })
  }

  const removeUnit = (index: number) => {
    setUnits(rows => rows.filter((_, i) => i !== index))

    // Row indexes shift, so per-row messages no longer line up
    setErrors(current => withoutKeys(current, key => key.startsWith('units')))
  }

  const uploadPhoto = async (file: File, current: number) => {
    try {
      const uploaded = await uploadFile(file, 'survey')

      if (session.current === current) setPhotoFileIds(ids => [...ids, uploaded.id])
    } catch (error) {
      if (session.current === current) toast.error(`${file.name}: ${errorMessage(error)}`)
    } finally {
      if (session.current === current) setUploading(count => count - 1)
    }
  }

  const addPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? [])
    const accepted = picked.filter(isAcceptedPhoto)
    const room = Math.max(SURVEY_LIMITS.photos - photoFileIds.length - uploading, 0)

    // Reset so picking the same file again still fires a change
    event.target.value = ''

    if (accepted.length < picked.length) toast.error('Only JPEG, PNG, WebP or HEIC photos up to 10 MB can be attached.')
    if (accepted.length > room) toast.error(`A survey can have at most ${SURVEY_LIMITS.photos} photos.`)

    const batch = accepted.slice(0, room)

    if (batch.length === 0) return

    setUploading(count => count + batch.length)
    clearError('photoFileIds')
    batch.forEach(file => void uploadPhoto(file, session.current))
  }

  const removePhoto = (id: string) => {
    setPhotoFileIds(ids => ids.filter(photoId => photoId !== id))
    clearError('photoFileIds')
  }

  const showServerErrors = (error: unknown) => {
    if (!(error instanceof BffError) || !error.details?.issues) return

    const mapped = Object.fromEntries(error.details.issues.map(issue => [issueKey(issue.field), issue.message]))
    const unplaced = Object.entries(mapped).filter(([key]) => !isFieldKey(key))

    setErrors(withoutKeys(mapped, key => !isFieldKey(key)))
    setFormError(unplaced.map(([, message]) => message).join(' '))
  }

  const submit = async () => {
    const found = validateSurvey(address, units, accessNotes, photoFileIds.length)

    setErrors(found)
    setFormError('')

    if (Object.keys(found).length > 0) return

    try {
      await save.mutateAsync({ surveyId: survey?.id, input: toSurveyInput(address, units, accessNotes, photoFileIds) })
      toast.success(survey ? 'Survey updated' : 'Survey added')
      onClose()
    } catch (error) {
      showServerErrors(error)
      toast.error(errorMessage(error))
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth='md' fullWidth>
      <DialogTitle>{survey ? 'Edit site survey' : 'New site survey'}</DialogTitle>
      <DialogContent className='flex flex-col gap-5'>
        <Typography color='text.secondary'>
          Capture what&apos;s actually on site. On conversion each survey becomes a site and its units pre-fill the
          contract lines.
        </Typography>
        {formError && <Alert severity='error'>{formError}</Alert>}
        <CustomTextField
          fullWidth
          required
          label='Site address'
          value={address}
          onChange={e => {
            setAddress(e.target.value)
            clearError('address')
          }}
          error={!!errors.address}
          helperText={errors.address}
        />
        <div className='flex flex-col gap-3'>
          <Typography variant='h6'>Units</Typography>
          {errors.units && <Typography color='error'>{errors.units}</Typography>}
          {units.map((unit, index) => {
            const e = (field: keyof UnitRow) => errors[`units.${index}.${field}`]

            return (
              <div key={unit.key} className='grid gap-3 grid-cols-12 items-start'>
                <CustomTextField
                  select
                  className='col-span-12 sm:col-span-3'
                  label='Service'
                  value={unit.serviceId}
                  onChange={ev => pickService(index, ev.target.value)}
                  error={!!e('serviceId')}
                  helperText={e('serviceId')}
                  slotProps={{ select: { displayEmpty: true } }}
                >
                  <MenuItem value=''>
                    <span className='text-textDisabled'>None</span>
                  </MenuItem>
                  {services
                    .filter(service => service.active || service.id === unit.serviceId)
                    .map(service => (
                      <MenuItem key={service.id} value={service.id}>
                        {service.name}
                        {!service.active && ' (inactive)'}
                      </MenuItem>
                    ))}
                  {unit.serviceId && !serviceName(unit.serviceId) && (
                    <MenuItem value={unit.serviceId}>Loading…</MenuItem>
                  )}
                </CustomTextField>
                <CustomTextField
                  className='col-span-12 sm:col-span-4'
                  required
                  label='Unit / service'
                  placeholder='e.g. Rooftop AHU filter'
                  value={unit.name}
                  onChange={ev => setUnit(index, { name: ev.target.value })}
                  error={!!e('name')}
                  helperText={e('name')}
                />
                <CustomTextField
                  className='col-span-4 sm:col-span-2'
                  required
                  type='number'
                  label='Qty'
                  value={unit.qty}
                  onChange={ev => setUnit(index, { qty: ev.target.value })}
                  error={!!e('qty')}
                  helperText={e('qty')}
                  slotProps={{ htmlInput: { min: 0.01, step: 0.01, onFocus: selectOnFocus } }}
                />
                <CustomTextField
                  className='col-span-6 sm:col-span-2'
                  label='Est. minutes'
                  value={unit.estMinutes}
                  onChange={ev => setUnit(index, { estMinutes: ev.target.value.replace(/\D/g, '') })}
                  error={!!e('estMinutes')}
                  helperText={e('estMinutes')}
                  slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 4 } }}
                />
                <div className='col-span-2 sm:col-span-1 flex justify-end pbs-5'>
                  <IconButton aria-label='Remove unit' disabled={units.length === 1} onClick={() => removeUnit(index)}>
                    <i className='bx-trash text-xl' />
                  </IconButton>
                </div>
                <CustomTextField
                  className='col-span-12'
                  label='Notes'
                  value={unit.notes}
                  onChange={ev => setUnit(index, { notes: ev.target.value })}
                  error={!!e('notes')}
                  helperText={e('notes')}
                />
              </div>
            )
          })}
          <div>
            <Button
              variant='tonal'
              size='small'
              startIcon={<i className='bx-plus' />}
              disabled={units.length >= SURVEY_LIMITS.units}
              onClick={() => setUnits(rows => [...rows, emptyUnit()])}
            >
              Add unit
            </Button>
          </div>
        </div>
        <CustomTextField
          fullWidth
          multiline
          minRows={2}
          label='Access notes'
          placeholder='Gate code, parking, contact on arrival…'
          value={accessNotes}
          onChange={e => {
            setAccessNotes(e.target.value)
            clearError('accessNotes')
          }}
          error={!!errors.accessNotes}
          helperText={errors.accessNotes}
        />
        <div className='flex flex-col gap-3'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div>
              <Typography variant='h6'>Photos</Typography>
              <Typography variant='body2' color='text.secondary'>
                {photoFileIds.length} of {SURVEY_LIMITS.photos}
                {uploading > 0 && ` · uploading ${uploading}…`}
              </Typography>
            </div>
            <Button
              variant='tonal'
              size='small'
              startIcon={<i className='bx-camera' />}
              disabled={photoFileIds.length + uploading >= SURVEY_LIMITS.photos}
              onClick={() => fileInput.current?.click()}
            >
              Add photos
            </Button>
            <input ref={fileInput} type='file' accept='image/*' multiple hidden onChange={addPhotos} />
          </div>
          {errors.photoFileIds && <Typography color='error'>{errors.photoFileIds}</Typography>}
          {photoFileIds.length + uploading > 0 && (
            <SurveyPhotos ids={photoFileIds} pending={uploading} onRemove={removePhoto} />
          )}
        </div>
      </DialogContent>
      <DialogActions>
        <Button variant='tonal' color='secondary' onClick={onClose}>
          Cancel
        </Button>
        <Button variant='contained' onClick={submit} disabled={save.isPending || uploading > 0}>
          {save.isPending ? 'Saving…' : uploading > 0 ? 'Uploading photos…' : 'Save survey'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default SurveyDialog
