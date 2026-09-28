'use client'

// React Imports
import { useState } from 'react'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { LeadSurvey } from '@/types/leadTypes'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useServicesQuery } from '@/libs/api/queries/contracts'
import { useDeleteSurvey } from '@/libs/api/queries/leads'

import { formatDate } from '../shared'
import SurveyDialog from './SurveyDialog'
import SurveyPhotos from './SurveyPhotos'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

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
  const services = useServicesQuery()
  const serviceName = (id?: string) => (id ? services.data?.find(service => service.id === id)?.name : undefined)

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
                    {survey.units.length} unit{survey.units.length === 1 ? '' : 's'}
                    {survey.photoFileIds.length > 0 &&
                      ` · ${survey.photoFileIds.length} photo${survey.photoFileIds.length === 1 ? '' : 's'}`}{' '}
                    · added {formatDate(survey.createdAt)}
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
                      <td>
                        <div className='flex flex-col'>
                          <Typography color='text.primary'>{unit.name}</Typography>
                          {serviceName(unit.serviceId) && unit.name !== serviceName(unit.serviceId) && (
                            <Typography variant='body2' color='text.disabled'>
                              {serviceName(unit.serviceId)}
                            </Typography>
                          )}
                        </div>
                      </td>
                      <td>{unit.qty}</td>
                      <td>{unit.estMinutes ?? '—'}</td>
                      <td>{unit.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {survey.photoFileIds.length > 0 && (
              <div className='p-4 border-bs'>
                <SurveyPhotos ids={survey.photoFileIds} />
              </div>
            )}
          </div>
        ))}
      </CardContent>
      <SurveyDialog
        leadId={leadId}
        open={open}
        survey={editing}
        defaultAddress={defaultAddress}
        services={services.data ?? []}
        onClose={() => setOpen(false)}
      />
    </Card>
  )
}

export default SurveysCard
