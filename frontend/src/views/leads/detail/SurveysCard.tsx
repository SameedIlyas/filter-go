'use client'

// React Imports
import { useEffect, useState } from 'react'
import type { FocusEvent } from 'react'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { LeadSurvey } from '@/types/leadTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useDeleteSurvey, useSaveSurvey } from '@/libs/api/queries/leads'

import { formatDate } from '../shared'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

type UnitRow = { name: string; qty: string; estMinutes: string; notes: string }

const emptyUnit = (): UnitRow => ({ name: '', qty: '1', estMinutes: '', notes: '' })

const SurveyDialog = ({
  leadId,
  open,
  survey,
  defaultAddress,
  onClose
}: {
  leadId: string
  open: boolean
  survey: LeadSurvey | null
  defaultAddress: string
  onClose: () => void
}) => {
  const [address, setAddress] = useState('')
  const [accessNotes, setAccessNotes] = useState('')
  const [units, setUnits] = useState<UnitRow[]>([emptyUnit()])
  const save = useSaveSurvey(leadId)

  useEffect(() => {
    if (!open) return

    setAddress(survey?.address ?? defaultAddress)
    setAccessNotes(survey?.accessNotes ?? '')
    setUnits(
      survey?.units.length
        ? survey.units.map(u => ({ name: u.name, qty: u.qty, estMinutes: u.estMinutes ? String(u.estMinutes) : '', notes: u.notes ?? '' }))
        : [emptyUnit()]
    )
  }, [open, survey, defaultAddress])

  const setUnit = (index: number, patch: Partial<UnitRow>) =>
    setUnits(rows => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const valid = address.trim() && units.length > 0 && units.every(u => u.name.trim() && Number(u.qty) > 0)

  const submit = async () => {
    try {
      await save.mutateAsync({
        surveyId: survey?.id,
        input: {
          address: address.trim(),
          ...(accessNotes.trim() ? { accessNotes: accessNotes.trim() } : {}),
          units: units.map(u => ({
            name: u.name.trim(),
            qty: u.qty.trim(),
            ...(u.estMinutes ? { estMinutes: Number(u.estMinutes) } : {}),
            ...(u.notes.trim() ? { notes: u.notes.trim() } : {})
          }))
        }
      })
      toast.success(survey ? 'Survey updated' : 'Survey added')
      onClose()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth='md' fullWidth>
      <DialogTitle>{survey ? 'Edit site survey' : 'New site survey'}</DialogTitle>
      <DialogContent className='flex flex-col gap-5'>
        <Typography color='text.secondary'>
          Capture what&apos;s actually on site. On conversion each survey becomes a site and its units pre-fill the contract lines.
        </Typography>
        <CustomTextField fullWidth required label='Site address' value={address} onChange={e => setAddress(e.target.value)} />
        <div className='flex flex-col gap-3'>
          <Typography variant='h6'>Units</Typography>
          {units.map((unit, index) => (
            <div key={index} className='grid gap-3 grid-cols-12 items-start'>
              <CustomTextField
                className='col-span-12 sm:col-span-4'
                required
                label='Unit / service'
                placeholder='e.g. Rooftop AHU filter'
                value={unit.name}
                onChange={e => setUnit(index, { name: e.target.value })}
              />
              <CustomTextField
                className='col-span-4 sm:col-span-2'
                required
                type='number'
                label='Qty'
                value={unit.qty}
                onChange={e => setUnit(index, { qty: e.target.value })}

                // Default is "1": select it on focus so typing replaces it instead of appending ("16")
                slotProps={{ htmlInput: { min: 0.01, step: 1, onFocus: (e: FocusEvent<HTMLInputElement>) => e.target.select() } }}
              />
              <CustomTextField
                className='col-span-8 sm:col-span-2'
                type='number'
                label='Est. minutes'
                value={unit.estMinutes}
                onChange={e => setUnit(index, { estMinutes: e.target.value })}
                slotProps={{ htmlInput: { min: 1, max: 1440 } }}
              />
              <CustomTextField
                className='col-span-10 sm:col-span-3'
                label='Notes'
                value={unit.notes}
                onChange={e => setUnit(index, { notes: e.target.value })}
              />
              <div className='col-span-2 sm:col-span-1 flex justify-end pbs-5'>
                <IconButton
                  aria-label='Remove unit'
                  disabled={units.length === 1}
                  onClick={() => setUnits(rows => rows.filter((_, i) => i !== index))}
                >
                  <i className='bx-trash text-xl' />
                </IconButton>
              </div>
            </div>
          ))}
          <div>
            <Button variant='tonal' size='small' startIcon={<i className='bx-plus' />} onClick={() => setUnits(rows => [...rows, emptyUnit()])}>
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
          onChange={e => setAccessNotes(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button variant='tonal' color='secondary' onClick={onClose}>
          Cancel
        </Button>
        <Button variant='contained' onClick={submit} disabled={!valid || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save survey'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

type Props = {
  leadId: string
  surveys: LeadSurvey[]
  defaultAddress: string
  readOnly?: boolean
}

const SurveysCard = ({ leadId, surveys, defaultAddress, readOnly }: Props) => {
  const [editing, setEditing] = useState<LeadSurvey | null>(null)
  const [open, setOpen] = useState(false)
  const remove = useDeleteSurvey(leadId)

  const openNew = () => {
    setEditing(null)
    setOpen(true)
  }

  const onDelete = async (survey: LeadSurvey) => {
    if (!window.confirm(`Delete the survey for ${survey.address}?`)) return

    try {
      await remove.mutateAsync(survey.id)
      toast.success('Survey deleted')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <Card>
      <CardHeader
        title='Site surveys'
        subheader='Units on site, used to pre-fill the contract'
        action={
          !readOnly && (
            <Button variant='tonal' size='small' startIcon={<i className='bx-plus' />} onClick={openNew}>
              Add survey
            </Button>
          )
        }
      />
      <CardContent className='flex flex-col gap-4'>
        {surveys.length === 0 && (
          <Typography color='text.disabled' className='text-center plb-4'>
            No surveys yet.
          </Typography>
        )}
        {surveys.map(survey => (
          <div key={survey.id} className='rounded border'>
            <div className='flex items-start justify-between gap-2 p-4'>
              <div className='flex items-start gap-2'>
                <i className='bx-map-pin text-xl text-primary mbs-0.5' />
                <div>
                  <Typography className='font-medium' color='text.primary'>
                    {survey.address}
                  </Typography>
                  <Typography variant='body2' color='text.disabled'>
                    {survey.units.length} unit{survey.units.length === 1 ? '' : 's'} · added {formatDate(survey.createdAt)}
                  </Typography>
                  {survey.accessNotes && (
                    <Typography variant='body2' color='text.secondary' className='mbs-1'>
                      Access: {survey.accessNotes}
                    </Typography>
                  )}
                </div>
              </div>
              {!readOnly && (
                <div className='flex'>
                  <IconButton
                    size='small'
                    aria-label='Edit survey'
                    onClick={() => {
                      setEditing(survey)
                      setOpen(true)
                    }}
                  >
                    <i className='bx-edit text-textSecondary' />
                  </IconButton>
                  <IconButton size='small' aria-label='Delete survey' onClick={() => onDelete(survey)}>
                    <i className='bx-trash text-textSecondary' />
                  </IconButton>
                </div>
              )}
            </div>
            <div className='overflow-x-auto border-bs'>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th>Qty</th>
                    <th>Est. min</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {survey.units.map((unit, i) => (
                    <tr key={i}>
                      <td>{unit.name}</td>
                      <td>{unit.qty}</td>
                      <td>{unit.estMinutes ?? '—'}</td>
                      <td>{unit.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </CardContent>
      <SurveyDialog leadId={leadId} open={open} survey={editing} defaultAddress={defaultAddress} onClose={() => setOpen(false)} />
    </Card>
  )
}

export default SurveysCard
