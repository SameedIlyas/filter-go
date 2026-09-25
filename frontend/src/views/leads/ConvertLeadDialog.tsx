'use client'

// React Imports
import { useEffect } from 'react'

// MUI Imports
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import MenuItem from '@mui/material/MenuItem'
import Alert from '@mui/material/Alert'

// Third-party Imports
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'react-toastify'

// Type Imports
import type { ConvertLeadInput, ConvertLeadResult, Lead } from '@/types/leadTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { BffError, errorMessage } from '@/libs/api/bff'
import { useConvertLead } from '@/libs/api/queries/leads'

import { compact } from './shared'

type FormValues = {
  clientLegalName: string
  billingEmail: string
  paymentTerms: ConvertLeadInput['paymentTerms']
  billingType: ConvertLeadInput['billingType']
  billingCycle: ConvertLeadInput['billingCycle']
  startDate: string
  endDate: string
}

const today = () => new Date().toISOString().slice(0, 10)

const BILLING_TYPES = [
  { value: 'PER_VISIT', label: 'Per visit', hint: 'Fixed rate per completed visit' },
  { value: 'HOURLY', label: 'Hourly', hint: 'Approved minutes × hourly rate' },
  { value: 'MONTHLY_FIXED', label: 'Monthly fixed', hint: 'Flat amount per cycle' }
] as const

const BILLING_CYCLES = [
  { value: 'PER_VISIT', label: 'Per visit' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'BIWEEKLY', label: 'Bi-weekly' },
  { value: 'MONTHLY', label: 'Monthly' }
] as const

const PAYMENT_TERMS = [
  { value: 'NET15', label: 'Net 15' },
  { value: 'NET30', label: 'Net 30' },
  { value: 'DUE_ON_RECEIPT', label: 'Due on receipt' }
] as const

type Props = {
  lead: Lead | null
  surveyCount?: number
  onClose: () => void
  onConverted?: (result: ConvertLeadResult) => void
}

/** "Convert to contract": creates the client, its sites and a draft contract pre-filled from the site surveys. */
const ConvertLeadDialog = ({ lead, surveyCount, onClose, onConverted }: Props) => {
  const convert = useConvertLead(lead?.id ?? '')

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors }
  } = useForm<FormValues>()

  useEffect(() => {
    if (lead) {
      reset({
        clientLegalName: lead.companyName,
        billingEmail: lead.email,
        paymentTerms: 'NET30',
        billingType: 'PER_VISIT',
        billingCycle: 'MONTHLY',
        startDate: today(),
        endDate: ''
      })
    }
  }, [lead, reset])

  const onSubmit = async (values: FormValues) => {
    try {
      const result = await convert.mutateAsync(compact(values) as ConvertLeadInput)

      toast.success(`${lead?.companyName} converted — draft contract created`)
      onConverted?.(result)
      onClose()
    } catch (error) {
      if (error instanceof BffError) {
        error.details?.issues?.forEach(issue => setError(issue.field as keyof FormValues, { message: issue.message }))
      }

      toast.error(errorMessage(error))
    }
  }

  return (
    <Dialog open={!!lead} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>Convert to contract</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogContent className='flex flex-col gap-5'>
          <Typography color='text.secondary'>
            Creates the client, one site per survey address and a <b>draft</b> contract with lines pre-filled from the site survey. The lead is
            marked <b>Won</b> and stays linked for attribution.
          </Typography>
          {surveyCount === 0 && (
            <Alert severity='info' variant='outlined'>
              This lead has no site survey, so the contract will start without lines.
            </Alert>
          )}
          <div className='grid gap-4 grid-cols-1 sm:grid-cols-2'>
            <Controller
              name='clientLegalName'
              control={control}
              render={({ field }) => (
                <CustomTextField
                  {...field}
                  fullWidth
                  label='Client legal name'
                  error={!!errors.clientLegalName}
                  helperText={errors.clientLegalName?.message}
                />
              )}
            />
            <Controller
              name='billingEmail'
              control={control}
              render={({ field }) => (
                <CustomTextField
                  {...field}
                  fullWidth
                  type='email'
                  label='Billing email'
                  error={!!errors.billingEmail}
                  helperText={errors.billingEmail?.message}
                />
              )}
            />
            <Controller
              name='billingType'
              control={control}
              render={({ field }) => (
                <CustomTextField
                  {...field}
                  select
                  fullWidth
                  label='Billing type'
                  helperText={BILLING_TYPES.find(t => t.value === field.value)?.hint}
                >
                  {BILLING_TYPES.map(t => (
                    <MenuItem key={t.value} value={t.value}>
                      {t.label}
                    </MenuItem>
                  ))}
                </CustomTextField>
              )}
            />
            <Controller
              name='billingCycle'
              control={control}
              render={({ field }) => (
                <CustomTextField {...field} select fullWidth label='Billing cycle'>
                  {BILLING_CYCLES.map(c => (
                    <MenuItem key={c.value} value={c.value}>
                      {c.label}
                    </MenuItem>
                  ))}
                </CustomTextField>
              )}
            />
            <Controller
              name='paymentTerms'
              control={control}
              render={({ field }) => (
                <CustomTextField {...field} select fullWidth label='Payment terms'>
                  {PAYMENT_TERMS.map(p => (
                    <MenuItem key={p.value} value={p.value}>
                      {p.label}
                    </MenuItem>
                  ))}
                </CustomTextField>
              )}
            />
            <div />
            <Controller
              name='startDate'
              control={control}
              rules={{ required: 'Start date is required.' }}
              render={({ field }) => (
                <CustomTextField
                  {...field}
                  fullWidth
                  type='date'
                  label='Start date'
                  slotProps={{ inputLabel: { shrink: true } }}
                  error={!!errors.startDate}
                  helperText={errors.startDate?.message}
                />
              )}
            />
            <Controller
              name='endDate'
              control={control}
              render={({ field }) => (
                <CustomTextField
                  {...field}
                  fullWidth
                  type='date'
                  label='End date (optional)'
                  slotProps={{ inputLabel: { shrink: true } }}
                  error={!!errors.endDate}
                  helperText={errors.endDate?.message}
                />
              )}
            />
          </div>
        </DialogContent>
        <DialogActions>
          <Button variant='tonal' color='secondary' onClick={onClose}>
            Cancel
          </Button>
          <Button variant='contained' color='success' type='submit' disabled={convert.isPending}>
            {convert.isPending ? 'Converting…' : 'Convert'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export default ConvertLeadDialog
