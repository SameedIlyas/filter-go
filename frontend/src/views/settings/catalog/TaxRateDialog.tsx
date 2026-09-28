'use client'

// React Imports
import { useEffect } from 'react'

// MUI Imports
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import InputAdornment from '@mui/material/InputAdornment'

// Third-party Imports
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'react-toastify'

// Type Imports
import type { TaxRate } from '@/types/contractTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { BffError, errorMessage } from '@/libs/api/bff'
import { usePutTaxRate } from '@/libs/api/queries/contracts'

// Mirrors the backend: taxCodeField and ratePercentField (catalog.routes.ts)
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_.-]{0,31}$/
const RATE_PATTERN = /^\d{1,3}(\.\d{1,3})?$/

type FormValues = { code: string; ratePercent: string }

type Props = {
  open: boolean

  /** Edit this rate (code is fixed); omit to add a new one. */
  taxRate?: TaxRate | null

  /** Codes already on file, so "add" does not silently overwrite one (PUT is an upsert). */
  existingCodes: string[]
  onClose: () => void
}

/** "8.250" -> "8.25" for display and editing. */
export const formatRate = (ratePercent: string) => String(Number(ratePercent))

const validateCode = (existingCodes: string[], editing: boolean) => (value: string) => {
  const code = value.trim().toUpperCase()

  if (!code) return 'Code is required.'
  if (!CODE_PATTERN.test(code)) return 'Use 1-32 letters, digits, "_", "." or "-", starting with a letter or digit.'
  if (!editing && existingCodes.includes(code)) return `${code} already exists. Edit it instead.`

  return true
}

const validateRate = (value: string) => {
  const rate = value.trim()

  if (!rate) return 'Rate is required.'
  if (!RATE_PATTERN.test(rate)) return 'Enter a percentage with at most 3 decimals, e.g. 8.25.'

  return Number(rate) <= 100 || 'A tax rate cannot exceed 100%.'
}

/** Adds or changes a tax rate (PUT /tax-rates/:code, an upsert). */
const TaxRateDialog = ({ open, taxRate, existingCodes, onClose }: Props) => {
  const putTaxRate = usePutTaxRate()
  const editing = !!taxRate

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors }
  } = useForm<FormValues>({ defaultValues: { code: '', ratePercent: '' } })

  useEffect(() => {
    if (open) reset({ code: taxRate?.code ?? '', ratePercent: taxRate ? formatRate(taxRate.ratePercent) : '' })
  }, [open, taxRate, reset])

  const onSubmit = async (values: FormValues) => {
    try {
      const saved = await putTaxRate.mutateAsync({
        code: values.code.trim().toUpperCase(),
        ratePercent: values.ratePercent.trim()
      })

      toast.success(`${saved.code} ${editing ? 'updated' : 'added'} at ${formatRate(saved.ratePercent)}%`)
      onClose()
    } catch (error) {
      if (error instanceof BffError) {
        error.details?.issues?.forEach(issue => {
          if (issue.field === 'code' || issue.field === 'ratePercent') setError(issue.field, { message: issue.message })
        })
      }

      toast.error(errorMessage(error))
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth='xs' fullWidth>
      <DialogTitle>{taxRate ? `Edit ${taxRate.code}` : 'New tax rate'}</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogContent className='flex flex-col gap-4'>
          <Controller
            name='code'
            control={control}
            rules={{ validate: validateCode(existingCodes, editing) }}
            render={({ field }) => (
              <CustomTextField
                {...field}
                onChange={e => field.onChange(e.target.value.toUpperCase())}
                autoFocus={!editing}
                fullWidth
                required
                label='Code'
                placeholder='e.g. GST or VAT-20'
                disabled={editing}
                error={!!errors.code}
                helperText={errors.code?.message ?? (editing ? 'The code cannot be changed.' : 'Stored upper-case.')}
                slotProps={{ htmlInput: { maxLength: 32 } }}
              />
            )}
          />
          <Controller
            name='ratePercent'
            control={control}
            rules={{ validate: validateRate }}
            render={({ field }) => (
              <CustomTextField
                {...field}
                autoFocus={editing}
                fullWidth
                required
                label='Rate'
                placeholder='8.25'
                error={!!errors.ratePercent}
                helperText={errors.ratePercent?.message ?? 'Between 0 and 100, up to 3 decimals.'}
                slotProps={{
                  htmlInput: { inputMode: 'decimal', maxLength: 7 },
                  input: { endAdornment: <InputAdornment position='end'>%</InputAdornment> }
                }}
              />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button variant='tonal' color='secondary' onClick={onClose}>
            Cancel
          </Button>
          <Button variant='contained' type='submit' disabled={putTaxRate.isPending}>
            {putTaxRate.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add tax rate'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export default TaxRateDialog
