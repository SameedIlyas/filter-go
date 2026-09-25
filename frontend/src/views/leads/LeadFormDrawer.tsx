'use client'

// React Imports
import { useEffect } from 'react'

// MUI Imports
import Drawer from '@mui/material/Drawer'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Divider from '@mui/material/Divider'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'

// Third-party Imports
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'react-toastify'

// Type Imports
import type { Lead, ManualLeadSource } from '@/types/leadTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { BffError, errorMessage } from '@/libs/api/bff'
import { useCreateLead, useLeadOwners, useUpdateLead } from '@/libs/api/queries/leads'
import { useSession } from '@/contexts/sessionContext'

import { SOURCE_META, compact } from './shared'

type FormValues = {
  companyName: string
  contactName: string
  email: string
  phone: string
  address: string
  serviceInterest: string
  message: string
  source: ManualLeadSource
  ownerId: string
}

const EMPTY: FormValues = {
  companyName: '',
  contactName: '',
  email: '',
  phone: '',
  address: '',
  serviceInterest: '',
  message: '',
  source: 'MANUAL',
  ownerId: ''
}

const MANUAL_SOURCES: ManualLeadSource[] = ['MANUAL', 'PHONE', 'REFERRAL', 'FIELD']

const SERVICE_SUGGESTIONS = ['Filter change', 'HVAC maintenance', 'Cleaning route', 'Guard post', 'Inspection']

type Props = {
  open: boolean
  onClose: () => void

  /** Edit mode when set; create mode otherwise. */
  lead?: Lead
  onCreated?: (lead: Lead) => void
}

const LeadFormDrawer = ({ open, onClose, lead, onCreated }: Props) => {
  const session = useSession()
  const isAdmin = session?.role === 'ADMIN'
  const owners = useLeadOwners()
  const createLead = useCreateLead()
  const updateLead = useUpdateLead(lead?.id ?? '')
  const saving = createLead.isPending || updateLead.isPending

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
      lead
        ? {
            companyName: lead.companyName,
            contactName: lead.contactName,
            email: lead.email,
            phone: lead.phone ?? '',
            address: lead.address ?? '',
            serviceInterest: lead.serviceInterest ?? '',
            message: lead.message ?? '',
            source: lead.source === 'WEBSITE' ? 'MANUAL' : lead.source,
            ownerId: lead.ownerId ?? ''
          }
        : { ...EMPTY, ownerId: session?.id ?? '' }
    )
  }, [open, lead, reset, session?.id])

  const applyServerErrors = (error: unknown) => {
    if (error instanceof BffError) {
      error.details?.issues?.forEach(issue => {
        if (issue.field in EMPTY) setError(issue.field as keyof FormValues, { message: issue.message })
      })
    }

    toast.error(errorMessage(error))
  }

  const onSubmit = async (values: FormValues) => {
    try {
      if (lead) {
        await updateLead.mutateAsync({
          companyName: values.companyName.trim(),
          contactName: values.contactName.trim(),
          email: values.email.trim(),
          phone: values.phone.trim() || null,
          address: values.address.trim() || null,
          serviceInterest: values.serviceInterest.trim() || null,
          ...(values.ownerId && values.ownerId !== lead.ownerId ? { ownerId: values.ownerId } : {})
        })
        toast.success('Lead updated')
      } else {
        const created = await createLead.mutateAsync(
          compact({
            companyName: values.companyName.trim(),
            contactName: values.contactName.trim(),
            email: values.email.trim(),
            phone: values.phone.trim(),
            address: values.address.trim(),
            serviceInterest: values.serviceInterest.trim(),
            message: values.message.trim(),
            source: values.source,
            ownerId: values.ownerId
          }) as Parameters<typeof createLead.mutateAsync>[0]
        )

        toast.success('Lead created')
        onCreated?.(created)
      }

      onClose()
    } catch (error) {
      applyServerErrors(error)
    }
  }

  const required = { required: 'This field is required.' }

  return (
    <Drawer
      open={open}
      anchor='right'
      variant='temporary'
      onClose={onClose}
      ModalProps={{ keepMounted: false }}
      sx={{ '& .MuiDrawer-paper': { width: { xs: 320, sm: 440 } } }}
    >
      <div className='flex items-center justify-between p-6'>
        <Typography variant='h5'>{lead ? 'Edit Lead' : 'Add New Lead'}</Typography>
        <IconButton size='small' onClick={onClose}>
          <i className='bx-x text-textPrimary text-2xl' />
        </IconButton>
      </div>
      <Divider />
      <form onSubmit={handleSubmit(onSubmit)} className='flex flex-col gap-5 p-6' noValidate>
        <Typography variant='overline' color='text.disabled'>
          Company
        </Typography>
        <Controller
          name='companyName'
          control={control}
          rules={required}
          render={({ field }) => (
            <CustomTextField
              {...field}
              fullWidth
              required
              label='Company name'
              placeholder='Acme Facilities LLC'
              error={!!errors.companyName}
              helperText={errors.companyName?.message}
            />
          )}
        />
        <Controller
          name='address'
          control={control}
          render={({ field }) => (
            <CustomTextField
              {...field}
              fullWidth
              label='Address'
              placeholder='123 Main St, Springfield'
              error={!!errors.address}
              helperText={errors.address?.message}
            />
          )}
        />
        <Controller
          name='serviceInterest'
          control={control}
          render={({ field }) => (
            <CustomTextField
              {...field}
              fullWidth
              label='Service interest'
              placeholder='e.g. Filter change'
              error={!!errors.serviceInterest}
              helperText={errors.serviceInterest?.message ?? `Suggestions: ${SERVICE_SUGGESTIONS.join(', ')}`}
            />
          )}
        />

        <Typography variant='overline' color='text.disabled'>
          Contact
        </Typography>
        <Controller
          name='contactName'
          control={control}
          rules={required}
          render={({ field }) => (
            <CustomTextField
              {...field}
              fullWidth
              required
              label='Contact name'
              placeholder='Jane Doe'
              error={!!errors.contactName}
              helperText={errors.contactName?.message}
            />
          )}
        />
        <Controller
          name='email'
          control={control}
          rules={{
            ...required,
            pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email address.' }
          }}
          render={({ field }) => (
            <CustomTextField
              {...field}
              fullWidth
              required
              type='email'
              label='Email'
              placeholder='jane@acme.com'
              error={!!errors.email}
              helperText={errors.email?.message}
            />
          )}
        />
        <Controller
          name='phone'
          control={control}
          render={({ field }) => (
            <CustomTextField
              {...field}
              fullWidth
              label='Phone'
              placeholder='+1 555 010 2030'
              error={!!errors.phone}
              helperText={errors.phone?.message}
            />
          )}
        />

        <Typography variant='overline' color='text.disabled'>
          Pipeline
        </Typography>
        {!lead && (
          <Controller
            name='source'
            control={control}
            render={({ field }) => (
              <CustomTextField {...field} select fullWidth label='Source'>
                {MANUAL_SOURCES.map(source => (
                  <MenuItem key={source} value={source}>
                    {SOURCE_META[source].label}
                  </MenuItem>
                ))}
              </CustomTextField>
            )}
          />
        )}
        <Controller
          name='ownerId'
          control={control}
          render={({ field }) => (
            <CustomTextField
              {...field}
              select
              fullWidth
              label='Owner'
              disabled={!isAdmin}
              error={!!errors.ownerId}
              helperText={errors.ownerId?.message ?? (!isAdmin ? 'Only admins can reassign leads.' : undefined)}
            >
              {(owners.data ?? []).map(owner => (
                <MenuItem key={owner.id} value={owner.id}>
                  {owner.name} · {owner.role === 'ADMIN' ? 'Admin' : 'Supervisor'}
                </MenuItem>
              ))}
              {field.value && !owners.data?.some(owner => owner.id === field.value) && (
                <MenuItem value={field.value}>{lead?.owner?.name ?? session?.name ?? 'Current owner'}</MenuItem>
              )}
            </CustomTextField>
          )}
        />
        {!lead && (
          <Controller
            name='message'
            control={control}
            render={({ field }) => (
              <CustomTextField
                {...field}
                fullWidth
                multiline
                minRows={3}
                label='Notes / message'
                placeholder='What did they ask for?'
                error={!!errors.message}
                helperText={errors.message?.message}
              />
            )}
          />
        )}
        <div className='flex items-center gap-4'>
          <Button variant='contained' type='submit' disabled={saving}>
            {saving ? 'Saving…' : lead ? 'Save changes' : 'Create lead'}
          </Button>
          <Button variant='tonal' color='secondary' onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Drawer>
  )
}

export default LeadFormDrawer
