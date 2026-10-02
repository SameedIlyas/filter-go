'use client'

// React Imports
import { useEffect, useState } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { InvoiceDetail } from '@/types/invoiceTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useClientQuery } from '@/libs/api/queries/contracts'
import { safePayUrl, useOrgQuery, useUpdateInvoice } from '@/libs/api/queries/invoices'

import { paymentTermsLabel } from '../../contracts/shared'
import { nextStep } from '../logic/actions'
import { formatDay } from '../shared'
import LinesTable from './LinesTable'
import PaymentsList from './PaymentsList'

const MAX_MEMO = 2000

type Props = { invoice: InvoiceDetail; isAdmin: boolean; editable: boolean; onAddLine: () => void }

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className='grid grid-cols-[140px_1fr] items-center gap-3 min-bs-[38px]'>
    <Typography color='text.secondary'>{label}</Typography>
    <div>{children}</div>
  </div>
)

/** Bill from (the organization) and bill to (the client, with its billing email and address for admins). */
const Parties = ({ invoice, isAdmin }: Pick<Props, 'invoice' | 'isAdmin'>) => {
  const org = useOrgQuery()
  const client = useClientQuery(isAdmin ? invoice.client.id : undefined)

  return (
    <div className='grid gap-6 sm:grid-cols-[1fr_1fr_auto]'>
      <div className='flex flex-col gap-1'>
        <Typography variant='overline' color='text.disabled'>
          Bill from
        </Typography>
        <Typography className='font-medium'>{org.data?.name ?? '…'}</Typography>
      </div>
      <div className='flex flex-col gap-1'>
        <Typography variant='overline' color='text.disabled'>
          Bill to
        </Typography>
        <Typography className='font-medium'>{invoice.client.legalName}</Typography>
        {client.data?.billingAddress && (
          <Typography color='text.secondary' className='whitespace-pre-line'>
            {client.data.billingAddress}
          </Typography>
        )}
        {client.data?.billingEmail && <Typography color='text.secondary'>Email: {client.data.billingEmail}</Typography>}
      </div>
      <div className='flex flex-col gap-1 sm:items-end'>
        <Typography variant='overline' color='text.disabled'>
          Invoice number
        </Typography>
        <Typography className='font-medium'>{invoice.invoiceNumber}</Typography>
        {isAdmin && client.data && (
          <Typography color='text.secondary'>{paymentTermsLabel(client.data.paymentTerms)}</Typography>
        )}
      </div>
    </div>
  )
}

/** Due date and memo: the only header fields a draft may change. Saved together. */
const BillingDetails = ({ invoice, editable }: Pick<Props, 'invoice' | 'editable'>) => {
  const update = useUpdateInvoice(invoice.id)
  const [dueDate, setDueDate] = useState(invoice.dueDate)
  const [memo, setMemo] = useState(invoice.notes ?? '')

  useEffect(() => {
    setDueDate(invoice.dueDate)
    setMemo(invoice.notes ?? '')
  }, [invoice.dueDate, invoice.notes])

  const dirty = dueDate !== invoice.dueDate || memo.trim() !== (invoice.notes ?? '')
  const dueError = dueDate < invoice.issueDate ? 'Cannot be before the issue date.' : null

  const save = async () => {
    if (dueError) return

    try {
      await update.mutateAsync({
        ...(dueDate !== invoice.dueDate ? { dueDate } : {}),
        ...(memo.trim() !== (invoice.notes ?? '') ? { notes: memo.trim() || null } : {})
      })
      toast.success('Invoice updated')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <div className='flex flex-col gap-2'>
      <Typography variant='h6'>Billing details</Typography>
      <Row label='Issue date'>{formatDay(invoice.issueDate)}</Row>
      <Row label='Period'>
        {formatDay(invoice.periodStart)} – {formatDay(invoice.periodEnd)}
      </Row>
      <Row label='Due date'>
        {editable ? (
          <CustomTextField
            type='date'
            size='small'
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            error={Boolean(dueError)}
            helperText={dueError ?? undefined}
            slotProps={{ htmlInput: { min: invoice.issueDate } }}
          />
        ) : (
          formatDay(invoice.dueDate)
        )}
      </Row>
      {(editable || invoice.notes) && (
        <div className='flex flex-col gap-2 mbs-2'>
          <Typography color='text.secondary'>Invoice memo</Typography>
          {editable ? (
            <CustomTextField
              fullWidth
              multiline
              minRows={2}
              placeholder='Internal note about this invoice (optional)'
              value={memo}
              onChange={e => setMemo(e.target.value.slice(0, MAX_MEMO))}
              helperText={`${memo.length}/${MAX_MEMO}`}
            />
          ) : (
            <Typography className='whitespace-pre-line'>{invoice.notes}</Typography>
          )}
        </div>
      )}
      {editable && dirty && (
        <div className='flex justify-end gap-2'>
          <Button
            variant='tonal'
            color='secondary'
            size='small'
            onClick={() => {
              setDueDate(invoice.dueDate)
              setMemo(invoice.notes ?? '')
            }}
          >
            Discard
          </Button>
          <Button
            variant='contained'
            size='small'
            onClick={() => void save()}
            disabled={update.isPending || Boolean(dueError)}
          >
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      )}
    </div>
  )
}

/** Unbilled work the run noticed: entries still in review and no-shows are left out of the invoice. */
const FlagsAlert = ({ invoice }: { invoice: InvoiceDetail }) => {
  const unapproved = invoice.flags?.unapprovedTimesheets ?? 0
  const noShows = invoice.flags?.noShows ?? 0

  if (invoice.status !== 'DRAFT' || unapproved + noShows === 0) return null

  return (
    <Alert severity='warning'>
      {unapproved > 0 &&
        `${unapproved} timesheet${unapproved === 1 ? ' was' : 's were'} not approved yet and ${unapproved === 1 ? 'is' : 'are'} not billed. `}
      {noShows > 0 && `${noShows} no-show${noShows === 1 ? '' : 's'} in the period, not billed. `}
      Approve the timesheets, then delete this draft and run it again to include them.
    </Alert>
  )
}

/** The invoice as a document: parties, contract, billing details, lines and totals, payments. */
const InvoiceDocument = ({ invoice, isAdmin, editable, onAddLine }: Props) => {
  const step = isAdmin ? nextStep(invoice) : null

  return (
    <div className='flex flex-col gap-6'>
      {step && (
        <Alert
          severity={
            invoice.sync?.accounting.state === 'DEAD' || invoice.sync?.payment.state === 'DEAD' ? 'error' : 'info'
          }
          icon={<i className='bx-info-circle' />}
        >
          {step}
          {(invoice.sync?.accounting.lastError || invoice.sync?.payment.lastError) && (
            <Typography variant='body2' className='mbs-1'>
              Last error: {invoice.sync?.accounting.lastError ?? invoice.sync?.payment.lastError}
            </Typography>
          )}
        </Alert>
      )}
      <FlagsAlert invoice={invoice} />
      <Parties invoice={invoice} isAdmin={isAdmin} />
      <Divider />
      <div className='flex flex-col gap-2'>
        <Typography variant='h6'>Contract details</Typography>
        <Row label='Client'>{invoice.client.legalName}</Row>
        <Row label='Contract'>
          <Chip
            size='small'
            variant='outlined'
            label={`${invoice.contract.contractNumber} v${invoice.contract.version}`}
          />
        </Row>
        {invoice.accountingRef && <Row label='Accounting ref'>{invoice.accountingRef}</Row>}
        {safePayUrl(invoice.paymentUrl) && (
          <Row label='Pay link'>
            <a
              href={safePayUrl(invoice.paymentUrl) ?? undefined}
              target='_blank'
              rel='noopener noreferrer'
              className='text-primary break-all'
            >
              Open the client&apos;s payment page
            </a>
          </Row>
        )}
      </div>
      <Divider />
      <BillingDetails invoice={invoice} editable={editable} />
      <Divider />
      <LinesTable invoice={invoice} isAdmin={isAdmin} editable={editable} onAddLine={onAddLine} />
      {(invoice.payments.length > 0 || ['SYNCED', 'SENT', 'PARTIALLY_PAID', 'PAID'].includes(invoice.status)) && (
        <>
          <Divider />
          <PaymentsList invoice={invoice} isAdmin={isAdmin} />
        </>
      )}
    </div>
  )
}

export default InvoiceDocument
