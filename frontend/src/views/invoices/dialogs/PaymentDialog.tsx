'use client'

// React Imports
import { useEffect, useState } from 'react'

// MUI Imports
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { InvoiceDetail } from '@/types/invoiceTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useRecordPayment } from '@/libs/api/queries/invoices'

import { paymentAmountError } from '../logic/money'
import { isDay, isoDay } from '../logic/period'
import { formatMoney } from '../shared'

/** Card payments arrive through Stripe on their own; these are the ways money arrives by hand. */
const METHODS = ['Bank transfer', 'Check', 'Cash', 'ACH', 'Other']

type Props = { invoice: InvoiceDetail | null; onClose: () => void }

/** Noon local time on the chosen day: a received date without a meaningful time, safe from timezone edge shifts. */
const receivedAtOf = (day: string) => {
  const [year, month, date] = day.split('-').map(Number)

  return new Date(year, month - 1, date, 12).toISOString()
}

/** Record money received outside Stripe. A payment that clears the balance marks the invoice paid. */
const PaymentDialog = ({ invoice, onClose }: Props) => {
  const record = useRecordPayment(invoice?.id ?? '')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState(METHODS[0])
  const [day, setDay] = useState(isoDay(new Date()))
  const [reference, setReference] = useState('')
  const [touched, setTouched] = useState(false)

  // Reset only when a different invoice opens: a refetch (polling, a card payment arriving) must not wipe what was typed
  useEffect(() => {
    setAmount(invoice?.balance ?? '')
    setMethod(METHODS[0])
    setDay(isoDay(new Date()))
    setReference('')
    setTouched(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id])

  const today = isoDay(new Date())
  const amountError = touched && invoice ? paymentAmountError(amount, invoice.balance) : null
  const dayError = touched && (!isDay(day) || day > today) ? 'Pick a day up to today.' : null

  const submit = async () => {
    setTouched(true)

    if (!invoice || paymentAmountError(amount, invoice.balance) || !isDay(day) || day > today) return

    try {
      const updated = await record.mutateAsync({
        amount: amount.trim(),
        method,
        receivedAt: receivedAtOf(day),
        ...(reference.trim() ? { externalRef: reference.trim() } : {})
      })

      toast.success(
        updated.status === 'PAID'
          ? `${updated.invoiceNumber} is paid in full`
          : `Payment recorded; ${formatMoney(updated.balance)} still owed`
      )
      onClose()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <Dialog open={Boolean(invoice)} onClose={onClose} maxWidth='xs' fullWidth>
      <DialogTitle>Record a payment</DialogTitle>
      <DialogContent className='flex flex-col gap-4'>
        <Typography color='text.secondary'>
          {formatMoney(invoice?.balance)} is still owed on {invoice?.invoiceNumber}.
        </Typography>
        <CustomTextField
          autoFocus
          fullWidth
          label='Amount ($)'
          value={amount}
          onChange={e => setAmount(e.target.value)}
          error={Boolean(amountError)}
          helperText={amountError ?? ' '}
          slotProps={{ htmlInput: { inputMode: 'decimal' } }}
        />
        <CustomTextField select fullWidth label='Method' value={method} onChange={e => setMethod(e.target.value)}>
          {METHODS.map(item => (
            <MenuItem key={item} value={item}>
              {item}
            </MenuItem>
          ))}
        </CustomTextField>
        <CustomTextField
          type='date'
          fullWidth
          label='Received on'
          value={day}
          onChange={e => setDay(e.target.value)}
          error={Boolean(dayError)}
          helperText={dayError ?? ' '}
          slotProps={{ htmlInput: { max: today } }}
        />
        <CustomTextField
          fullWidth
          label='Reference (optional)'
          placeholder='Check number or transfer reference'
          value={reference}
          onChange={e => setReference(e.target.value.slice(0, 100))}
          helperText='The same reference cannot be recorded twice.'
        />
      </DialogContent>
      <DialogActions>
        <Button variant='tonal' color='secondary' onClick={onClose}>
          Cancel
        </Button>
        <Button variant='contained' color='success' onClick={() => void submit()} disabled={record.isPending}>
          {record.isPending ? 'Recording…' : 'Record payment'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default PaymentDialog
