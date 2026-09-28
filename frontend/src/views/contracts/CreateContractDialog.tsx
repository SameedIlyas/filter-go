'use client'

// React Imports
import { useEffect, useState } from 'react'

// MUI Imports
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import MenuItem from '@mui/material/MenuItem'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'

// Third-party Imports
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'react-toastify'

// Type Imports
import type { BillingCycle, BillingType, Client, ContractDetail, PaymentTerms } from '@/types/contractTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import CustomAutocomplete from '@core/components/mui/Autocomplete'

// Lib Imports
import { BffError, errorMessage } from '@/libs/api/bff'
import { useClientsQuery, useCreateClient, useCreateContract } from '@/libs/api/queries/contracts'

import { BILLING_CYCLES, BILLING_TYPES, PAYMENT_TERMS } from './shared'

type FormValues = {
  client: Client | null
  legalName: string
  billingEmail: string
  billingAddress: string
  paymentTerms: PaymentTerms
  startDate: string
  endDate: string
  autoRenew: boolean
  billingType: BillingType
  billingCycle: BillingCycle
}

const today = () => new Date().toISOString().slice(0, 10)

const DEFAULTS: FormValues = {
  client: null,
  legalName: '',
  billingEmail: '',
  billingAddress: '',
  paymentTerms: 'NET30',
  startDate: today(),
  endDate: '',
  autoRenew: false,
  billingType: 'PER_VISIT',
  billingCycle: 'MONTHLY'
}

/** Maps server field names of either call onto this form. */
const FIELD_MAP: Record<string, keyof FormValues> = { clientId: 'client' }

type Props = {
  open: boolean
  onClose: () => void
  onCreated: (contract: ContractDetail) => void

  /** Pre-selects the client (e.g. when started from a client's page). */
  initialClient?: Client
}

/**
 * Step one of a contract: who it is for and how it bills. Creates an empty DRAFT; services, sites and coverage
 * are added on the contract page. A client can be picked or created on the spot.
 */
const CreateContractDialog = ({ open, onClose, onCreated, initialClient }: Props) => {
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [search, setSearch] = useState('')
  const clients = useClientsQuery({ q: search.trim() || undefined, active: 'true' })
  const createClient = useCreateClient()
  const createContract = useCreateContract()
  const saving = createClient.isPending || createContract.isPending

  const {
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors }
  } = useForm<FormValues>({ defaultValues: DEFAULTS })

  useEffect(() => {
    if (open) {
      reset({ ...DEFAULTS, client: initialClient ?? null, startDate: today() })
      setMode('existing')
    }
  }, [open, reset, initialClient])

  const billingType = watch('billingType')

  const onSubmit = async (values: FormValues) => {
    if (mode === 'existing' && !values.client) {
      setError('client', { message: 'Pick a client.' })

      return
    }

    try {
      let clientId = values.client?.id

      if (mode === 'new') {
        const created = await createClient.mutateAsync({
          legalName: values.legalName.trim(),
          billingEmail: values.billingEmail.trim(),
          billingAddress: values.billingAddress.trim() || null,
          paymentTerms: values.paymentTerms
        })

        // If the contract step fails, a retry must not create the client twice
        setValue('client', created)
        setMode('existing')
        clientId = created.id
      }

      if (!clientId) return

      const contract = await createContract.mutateAsync({
        clientId,
        startDate: values.startDate,
        endDate: values.endDate || null,
        autoRenew: values.autoRenew,
        billingType: values.billingType,
        billingCycle: values.billingCycle,
        lines: [],
        coverage: []
      })

      toast.success(`Draft ${contract.contractNumber} created`)
      onCreated(contract)
      onClose()
    } catch (error) {
      if (error instanceof BffError) {
        error.details?.issues?.forEach(issue =>
          setError(FIELD_MAP[issue.field] ?? (issue.field as keyof FormValues), { message: issue.message })
        )
      }

      toast.error(errorMessage(error))
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>New contract</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogContent className='flex flex-col gap-5'>
          <Typography color='text.secondary'>
            Starts as a <b>draft</b>. Add the sites, services and coverage next, then send it for signature.
          </Typography>

          <div className='flex flex-col gap-3'>
            <div className='flex items-center justify-between gap-2'>
              <Typography variant='h6'>Client</Typography>
              <ToggleButtonGroup exclusive size='small' value={mode} onChange={(_, next) => next && setMode(next)}>
                <ToggleButton value='existing'>Existing</ToggleButton>
                <ToggleButton value='new'>New client</ToggleButton>
              </ToggleButtonGroup>
            </div>

            {mode === 'existing' ? (
              <Controller
                name='client'
                control={control}
                render={({ field }) => (
                  <CustomAutocomplete
                    options={
                      initialClient && !(clients.data ?? []).some(c => c.id === initialClient.id)
                        ? [initialClient, ...(clients.data ?? [])]
                        : (clients.data ?? [])
                    }
                    loading={clients.isFetching}
                    value={field.value}
                    onChange={(_, value) => field.onChange(value)}
                    onInputChange={(_, value, reason) => reason === 'input' && setSearch(value)}
                    getOptionLabel={option => option.legalName}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    filterOptions={options => options}
                    noOptionsText={search ? 'No client matches. Switch to “New client”.' : 'No clients yet'}
                    renderOption={(props, option) => (
                      <li {...props} key={option.id}>
                        <div className='flex flex-col'>
                          <Typography color='text.primary'>{option.legalName}</Typography>
                          <Typography variant='body2' color='text.disabled'>
                            {option.billingEmail}
                          </Typography>
                        </div>
                      </li>
                    )}
                    renderInput={params => (
                      <CustomTextField
                        {...params}
                        label='Client'
                        placeholder='Search by legal name'
                        error={!!errors.client}
                        helperText={errors.client?.message}
                      />
                    )}
                  />
                )}
              />
            ) : (
              <div className='grid gap-4 grid-cols-1 sm:grid-cols-2'>
                <Controller
                  name='legalName'
                  control={control}
                  rules={{ validate: v => !!v.trim() || 'Legal name is required.' }}
                  render={({ field }) => (
                    <CustomTextField
                      {...field}
                      fullWidth
                      label='Legal name'
                      error={!!errors.legalName}
                      helperText={errors.legalName?.message}
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
                      helperText={errors.billingEmail?.message}
                    />
                  )}
                />
                <Controller
                  name='billingAddress'
                  control={control}
                  render={({ field }) => <CustomTextField {...field} fullWidth label='Billing address (optional)' />}
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
              </div>
            )}
          </div>

          <div className='flex flex-col gap-3'>
            <Typography variant='h6'>Billing & term</Typography>
            <div className='grid gap-4 grid-cols-1 sm:grid-cols-2'>
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
                      <MenuItem
                        key={c.value}
                        value={c.value}
                        disabled={billingType === 'MONTHLY_FIXED' && c.value === 'PER_VISIT'}
                      >
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
                    helperText={errors.endDate?.message ?? 'Leave empty for an open-ended contract'}
                  />
                )}
              />
            </div>
            <Controller
              name='autoRenew'
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Switch checked={field.value} onChange={e => field.onChange(e.target.checked)} />}
                  label='Auto-renew for another year when the end date passes'
                />
              )}
            />
          </div>
        </DialogContent>
        <DialogActions>
          <Button variant='tonal' color='secondary' onClick={onClose}>
            Cancel
          </Button>
          <Button variant='contained' type='submit' disabled={saving}>
            {saving ? 'Creating…' : 'Create draft'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export default CreateContractDialog
