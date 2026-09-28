'use client'

// React Imports
import { useEffect } from 'react'

// MUI Imports
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'

// Third-party Imports
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'react-toastify'

// Type Imports
import type { BillingCycle, BillingType, ContractDetail } from '@/types/contractTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { BffError, errorMessage } from '@/libs/api/bff'
import { useUpdateContractHeader } from '@/libs/api/queries/contracts'

import { BILLING_CYCLES, BILLING_TYPES } from '../shared'

type FormValues = {
  startDate: string
  endDate: string
  autoRenew: boolean
  billingType: BillingType
  billingCycle: BillingCycle
}

type Props = { open: boolean; contract: ContractDetail; onClose: () => void }

/** Edits a draft's header (PATCH /contracts/:id), sending only what changed. */
const TermsDialog = ({ open, contract, onClose }: Props) => {
  const update = useUpdateContractHeader(contract.id)

  const {
    control,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, dirtyFields }
  } = useForm<FormValues>()

  useEffect(() => {
    if (open) {
      reset({
        startDate: contract.startDate,
        endDate: contract.endDate ?? '',
        autoRenew: contract.autoRenew,
        billingType: contract.billingType,
        billingCycle: contract.billingCycle
      })
    }
  }, [open, contract, reset])

  const billingType = watch('billingType')

  const onSubmit = async (values: FormValues) => {
    const changed = (Object.keys(dirtyFields) as Array<keyof FormValues>).filter(key => dirtyFields[key])

    if (changed.length === 0) {
      onClose()

      return
    }

    const patch = Object.fromEntries(
      changed.map(key => [key, key === 'endDate' ? values.endDate || null : values[key]])
    )

    try {
      await update.mutateAsync(patch)
      toast.success('Contract terms updated')
      onClose()
    } catch (error) {
      if (error instanceof BffError) {
        error.details?.issues?.forEach(issue => setError(issue.field as keyof FormValues, { message: issue.message }))
      }

      toast.error(errorMessage(error))
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>Edit terms</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogContent className='grid gap-4 grid-cols-1 sm:grid-cols-2'>
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
            rules={{
              validate: v =>
                !(billingType === 'MONTHLY_FIXED' && v === 'PER_VISIT') ||
                'A monthly fixed contract cannot be billed per visit.'
            }}
            render={({ field }) => (
              <CustomTextField
                {...field}
                select
                fullWidth
                label='Billing cycle'
                error={!!errors.billingCycle}
                helperText={errors.billingCycle?.message}
              >
                {BILLING_CYCLES.map(c => (
                  <MenuItem key={c.value} value={c.value}>
                    {c.label}
                  </MenuItem>
                ))}
              </CustomTextField>
            )}
          />
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
            rules={{
              validate: (v, all) => !v || v >= all.startDate || 'The end date must be on or after the start date.'
            }}
            render={({ field }) => (
              <CustomTextField
                {...field}
                fullWidth
                type='date'
                label='End date (optional)'
                slotProps={{ inputLabel: { shrink: true } }}
                error={!!errors.endDate}
                helperText={errors.endDate?.message ?? 'Empty = open-ended'}
              />
            )}
          />
          <Controller
            name='autoRenew'
            control={control}
            render={({ field }) => (
              <FormControlLabel
                className='sm:col-span-2'
                control={<Switch checked={!!field.value} onChange={e => field.onChange(e.target.checked)} />}
                label='Auto-renew for another year when the end date passes'
              />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button variant='tonal' color='secondary' onClick={onClose}>
            Cancel
          </Button>
          <Button variant='contained' type='submit' disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export default TermsDialog
