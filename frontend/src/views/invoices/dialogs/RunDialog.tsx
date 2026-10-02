'use client'

// React Imports
import { useEffect, useMemo, useState } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
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
import type { ContractStatus } from '@/types/contractTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { BffError, errorMessage } from '@/libs/api/bff'
import { useClientsQuery, useContractsQuery } from '@/libs/api/queries/contracts'
import { useRunInvoice } from '@/libs/api/queries/invoices'

import { billingTypeLabel } from '../../contracts/shared'
import { periodDays, periodError, previousMonth } from '../logic/period'

/** The server refuses runs on contracts that were never signed. */
const BILLABLE: ContractStatus[] = ['ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED']

type Props = {
  open: boolean
  onClose: () => void

  /** The new draft, or the existing invoice that already covers the period. */
  onOpenInvoice: (id: string) => void
}

/** What went wrong with a run, in words, plus the invoice to open when one already covers the period. */
const runProblem = (error: unknown): { message: string; invoiceId?: string } => {
  if (error instanceof BffError && error.code === 'NOTHING_TO_INVOICE') {
    const context = (error.details?.context ?? {}) as { unapprovedTimesheets?: number; noShows?: number }
    const waiting = context.unapprovedTimesheets ?? 0

    return {
      message: waiting
        ? `Nothing approved to bill in this period. ${waiting} timesheet${waiting === 1 ? ' is' : 's are'} still waiting for review.`
        : 'Nothing to bill in this period: no approved, billable work and no fixed fees.'
    }
  }

  if (error instanceof BffError && error.code === 'DUPLICATE') {
    const invoiceId = (error.details?.context as { invoiceId?: string } | undefined)?.invoiceId

    return { message: error.message, invoiceId }
  }

  return { message: errorMessage(error) }
}

/**
 * Create invoice: an invoice run bills one contract for a period from its approved timesheets (hourly, per visit) or
 * its fixed fees (monthly). The result is a DRAFT to check before approving.
 */
const RunDialog = ({ open, onClose, onOpenInvoice }: Props) => {
  const run = useRunInvoice()
  const clients = useClientsQuery()
  const [clientId, setClientId] = useState('')
  const [contractId, setContractId] = useState('')
  const [period, setPeriod] = useState(() => previousMonth(new Date()))
  const [problem, setProblem] = useState<{ message: string; invoiceId?: string } | null>(null)

  const contracts = useContractsQuery({ clientId: clientId || undefined, latestOnly: 'true', limit: 100 })

  const billable = useMemo(
    () => (clientId ? (contracts.data?.contracts ?? []).filter(contract => BILLABLE.includes(contract.status)) : []),
    [clientId, contracts.data]
  )

  const contract = billable.find(item => item.id === contractId)

  useEffect(() => {
    if (!open) return

    setClientId('')
    setContractId('')
    setPeriod(previousMonth(new Date()))
    setProblem(null)
  }, [open])

  const periodProblem = periodError(period.start, period.end)

  const submit = async () => {
    if (!contractId || periodProblem) return

    setProblem(null)

    try {
      const invoice = await run.mutateAsync({ contractId, periodStart: period.start, periodEnd: period.end })

      toast.success(`Draft ${invoice.invoiceNumber} created`)
      onClose()
      onOpenInvoice(invoice.id)
    } catch (error) {
      setProblem(runProblem(error))
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>Create invoice</DialogTitle>
      <DialogContent className='flex flex-col gap-4'>
        <Typography color='text.secondary'>
          Bills a contract for a period from its approved timesheets, or its fixed monthly fees. You get a draft to
          check before anything is sent.
        </Typography>
        <CustomTextField
          select
          fullWidth
          label='Client'
          value={clientId}
          onChange={e => {
            setClientId(e.target.value)
            setContractId('')
          }}
          slotProps={{ select: { displayEmpty: true } }}
        >
          <MenuItem value='' disabled>
            Select a client
          </MenuItem>
          {(clients.data ?? []).map(client => (
            <MenuItem key={client.id} value={client.id}>
              {client.legalName}
            </MenuItem>
          ))}
        </CustomTextField>
        <CustomTextField
          select
          fullWidth
          label='Contract'
          value={contractId}
          disabled={!clientId}
          onChange={e => setContractId(e.target.value)}
          slotProps={{ select: { displayEmpty: true } }}
          helperText={
            clientId && !contracts.isFetching && billable.length === 0 ? 'This client has no signed contracts.' : ' '
          }
        >
          <MenuItem value='' disabled>
            {clientId ? 'Select a contract' : 'Pick a client first'}
          </MenuItem>
          {billable.map(item => (
            <MenuItem key={item.id} value={item.id}>
              {item.contractNumber} v{item.version} · {billingTypeLabel(item.billingType)}
              {item.status !== 'ACTIVE' ? ` · ${item.status.toLowerCase()}` : ''}
            </MenuItem>
          ))}
        </CustomTextField>
        <div className='flex flex-wrap gap-4'>
          <CustomTextField
            type='date'
            label='Period start'
            className='flex-1 min-is-[160px]'
            value={period.start}
            onChange={e => setPeriod(current => ({ ...current, start: e.target.value }))}
            slotProps={{ htmlInput: { max: period.end } }}
          />
          <CustomTextField
            type='date'
            label='Period end'
            className='flex-1 min-is-[160px]'
            value={period.end}
            onChange={e => setPeriod(current => ({ ...current, end: e.target.value }))}
            slotProps={{ htmlInput: { min: period.start } }}
          />
        </div>
        <Typography variant='body2' color={periodProblem ? 'error' : 'text.secondary'}>
          {periodProblem ??
            `${periodDays(period.start, period.end)} days${contract ? `, billed ${billingTypeLabel(contract.billingType).toLowerCase()}` : ''}.`}
        </Typography>
        {problem && (
          <Alert
            severity='warning'
            action={
              problem.invoiceId ? (
                <Button
                  color='inherit'
                  size='small'
                  onClick={() => {
                    onClose()
                    onOpenInvoice(problem.invoiceId ?? '')
                  }}
                >
                  Open it
                </Button>
              ) : undefined
            }
          >
            {problem.message}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant='tonal' color='secondary' onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant='contained'
          onClick={() => void submit()}
          disabled={!contractId || Boolean(periodProblem) || run.isPending}
        >
          {run.isPending ? 'Creating…' : 'Create draft'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default RunDialog
