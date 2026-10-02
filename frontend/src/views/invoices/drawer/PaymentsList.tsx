'use client'

// MUI Imports
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'

// Type Imports
import type { InvoiceDetail } from '@/types/invoiceTypes'

import { formatMoney } from '../shared'

const formatReceived = (instant: string) =>
  new Date(instant).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

/** Money received so far, oldest first. Stripe payments arrive by webhook; the rest were recorded by an admin. */
const PaymentsList = ({ invoice, isAdmin }: { invoice: InvoiceDetail; isAdmin: boolean }) => (
  <div className='flex flex-col gap-3'>
    <Typography variant='h6'>Payments</Typography>
    {invoice.payments.length === 0 ? (
      <Typography color='text.secondary'>No payments yet.</Typography>
    ) : (
      <div className='flex flex-col divide-y border rounded'>
        {invoice.payments.map(payment => (
          <div key={payment.id} className='flex flex-wrap items-center justify-between gap-3 p-3'>
            <div className='flex flex-col'>
              <Typography className='font-medium'>{formatMoney(payment.amount)}</Typography>
              <Typography variant='body2' color='text.secondary'>
                {payment.method === 'stripe' ? 'Card (Stripe)' : payment.method} · {formatReceived(payment.receivedAt)}
                {payment.externalRef ? ` · Ref ${payment.externalRef}` : ''}
              </Typography>
            </div>
            {isAdmin && (
              <Chip
                size='small'
                variant='tonal'
                color={payment.accountingSyncedAt ? 'success' : 'secondary'}
                label={payment.accountingSyncedAt ? 'In accounting' : 'Posting to accounting'}
              />
            )}
          </div>
        ))}
      </div>
    )}
  </div>
)

export default PaymentsList
