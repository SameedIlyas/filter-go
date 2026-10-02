'use client'

// React Imports
import { useEffect, useState } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { toast } from 'react-toastify'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { fetchInvoiceTrace, useOrgQuery } from '@/libs/api/queries/invoices'

// Util Imports
import { downloadCsv } from '@/utils/csv'

import { reconciliationCsv } from '../logic/csv'
import { fetchAllInvoices, mapPooled } from '../logic/fetchAll'
import { periodError, previousMonth } from '../logic/period'

/** Each invoice costs one trace call; past this the export should be split into smaller ranges. */
const MAX_INVOICES = 300

type Props = { open: boolean; onClose: () => void }

/**
 * Invoice reconciliation export: for every invoice issued in a date range (voids left out), each billed line next to
 * the timesheet behind it (worker, clock stamps, hours), so accounts can tie charges back to the work.
 */
const ReconciliationDialog = ({ open, onClose }: Props) => {
  const org = useOrgQuery()
  const [range, setRange] = useState(() => previousMonth(new Date()))
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    setRange(previousMonth(new Date()))
    setProgress(null)
    setProblem(null)
  }, [open])

  const rangeError = periodError(range.start, range.end)
  const busy = progress !== null

  const run = async () => {
    if (rangeError || busy) return

    setProblem(null)
    setProgress({ done: 0, total: 0 })

    try {
      const { items, truncated } = await fetchAllInvoices({ from: range.start, to: range.end }, MAX_INVOICES + 50)
      const live = items.filter(invoice => invoice.status !== 'VOID')

      if (live.length === 0) {
        setProblem('No invoices were issued in this range.')

        return
      }

      // Truncated means some invoices were never fetched: refuse rather than export a partial file
      if (truncated || live.length > MAX_INVOICES) {
        setProblem(`More than ${MAX_INVOICES} invoices in this range. Pick a shorter range.`)

        return
      }

      setProgress({ done: 0, total: live.length })

      const traces = await mapPooled(
        live,
        4,
        invoice => fetchInvoiceTrace(invoice.id),
        done => setProgress({ done, total: live.length })
      )

      const zone = org.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone

      downloadCsv(
        `invoice_reconciliation_${range.start}_${range.end}.csv`,
        reconciliationCsv(
          live.map((invoice, index) => ({ invoice, trace: traces[index] })),
          zone
        )
      )
      toast.success(`Exported ${live.length} invoice${live.length === 1 ? '' : 's'}`)
      onClose()
    } catch (error) {
      setProblem(errorMessage(error))
    } finally {
      setProgress(null)
    }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth='xs' fullWidth>
      <DialogTitle>Export invoice reconciliation</DialogTitle>
      <DialogContent className='flex flex-col gap-4'>
        <Typography color='text.secondary'>
          Every line of the invoices issued in this range, with the worker, clock-in and clock-out and hours behind it.
          Voided invoices are left out.
        </Typography>
        <div className='flex gap-4'>
          <CustomTextField
            type='date'
            label='From'
            className='flex-1'
            value={range.start}
            disabled={busy}
            onChange={e => setRange(current => ({ ...current, start: e.target.value }))}
          />
          <CustomTextField
            type='date'
            label='To'
            className='flex-1'
            value={range.end}
            disabled={busy}
            onChange={e => setRange(current => ({ ...current, end: e.target.value }))}
          />
        </div>
        {rangeError && (
          <Typography color='error' variant='body2'>
            {rangeError}
          </Typography>
        )}
        {progress && (
          <div className='flex flex-col gap-1'>
            <LinearProgress
              variant={progress.total ? 'determinate' : 'indeterminate'}
              value={progress.total ? (progress.done / progress.total) * 100 : 0}
            />
            <Typography variant='body2' color='text.secondary'>
              {progress.total ? `${progress.done} of ${progress.total} invoices` : 'Finding invoices…'}
            </Typography>
          </div>
        )}
        {problem && <Alert severity='warning'>{problem}</Alert>}
        <Typography variant='body2' color='text.disabled'>
          Times are in {org.data?.timezone ?? 'your timezone'}.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button variant='tonal' color='secondary' onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant='contained'
          startIcon={<i className='bx-download' />}
          onClick={() => void run()}
          disabled={Boolean(rangeError) || busy}
        >
          {busy ? 'Exporting…' : 'Export'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default ReconciliationDialog
