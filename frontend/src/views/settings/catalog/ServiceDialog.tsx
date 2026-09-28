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
import type { Service } from '@/types/contractTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { BffError, errorMessage } from '@/libs/api/bff'
import { useCreateService, useUpdateService } from '@/libs/api/queries/contracts'

const NAME_MAX = 100
const DESCRIPTION_MAX = 500

type FormValues = { name: string; description: string }

type Props = {
  open: boolean

  /** Edit this service; omit to create a new one. */
  service?: Service | null
  onClose: () => void
}

/** Creates (POST /services) or renames/re-describes (PATCH /services/:id) a catalog service. */
const ServiceDialog = ({ open, service, onClose }: Props) => {
  const createService = useCreateService()
  const updateService = useUpdateService()
  const busy = createService.isPending || updateService.isPending

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors }
  } = useForm<FormValues>({ defaultValues: { name: '', description: '' } })

  useEffect(() => {
    if (open) reset({ name: service?.name ?? '', description: service?.description ?? '' })
  }, [open, service, reset])

  const onSubmit = async (values: FormValues) => {
    const name = values.name.trim()
    const description = values.description.trim()

    try {
      const saved = service
        ? await updateService.mutateAsync({ id: service.id, input: { name, description: description || null } })
        : await createService.mutateAsync({ name, description: description || undefined })

      toast.success(service ? `${saved.name} updated` : `${saved.name} added`)
      onClose()
    } catch (error) {
      if (error instanceof BffError) {
        error.details?.issues?.forEach(issue => setError(issue.field as keyof FormValues, { message: issue.message }))

        if (error.code === 'DUPLICATE') setError('name', { message: error.message })
      }

      toast.error(errorMessage(error))
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>{service ? `Edit ${service.name}` : 'New service'}</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogContent className='flex flex-col gap-4'>
          <Controller
            name='name'
            control={control}
            rules={{
              validate: (v: string) => {
                if (!v.trim()) return 'Name is required.'

                return v.trim().length <= NAME_MAX || `Name must be at most ${NAME_MAX} characters.`
              }
            }}
            render={({ field }) => (
              <CustomTextField
                {...field}
                autoFocus
                fullWidth
                required
                label='Name'
                placeholder='e.g. HVAC filter change'
                error={!!errors.name}
                helperText={errors.name?.message}
                slotProps={{ htmlInput: { maxLength: NAME_MAX } }}
              />
            )}
          />
          <Controller
            name='description'
            control={control}
            rules={{
              validate: (v: string) =>
                v.trim().length <= DESCRIPTION_MAX || `Description must be at most ${DESCRIPTION_MAX} characters.`
            }}
            render={({ field }) => (
              <CustomTextField
                {...field}
                fullWidth
                multiline
                minRows={3}
                label='Description (optional)'
                placeholder='What the technician does on a visit…'
                error={!!errors.description}
                helperText={errors.description?.message ?? `${field.value.length}/${DESCRIPTION_MAX}`}
                slotProps={{ htmlInput: { maxLength: DESCRIPTION_MAX } }}
              />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button variant='tonal' color='secondary' onClick={onClose}>
            Cancel
          </Button>
          <Button variant='contained' type='submit' disabled={busy}>
            {busy ? 'Saving…' : service ? 'Save changes' : 'Add service'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export default ServiceDialog
