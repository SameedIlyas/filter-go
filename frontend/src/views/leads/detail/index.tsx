'use client'

// React Imports
import { useState } from 'react'
import type { ReactNode } from 'react'

// Next Imports
import Link from 'next/link'

// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Alert from '@mui/material/Alert'
import Skeleton from '@mui/material/Skeleton'
import Chip from '@mui/material/Chip'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stepper from '@mui/material/Stepper'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'

// Type Imports
import type { LeadStatus } from '@/types/leadTypes'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useLeadQuery } from '@/libs/api/queries/leads'
import { useSession } from '@/contexts/sessionContext'
import { getInitials } from '@/utils/getInitials'

import ActivityCard from './ActivityCard'
import SurveysCard from './SurveysCard'
import LeadFormDrawer from '../LeadFormDrawer'
import StatusChangeDialog from '../StatusChangeDialog'
import ConvertLeadDialog from '../ConvertLeadDialog'
import { CONVERTIBLE, NEXT_STATUSES, PIPELINE, SOURCE_META, STATUS_META, StatusChip, formatDate, formatDateTime } from '../shared'

const InfoRow = ({ icon, label, children }: { icon: string; label: string; children: ReactNode }) => (
  <div className='flex items-start gap-3'>
    <i className={`${icon} text-xl text-textSecondary mbs-0.5`} />
    <div className='flex flex-col min-is-0'>
      <Typography variant='body2' color='text.disabled'>
        {label}
      </Typography>
      <div className='break-words'>{children}</div>
    </div>
  </div>
)

const LeadDetail = ({ id }: { id: string }) => {
  const session = useSession()
  const isAdmin = session?.role === 'ADMIN'
  const { data, isPending, isError, error, refetch } = useLeadQuery(id)

  const [editOpen, setEditOpen] = useState(false)
  const [statusTarget, setStatusTarget] = useState<LeadStatus | null>(null)
  const [convertOpen, setConvertOpen] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)

  if (isPending) {
    return (
      <div className='flex flex-col gap-6'>
        <Skeleton variant='rounded' height={160} />
        <div className='grid gap-6 grid-cols-1 lg:grid-cols-3'>
          <Skeleton variant='rounded' height={420} />
          <Skeleton variant='rounded' height={420} className='lg:col-span-2' />
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className='flex flex-col items-center gap-3 plb-12'>
          <i className='bx-error-circle text-5xl text-error' />
          <Typography variant='h5'>Couldn&apos;t load this lead</Typography>
          <Typography color='text.secondary'>{errorMessage(error)}</Typography>
          <div className='flex gap-3'>
            <Button variant='tonal' onClick={() => refetch()}>
              Retry
            </Button>
            <Button component={Link} href='/leads' variant='contained'>
              Back to leads
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const { lead, surveys, conversion } = data
  const nextStatuses = NEXT_STATUSES[lead.status]
  const canConvert = isAdmin && CONVERTIBLE.includes(lead.status)
  const isWon = lead.status === 'WON'
  const activeStep = lead.status === 'LOST' ? -1 : PIPELINE.indexOf(lead.status)
  const utmEntries = Object.entries(lead.utm ?? {})

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex items-center gap-2'>
        <Button component={Link} href='/leads' variant='text' color='secondary' startIcon={<i className='bx-arrow-back' />}>
          All leads
        </Button>
      </div>

      <Card>
        <CardContent className='flex flex-col gap-6'>
          <div className='flex flex-wrap items-start justify-between gap-4'>
            <div className='flex items-center gap-4'>
              <CustomAvatar skin='light' color={STATUS_META[lead.status].color} size={56} variant='rounded' className='text-xl'>
                {getInitials(lead.companyName)}
              </CustomAvatar>
              <div className='flex flex-col gap-1'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Typography variant='h4'>{lead.companyName}</Typography>
                  <StatusChip status={lead.status} size='medium' />
                </div>
                <Typography color='text.secondary'>
                  {lead.contactName} · {SOURCE_META[lead.source].label} lead · created {formatDate(lead.createdAt)}
                </Typography>
              </div>
            </div>
            <div className='flex flex-wrap items-center gap-3'>
              {!isWon && (
                <Button variant='tonal' color='secondary' startIcon={<i className='bx-edit' />} onClick={() => setEditOpen(true)}>
                  Edit
                </Button>
              )}
              {nextStatuses.length > 0 && (
                <>
                  <Button
                    variant='tonal'
                    endIcon={<i className='bx-chevron-down' />}
                    onClick={e => setMenuAnchor(e.currentTarget)}
                  >
                    Change status
                  </Button>
                  <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
                    {nextStatuses.map(target => (
                      <MenuItem
                        key={target}
                        className={`flex items-center gap-2 ${target === 'LOST' ? 'text-error' : ''}`}
                        onClick={() => {
                          setMenuAnchor(null)
                          setStatusTarget(target)
                        }}
                      >
                        <i className={STATUS_META[target].icon} />
                        {target === 'LOST' ? 'Mark as lost' : target === 'NEW' ? 'Reopen lead' : STATUS_META[target].label}
                      </MenuItem>
                    ))}
                  </Menu>
                </>
              )}
              {canConvert && (
                <Button variant='contained' color='success' startIcon={<i className='bx-transfer-alt' />} onClick={() => setConvertOpen(true)}>
                  Convert to contract
                </Button>
              )}
            </div>
          </div>

          {lead.status === 'LOST' ? (
            <Alert severity='error' variant='outlined' icon={<i className='bx-x-circle' />}>
              <b>Lost</b>
              {lead.lostReason ? `: ${lead.lostReason}` : ''}. Reopen it from “Change status” if they come back.
            </Alert>
          ) : (
            <Stepper activeStep={activeStep} alternativeLabel>
              {PIPELINE.map(step => (
                <Step key={step} completed={PIPELINE.indexOf(step) < activeStep || (isWon && step === 'WON')}>
                  <StepLabel>{STATUS_META[step].label}</StepLabel>
                </Step>
              ))}
            </Stepper>
          )}

          {conversion && (
            <Alert severity='success' variant='outlined' icon={<i className='bx-trophy' />}>
              Converted to a draft contract <Chip size='small' variant='tonal' color='success' label={conversion.contractId.slice(0, 8)} className='mis-1' />
              . Continue in Contracts to set rates and send it for signature.
            </Alert>
          )}
          {!isAdmin && CONVERTIBLE.includes(lead.status) && (
            <Alert severity='info' variant='outlined'>
              This lead is ready to convert. Ask an admin to convert it to a contract.
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className='grid gap-6 grid-cols-1 lg:grid-cols-3 items-start'>
        <div className='flex flex-col gap-6'>
          <Card>
            <CardHeader title='Details' />
            <CardContent className='flex flex-col gap-4'>
              <InfoRow icon='bx-user' label='Contact'>
                <Typography color='text.primary'>{lead.contactName}</Typography>
              </InfoRow>
              <InfoRow icon='bx-envelope' label='Email'>
                <Typography component='a' href={`mailto:${lead.email}`} color='primary.main'>
                  {lead.email}
                </Typography>
              </InfoRow>
              <InfoRow icon='bx-phone' label='Phone'>
                {lead.phone ? (
                  <Typography component='a' href={`tel:${lead.phone}`} color='primary.main'>
                    {lead.phone}
                  </Typography>
                ) : (
                  <Typography color='text.disabled'>—</Typography>
                )}
              </InfoRow>
              <InfoRow icon='bx-map' label='Address'>
                <Typography color={lead.address ? 'text.primary' : 'text.disabled'}>{lead.address ?? '—'}</Typography>
              </InfoRow>
              <InfoRow icon='bx-wrench' label='Service interest'>
                <Typography color={lead.serviceInterest ? 'text.primary' : 'text.disabled'}>{lead.serviceInterest ?? '—'}</Typography>
              </InfoRow>
              <Divider />
              <InfoRow icon='bx-user-check' label='Owner'>
                {lead.owner ? (
                  <div className='flex items-center gap-2'>
                    <CustomAvatar size={24} skin='light' color='primary' className='text-xs'>
                      {getInitials(lead.owner.name)}
                    </CustomAvatar>
                    <Typography color='text.primary'>{lead.owner.name}</Typography>
                  </div>
                ) : (
                  <Chip size='small' variant='outlined' label='Unassigned' />
                )}
              </InfoRow>
              <InfoRow icon={SOURCE_META[lead.source].icon} label='Source'>
                <Typography color='text.primary'>{SOURCE_META[lead.source].label}</Typography>
                {lead.sourceUrl && (
                  <Typography variant='body2' component='a' href={lead.sourceUrl} target='_blank' rel='noreferrer' color='primary.main' className='break-all'>
                    {lead.sourceUrl}
                  </Typography>
                )}
              </InfoRow>
              {utmEntries.length > 0 && (
                <InfoRow icon='bx-purchase-tag' label='Campaign (UTM)'>
                  <div className='flex flex-wrap gap-1 mbs-1'>
                    {utmEntries.map(([key, value]) => (
                      <Chip key={key} size='small' variant='tonal' label={`${key.replace(/^utm_/, '')}: ${value}`} />
                    ))}
                  </div>
                </InfoRow>
              )}
              <InfoRow icon='bx-time' label='Created / updated'>
                <Typography color='text.primary'>{formatDateTime(lead.createdAt)}</Typography>
                <Typography variant='body2' color='text.disabled'>
                  Updated {formatDateTime(lead.updatedAt)}
                </Typography>
              </InfoRow>
            </CardContent>
          </Card>
          {lead.message && (
            <Card>
              <CardHeader title='Original message' />
              <CardContent>
                <Typography className='whitespace-pre-wrap'>{lead.message}</Typography>
              </CardContent>
            </Card>
          )}
        </div>

        <div className='lg:col-span-2 flex flex-col gap-6'>
          <ActivityCard leadId={lead.id} />
          <SurveysCard leadId={lead.id} surveys={surveys} defaultAddress={lead.address ?? ''} readOnly={isWon} />
        </div>
      </div>

      <LeadFormDrawer open={editOpen} lead={lead} onClose={() => setEditOpen(false)} />
      <StatusChangeDialog lead={statusTarget ? lead : null} target={statusTarget} onClose={() => setStatusTarget(null)} />
      <ConvertLeadDialog lead={convertOpen ? lead : null} surveyCount={surveys.length} onClose={() => setConvertOpen(false)} />
    </div>
  )
}

export default LeadDetail
