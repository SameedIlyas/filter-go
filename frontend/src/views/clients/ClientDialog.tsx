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

// Third-party Imports
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'react-toastify'

// Type Imports
import type { Client, PaymentTerms } from '@/types/contractTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { BffError, errorMessage } from '@/libs/api/bff'
import { useCreateClient, useUpdateClient } from '@/libs/api/queries/contracts'

import { PAYMENT_TERMS } from '../contracts/shared'

type FormValues = { legalName: string; billingEmail: string; billingAddress: string; paymentTerms: PaymentTerms }

const EMPTY: FormValues = { legalName: '', billingEmail: '', billingAddress: '', paymentTerms: 'NET30' }

type Props = {
  open: boolean
  onClose: () => void

  /** Edit mode when set; create mode otherwise. */
  client?: Client
  onCreated?: (client: Client) => void
}

/** Creates a client (POST /clients) or edits its billing details (PATCH /clients/:id). */
const ClientDialog = ({ open, onClose, client, onCreated }: Props) => {
  const createClient = useCreateClient()
  const updateClient = useUpdateClient(client?.id ?? '')
  const saving = createClient.isPending || updateClient.isPending

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors }
  } = useForm<FormValues>({ defaultValues: EMPTY })

  useEffect(() => {
    if (!open) return

    reset(
      client
        ? {
            legalName: client.legalName,
            billingEmail: client.billingEmail,
            billingAddress: client.billingAddress ?? '',
            paymentTerms: client.paymentTerms
          }
        : EMPTY
    )
  }, [open, client, reset])

  const onSubmit = async (values: FormValues) => {
    const input = {
      legalName: values.legalName.trim(),
      billingEmail: values.billingEmail.trim(),
      billingAddress: values.billingAddress.trim() || null,
      paymentTerms: values.paymentTerms
    }

    try {
      if (client) {
        await updateClient.mutateAsync(input)
        toast.success(`${input.legalName} updated`)
      } else {
        const created = await createClient.mutateAsync(input)

        toast.success(`${created.legalName} added`)
        onCreated?.(created)
      }

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
      <DialogTitle>{client ? `Edit ${client.legalName}` : 'New client'}</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogContent className='grid gap-4 grid-cols-1 sm:grid-cols-2'>
          <Controller
            name='legalName'
            control={control}
            rules={{ validate: v => !!v.trim() || 'Legal name is required.' }}
            render={({ field }) => (
              <CustomTextField
                {...field}
                autoFocus
                fullWidth
                label='Legal name'
                error={!!errors.legalName}
                helperText={errors.legalName?.message}
                slotProps={{ htmlInput: { maxLength: 200 } }}
              />
            )}
          />
          <Controller
            name='billingEmail'
            control={control}
            rules={{ validate: v => /^\S+@\S+\.\S+$/.test(v.trim()) || 'Enter a valid email.' }}
            render={({ field }) => (
              <CustomTextField
                {...field}
                fullWidth
                type='email'
                label='Billing email'
                error={!!errors.billingEmail}
                helperText={errors.billingEmail?.message ?? 'Invoices are sent here'}
              />
            )}
          />
          <Controller
            name='billingAddress'
            control={control}
            render={({ field }) => (
              <CustomTextField
                {...field}
                fullWidth
                label='Billing address (optional)'
                error={!!errors.billingAddress}
                helperText={errors.billingAddress?.message}
                slotProps={{ htmlInput: { maxLength: 500 } }}
              />
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
        </DialogContent>
        <DialogActions>
          <Button variant='tonal' color='secondary' onClick={onClose}>
            Cancel
          </Button>
          <Button variant='contained' type='submit' disabled={saving}>
            {saving ? 'Saving…' : client ? 'Save' : 'Add client'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export default ClientDialog
