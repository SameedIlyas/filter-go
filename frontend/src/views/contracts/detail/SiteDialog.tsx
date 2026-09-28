'use client'

// React Imports
import { useEffect } from 'react'

// MUI Imports
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'

// Third-party Imports
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'react-toastify'

// Type Imports
import type { Site } from '@/types/contractTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { BffError, errorMessage } from '@/libs/api/bff'
import { useCreateSite, useUpdateSite } from '@/libs/api/queries/contracts'

type FormValues = { name: string; address: string; contactName: string; contactPhone: string; accessNotes: string }

const EMPTY: FormValues = { name: '', address: '', contactName: '', contactPhone: '', accessNotes: '' }

type Props = {
  open: boolean
  clientId: string
  clientName: string
  onClose: () => void
  onCreated?: (site: Site) => void

  /** Edit mode when set (PATCH /sites/:id); create mode otherwise. */
  site?: Site
}

/** Adds a service location to a client (POST /clients/:id/sites), or edits one. */
const SiteDialog = ({ open, clientId, clientName, onClose, onCreated, site }: Props) => {
  const createSite = useCreateSite(clientId)
  const updateSite = useUpdateSite()
  const saving = createSite.isPending || updateSite.isPending

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
      site
        ? {
            name: site.name,
            address: site.address,
            contactName: site.contactName ?? '',
            contactPhone: site.contactPhone ?? '',
            accessNotes: site.accessNotes ?? ''
          }
        : EMPTY
    )
  }, [open, site, reset])

  const onSubmit = async (values: FormValues) => {
    // Create omits empty optionals; edit sends null so a cleared field is actually cleared
    const optional = (value: string) => value.trim() || (site ? null : undefined)

    const input = {
      name: values.name.trim(),
      address: values.address.trim(),
      contactName: optional(values.contactName),
      contactPhone: optional(values.contactPhone),
      accessNotes: optional(values.accessNotes)
    }

    try {
      if (site) {
        await updateSite.mutateAsync({ id: site.id, input })
        toast.success(`${input.name} updated`)
      } else {
        const created = await createSite.mutateAsync(input)

        toast.success(`${created.name} added`)
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

  const required = (label: string) => ({ validate: (v: string) => !!v.trim() || `${label} is required.` })

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>{site ? `Edit ${site.name}` : `New site for ${clientName}`}</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogContent className='grid gap-4 grid-cols-1 sm:grid-cols-2'>
          <Controller
            name='name'
            control={control}
            rules={required('Name')}
            render={({ field }) => (
              <CustomTextField
                {...field}
                autoFocus
                fullWidth
                label='Site name'
                placeholder='e.g. North Warehouse'
                error={!!errors.name}
                helperText={errors.name?.message}
              />
            )}
          />
          <Controller
            name='address'
            control={control}
            rules={required('Address')}
            render={({ field }) => (
              <CustomTextField
                {...field}
                fullWidth
                label='Address'
                error={!!errors.address}
                helperText={errors.address?.message}
              />
            )}
          />
          <Controller
            name='contactName'
            control={control}
            render={({ field }) => <CustomTextField {...field} fullWidth label='On-site contact (optional)' />}
          />
          <Controller
            name='contactPhone'
            control={control}
            render={({ field }) => (
              <CustomTextField
                {...field}
                fullWidth
                label='Contact phone (optional)'
                error={!!errors.contactPhone}
                helperText={errors.contactPhone?.message}
              />
            )}
          />
          <Controller
            name='accessNotes'
            control={control}
            render={({ field }) => (
              <CustomTextField
                {...field}
                className='sm:col-span-2'
                fullWidth
                multiline
                minRows={2}
                label='Access notes (optional)'
                placeholder='Gate code, parking, who to ask for…'
              />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button variant='tonal' color='secondary' onClick={onClose}>
            Cancel
          </Button>
          <Button variant='contained' type='submit' disabled={saving}>
            {saving ? 'Saving…' : site ? 'Save' : 'Add site'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export default SiteDialog
