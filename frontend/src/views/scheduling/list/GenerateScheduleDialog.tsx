'use client'

// React Imports
import { useEffect, useState } from 'react'

// Next Imports
import { useRouter } from 'next/navigation'

// MUI Imports
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import MenuItem from '@mui/material/MenuItem'

// Third-party Imports
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'react-toastify'

// Type Imports
import type { ContractSummary } from '@/types/contractTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import CustomAutocomplete from '@core/components/mui/Autocomplete'

// Lib Imports
import { useContractsQuery } from '@/libs/api/queries/contracts'
import { useGenerateSchedule, useStaffOptions } from '@/libs/api/queries/scheduling'

import GeneratePlan from './GeneratePlan'
import { toastSchedulingError } from '../notify'
import { defaultPeriod } from '../logic/generatePreview'
import { todayKey } from '../logic/zoned'

type FormValues = {
  contract: ContractSummary | null
  siteId: string
  periodStart: string
  periodEnd: string
  supervisorId: string
}

const defaults = (): FormValues => ({ contract: null, siteId: '', supervisorId: '', ...defaultPeriod(todayKey()) })

const contractLabel = (contract: ContractSummary) => `${contract.contractNumber} v${contract.version}`

type Props = {
  open: boolean
  onClose: () => void
}

/**
 * Generate a DRAFT schedule for one site of an active contract (docs/ARCHITECTURE.md 5.3). The preview mirrors the
 * backend's rules so problems show before submitting; the server still decides (e.g. SCHEDULE_OVERLAP).
 */
const GenerateScheduleDialog = ({ open, onClose }: Props) => {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [blocked, setBlocked] = useState(true)

  const contracts = useContractsQuery({
    status: 'ACTIVE',
    latestOnly: 'true',
    q: search.trim() || undefined,
    limit: 20
  })

  const staff = useStaffOptions(open)
  const generate = useGenerateSchedule()

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors }
  } = useForm<FormValues>({ defaultValues: defaults() })

  useEffect(() => {
    if (open) {
      reset(defaults())
      setSearch('')
    }
  }, [open, reset])

  const contract = watch('contract')
  const siteId = watch('siteId')
  const periodStart = watch('periodStart')
  const periodEnd = watch('periodEnd')
  const supervisors = (staff.data ?? []).filter(user => user.role === 'SUPERVISOR')

  const onSubmit = async (values: FormValues) => {
    if (!values.contract || !values.siteId) return

    try {
      const { schedule, shiftCount } = await generate.mutateAsync({
        contractId: values.contract.id,
        siteId: values.siteId,
        periodStart: values.periodStart,
        periodEnd: values.periodEnd,
        ...(values.supervisorId ? { supervisorId: values.supervisorId } : {})
      })

      toast.success(`Schedule generated with ${shiftCount} shift${shiftCount === 1 ? '' : 's'}`)
      onClose()
      router.push(`/schedules/${schedule.id}`)
    } catch (error) {
      toastSchedulingError(error)
    }
  }

  const periodFields = (
    <>
      <div className='grid gap-4 grid-cols-1 sm:grid-cols-2'>
        <Controller
          name='periodStart'
          control={control}
          rules={{ required: 'Start date is required.' }}
          render={({ field }) => (
            <CustomTextField
              {...field}
              fullWidth
              type='date'
              label='Period start'
              slotProps={{ inputLabel: { shrink: true } }}
              error={!!errors.periodStart}
              helperText={errors.periodStart?.message}
            />
          )}
        />
        <Controller
          name='periodEnd'
          control={control}
          rules={{ required: 'End date is required.' }}
          render={({ field }) => (
            <CustomTextField
              {...field}
              fullWidth
              type='date'
              label='Period end'
              slotProps={{ inputLabel: { shrink: true } }}
              error={!!errors.periodEnd}
              helperText={errors.periodEnd?.message}
            />
          )}
        />
      </div>
      <Controller
        name='supervisorId'
        control={control}
        render={({ field }) => (
          <CustomTextField
            {...field}
            select
            fullWidth
            label='Supervisor (optional)'
            slotProps={{ select: { displayEmpty: true } }}
          >
            <MenuItem value=''>No supervisor</MenuItem>
            {supervisors.map(user => (
              <MenuItem key={user.id} value={user.id}>
                {user.name}
              </MenuItem>
            ))}
          </CustomTextField>
        )}
      />
    </>
  )

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>Generate schedule</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogContent className='flex flex-col gap-5'>
          <Typography color='text.secondary'>
            Creates a <b>draft</b> with open shifts from the contract&apos;s coverage. Assign people, then publish it.
          </Typography>

          <Controller
            name='contract'
            control={control}
            rules={{ required: 'Pick a contract.' }}
            render={({ field }) => (
              <CustomAutocomplete
                options={contracts.data?.contracts ?? []}
                loading={contracts.isFetching}
                value={field.value}
                onChange={(_, value) => {
                  field.onChange(value)
                  setValue('siteId', '')
                }}
                onInputChange={(_, value, reason) => reason === 'input' && setSearch(value)}
                getOptionLabel={contractLabel}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                filterOptions={options => options}
                noOptionsText={search ? 'No active contract matches' : 'No active contracts'}
                renderOption={(props, option) => (
                  <li {...props} key={option.id}>
                    <div className='flex flex-col'>
                      <Typography color='text.primary'>{contractLabel(option)}</Typography>
                      <Typography variant='body2' color='text.disabled'>
                        {option.client.legalName}
                      </Typography>
                    </div>
                  </li>
                )}
                renderInput={params => (
                  <CustomTextField
                    {...params}
                    label='Contract'
                    placeholder='Search contract number or client'
                    error={!!errors.contract}
                    helperText={errors.contract?.message ?? (field.value ? field.value.client.legalName : undefined)}
                  />
                )}
              />
            )}
          />

          {contract ? (
            <GeneratePlan
              contract={contract}
              siteId={siteId}
              onSiteChange={value => setValue('siteId', value)}
              periodStart={periodStart}
              periodEnd={periodEnd}
              onBlockedChange={setBlocked}
            >
              {periodFields}
            </GeneratePlan>
          ) : (
            periodFields
          )}
        </DialogContent>
        <DialogActions>
          <Button variant='tonal' color='secondary' onClick={onClose}>
            Cancel
          </Button>
          <Button variant='contained' type='submit' disabled={generate.isPending || !contract || blocked}>
            {generate.isPending ? 'Generating…' : 'Generate'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export default GenerateScheduleDialog
