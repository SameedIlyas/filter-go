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
import Typography from '@mui/material/Typography'

// Third-party Imports
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'react-toastify'

// Type Imports
import type { EmploymentType, Role, User } from '@/types/userTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { BffError, errorMessage } from '@/libs/api/bff'
import { USER_ROLES, useInviteUser, useUpdateUser } from '@/libs/api/queries/users'
import { useClientsQuery } from '@/libs/api/queries/contracts'

import { EMPLOYMENT_META, ROLE_META } from './shared'

type FormValues = {
  name: string
  email: string
  role: Role
  clientId: string
  phone: string
  employmentType: EmploymentType
  defaultPayRate: string
  hiredAt: string
}

const EMPTY: FormValues = {
  name: '',
  email: '',
  role: 'FIELD_USER',
  clientId: '',
  phone: '',
  employmentType: 'EMPLOYEE',
  defaultPayRate: '',
  hiredAt: ''
}

const MONEY = /^\d{1,7}(\.\d{1,2})?$/

type Props = {
  open: boolean
  onClose: () => void

  /** Edit mode when set; invite mode otherwise. */
  user?: User
  onInvited?: (user: User) => void
}

const toValues = (user: User): FormValues => ({
  name: user.name,
  email: user.email,
  role: user.role,
  clientId: user.clientId ?? '',
  phone: user.phone ?? '',
  employmentType: user.employmentType,
  defaultPayRate: user.defaultPayRate ?? '',
  hiredAt: user.hiredAt ?? ''
})

/** Invites a user (POST /admin/users/invite) or edits their profile and job details (PATCH /admin/users/:id). */
const UserFormDialog = ({ open, onClose, user, onInvited }: Props) => {
  const invite = useInviteUser()
  const update = useUpdateUser(user?.id ?? '')
  const saving = invite.isPending || update.isPending

  const {
    control,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors }
  } = useForm<FormValues>({ defaultValues: EMPTY })

  const role = watch('role')
  const isClientUser = role === 'CLIENT_USER'
  const clients = useClientsQuery({ active: 'true' })

  useEffect(() => {
    if (open) reset(user ? toValues(user) : EMPTY)
  }, [open, user, reset])

  const onSubmit = async (values: FormValues) => {
    const shared = {
      name: values.name.trim(),
      role: values.role,
      employmentType: values.employmentType
    }

    try {
      if (user) {
        await update.mutateAsync({
          ...shared,
          clientId: isClientUser ? values.clientId || null : null,
          phone: values.phone.trim() || null,
          defaultPayRate: values.defaultPayRate.trim() || null,
          hiredAt: values.hiredAt || null
        })
        toast.success(`${shared.name} updated`)
      } else {
        const { user: created, emailSent } = await invite.mutateAsync({
          ...shared,
          email: values.email.trim().toLowerCase(),
          ...(isClientUser && values.clientId ? { clientId: values.clientId } : {}),
          ...(values.phone.trim() ? { phone: values.phone.trim() } : {}),
          ...(values.defaultPayRate.trim() ? { defaultPayRate: values.defaultPayRate.trim() } : {}),
          ...(values.hiredAt ? { hiredAt: values.hiredAt } : {})
        })

        if (emailSent) toast.success(`Invitation sent to ${created.email}`)
        else toast.warning(`${created.name} was added, but the invite email failed. Try re-sending it.`)

        onInvited?.(created)
      }

      onClose()
    } catch (error) {
      if (error instanceof BffError) {
        error.details?.issues?.forEach(issue => setError(issue.field as keyof FormValues, { message: issue.message }))
        if (error.code === 'EMAIL_TAKEN') setError('email', { message: error.message })
      }

      toast.error(errorMessage(error))
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth='md' fullWidth>
      <DialogTitle>{user ? `Edit ${user.name}` : 'Invite user'}</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogContent className='flex flex-col gap-6'>
          {!user && (
            <Typography color='text.secondary'>
              They&apos;ll get an email with a link to set their password. Until then they show as Invited.
            </Typography>
          )}
          <div className='flex flex-col gap-4'>
            <Typography variant='h6'>Basic information</Typography>
            <div className='grid gap-4 grid-cols-1 sm:grid-cols-2'>
              <Controller
                name='name'
                control={control}
                rules={{ validate: v => !!v.trim() || 'Name is required.' }}
                render={({ field }) => (
                  <CustomTextField
                    {...field}
                    autoFocus
                    fullWidth
                    label='Full name'
                    error={!!errors.name}
                    helperText={errors.name?.message}
                    slotProps={{ htmlInput: { maxLength: 120 } }}
                  />
                )}
              />
              <Controller
                name='email'
                control={control}
                rules={{ validate: v => !!user || /^\S+@\S+\.\S+$/.test(v.trim()) || 'Enter a valid email.' }}
                render={({ field }) => (
                  <CustomTextField
                    {...field}
                    fullWidth
                    type='email'
                    label='Email'
                    disabled={!!user}
                    error={!!errors.email}
                    helperText={errors.email?.message ?? (user ? 'Email can’t be changed' : undefined)}
                  />
                )}
              />
              <Controller
                name='phone'
                control={control}
                rules={{ validate: v => !v.trim() || v.trim().length >= 3 || 'Enter a valid phone number.' }}
                render={({ field }) => (
                  <CustomTextField
                    {...field}
                    fullWidth
                    label='Phone (optional)'
                    error={!!errors.phone}
                    helperText={errors.phone?.message}
                    slotProps={{ htmlInput: { maxLength: 40 } }}
                  />
                )}
              />
            </div>
          </div>

          <div className='flex flex-col gap-4'>
            <Typography variant='h6'>Job details</Typography>
            <div className='grid gap-4 grid-cols-1 sm:grid-cols-2'>
              <Controller
                name='role'
                control={control}
                render={({ field }) => (
                  <CustomTextField
                    {...field}
                    select
                    fullWidth
                    label='Role'
                    helperText={errors.role?.message ?? ROLE_META[field.value].hint}
                    error={!!errors.role}
                  >
                    {USER_ROLES.map(r => (
                      <MenuItem key={r} value={r}>
                        {ROLE_META[r].label}
                      </MenuItem>
                    ))}
                  </CustomTextField>
                )}
              />
              {isClientUser && (
                <Controller
                  name='clientId'
                  control={control}
                  rules={{ validate: v => !isClientUser || !!v || 'Pick the client this user belongs to.' }}
                  render={({ field }) => (
                    <CustomTextField
                      {...field}
                      select
                      fullWidth
                      label='Client'
                      error={!!errors.clientId}
                      helperText={errors.clientId?.message ?? 'They can only see this client’s data'}
                      slotProps={{ select: { displayEmpty: true } }}
                    >
                      <MenuItem value='' disabled>
                        {clients.isPending ? 'Loading clients…' : 'Select a client'}
                      </MenuItem>
                      {(clients.data ?? []).map(c => (
                        <MenuItem key={c.id} value={c.id}>
                          {c.legalName}
                        </MenuItem>
                      ))}
                    </CustomTextField>
                  )}
                />
              )}
              <Controller
                name='employmentType'
                control={control}
                render={({ field }) => (
                  <CustomTextField {...field} select fullWidth label='Employment type'>
                    {(Object.keys(EMPLOYMENT_META) as EmploymentType[]).map(type => (
                      <MenuItem key={type} value={type}>
                        {EMPLOYMENT_META[type]}
                      </MenuItem>
                    ))}
                  </CustomTextField>
                )}
              />
              <Controller
                name='defaultPayRate'
                control={control}
                rules={{ validate: v => !v.trim() || MONEY.test(v.trim()) || 'Use a number like 22.50.' }}
                render={({ field }) => (
                  <CustomTextField
                    {...field}
                    fullWidth
                    label='Base pay rate / hour (optional)'
                    placeholder='22.00'
                    error={!!errors.defaultPayRate}
                    helperText={errors.defaultPayRate?.message}
                    slotProps={{ input: { startAdornment: <span className='mie-1 text-textSecondary'>$</span> } }}
                  />
                )}
              />
              <Controller
                name='hiredAt'
                control={control}
                render={({ field }) => (
                  <CustomTextField
                    {...field}
                    fullWidth
                    type='date'
                    label='Hire date (optional)'
                    error={!!errors.hiredAt}
                    helperText={errors.hiredAt?.message}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                )}
              />
            </div>
          </div>
        </DialogContent>
        <DialogActions>
          <Button variant='tonal' color='secondary' onClick={onClose}>
            Cancel
          </Button>
          <Button variant='contained' type='submit' disabled={saving}>
            {saving ? 'Saving…' : user ? 'Save changes' : 'Send invite'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export default UserFormDialog
