'use client'

// MUI Imports
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'

// Type Imports
import type { InvoiceDetail, TraceLine } from '@/types/invoiceTypes'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useInvoiceTrace, useOrgQuery } from '@/libs/api/queries/invoices'

// Util Imports
import { downloadCsv } from '@/utils/csv'

import { reconciliationCsv } from '../logic/csv'
import { formatMoney } from '../shared'

const timeIn = (instant: string | null | undefined, zone: string) =>
  instant
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      }).format(new Date(instant))
    : '—'

const hours = (minutes: number | null) => (minutes === null ? '—' : `${(minutes / 60).toFixed(2)} h`)

/** One billed line and the work behind it. */
const TraceItem = ({ line, zone }: { line: TraceLine; zone: string }) => (
  <div className='flex flex-col gap-2 border rounded p-4'>
    <div className='flex flex-wrap items-start justify-between gap-2'>
      <Typography className='font-medium'>{line.description}</Typography>
      <Typography className='font-medium whitespace-nowrap'>{formatMoney(line.amount)}</Typography>
    </div>
    {line.timesheet ? (
      <div className='grid gap-x-6 gap-y-1 sm:grid-cols-2'>
        <Typography variant='body2' color='text.secondary'>
          Worker: <span className='text-textPrimary'>{line.timesheet.worker.name ?? 'Unknown'}</span>
        </Typography>
        <Typography variant='body2' color='text.secondary'>
          Scheduled:{' '}
          <span className='text-textPrimary'>
            {timeIn(line.shift?.scheduledStart, zone)} – {timeIn(line.shift?.scheduledEnd, zone).split(', ').pop()}
          </span>
        </Typography>
        <Typography variant='body2' color='text.secondary'>
          Clocked:{' '}
          <span className='text-textPrimary'>
            {timeIn(line.timesheet.clockIn?.at, zone)} – {timeIn(line.timesheet.clockOut?.at, zone).split(', ').pop()}
          </span>
        </Typography>
        <Typography variant='body2' color='text.secondary'>
          Worked: <span className='text-textPrimary'>{hours(line.timesheet.actualMinutes)}</span> (break{' '}
          {line.timesheet.breakMinutes} min)
        </Typography>
      </div>
    ) : (
      <Typography variant='body2' color='text.secondary'>
        {line.sourceType === 'MANUAL'
          ? 'Added by hand.'
          : line.sourceType === 'CONTRACT_LINE'
            ? 'Fixed fee from the contract.'
            : line.shift
              ? `Visit at ${line.shift.siteName}, ${timeIn(line.shift.scheduledStart, zone)}`
              : 'No linked work.'}
      </Typography>
    )}
    <div className='flex flex-wrap gap-2'>
      {line.contract && (
        <Chip size='small' variant='outlined' label={`${line.contract.number} v${line.contract.version}`} />
      )}
      {line.timesheet?.autoClosed && <Chip size='small' variant='tonal' color='warning' label='Auto-closed' />}
      {line.shift?.isExtra && <Chip size='small' variant='tonal' color='warning' label='Extra shift' />}
      {line.workLogPhotos.length > 0 && (
        <Chip
          size='small'
          variant='tonal'
          label={`${line.workLogPhotos.length} photo${line.workLogPhotos.length === 1 ? '' : 's'}`}
        />
      )}
      {line.lead && <Chip size='small' variant='tonal' color='secondary' label={`Lead: ${line.lead.companyName}`} />}
    </div>
  </div>
)

/** Every line traced back to its timesheet, shift and contract: the answer to "what is this charge for?". */
const TraceTab = ({ invoice }: { invoice: InvoiceDetail }) => {
  const trace = useInvoiceTrace(invoice.id)
  const org = useOrgQuery()
  const zone = org.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone

  if (trace.isLoading) return <Skeleton variant='rounded' height={200} />
  if (trace.isError) return <Alert severity='error'>{errorMessage(trace.error)}</Alert>
  if (!trace.data?.lines.length) return <Typography color='text.secondary'>No lines to trace.</Typography>

  const data = trace.data

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Typography color='text.secondary'>Times in {zone}.</Typography>
        <Button
          size='small'
          variant='tonal'
          startIcon={<i className='bx-download' />}
          onClick={() =>
            downloadCsv(
              `${invoice.invoiceNumber}_reconciliation.csv`,
              reconciliationCsv([{ invoice, trace: data }], zone)
            )
          }
        >
          Export CSV
        </Button>
      </div>
      {data.lines.map(line => (
        <TraceItem key={line.lineId} line={line} zone={zone} />
      ))}
    </div>
  )
}

export default TraceTab
