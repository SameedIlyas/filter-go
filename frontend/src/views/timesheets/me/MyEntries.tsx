'use client'

// React Imports
import { useState } from 'react'

// MUI Imports
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Divider from '@mui/material/Divider'
import LinearProgress from '@mui/material/LinearProgress'
import MenuItem from '@mui/material/MenuItem'
import Pagination from '@mui/material/Pagination'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { Theme } from '@mui/material/styles'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { Timesheet, TimesheetStatus } from '@/types/timesheetTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useMyTimesheets, useResubmitTimesheet } from '@/libs/api/queries/timesheets'

import { canAddWorkLog, workerActions } from '../logic/actions'
import { formatMinutes } from '../logic/format'
import { clockRange } from '../logic/times'
import { ExceptionChip, TIMESHEET_STATUSES, TIMESHEET_STATUS_META, TimesheetStatusChip, formatEntryDay } from '../shared'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

const PAGE_SIZE = 20

export type EntryHandlers = { onCorrect: (entry: Timesheet) => void; onWorkLog: (shiftId: string) => void }

/** The worker's buttons for one entry: correct a rejected one, resubmit a corrected one, log work on a recent shift. */
export const EntryActions = ({ entry, onCorrect, onWorkLog }: EntryHandlers & { entry: Timesheet }) => {
  const resubmit = useResubmitTimesheet()
  const actions = workerActions(entry)

  const onResubmit = async () => {
    try {
      await resubmit.mutateAsync(entry.id)
      toast.success('Sent back to your supervisor')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <div className='flex flex-wrap justify-end gap-2'>
      {actions.canCorrect && (
        <Button size='small' variant='contained' onClick={() => onCorrect(entry)}>
          Correct
        </Button>
      )}
      {actions.canResubmit && (
        <Button size='small' variant='contained' onClick={onResubmit} disabled={resubmit.isPending}>
          {resubmit.isPending ? 'Sending…' : 'Resubmit'}
        </Button>
      )}
      {canAddWorkLog(entry.shift, entry, Date.now()) && (
        <Button size='small' variant='tonal' onClick={() => onWorkLog(entry.shiftId)}>
          Add work log
        </Button>
      )}
    </div>
  )
}

const Exceptions = ({ entry }: { entry: Timesheet }) => (
  <div className='flex flex-wrap gap-1'>
    {entry.exceptions
      .filter(exception => !exception.resolved)
      .map(exception => (
        <ExceptionChip key={exception.id} exception={exception} />
      ))}
  </div>
)

/** Phones: one card per entry. */
const EntryCard = ({ entry, ...handlers }: EntryHandlers & { entry: Timesheet }) => (
  <div className='flex flex-col gap-2 p-4'>
    <div className='flex items-start justify-between gap-2'>
      <div className='flex flex-col'>
        <Typography className='font-medium' color='text.primary'>
          {entry.site.name}
        </Typography>
        <Typography variant='body2'>
          {formatEntryDay(entry.shift.scheduledStart, entry.site.timezone)} · {clockRange(entry, entry.site.timezone)}
        </Typography>
      </div>
      <TimesheetStatusChip status={entry.status} />
    </div>
    <Typography variant='body2' color='text.secondary'>
      Worked {formatMinutes(entry.actualMinutes)} · break {entry.breakMinutes}m
    </Typography>
    <Exceptions entry={entry} />
    <EntryActions entry={entry} {...handlers} />
  </div>
)

const COLUMNS = ['Day', 'Site', 'Clocked', 'Break', 'Worked', 'Status', '']

const EntryTable = ({ rows, loading, ...handlers }: EntryHandlers & { rows: Timesheet[]; loading: boolean }) => (
  <div className='overflow-x-auto'>
    <table className={tableStyles.table}>
      <thead>
        <tr>
          {COLUMNS.map(column => (
            <th key={column}>{column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {loading &&
          [0, 1, 2].map(i => (
            <tr key={i}>
              {COLUMNS.map((_, j) => (
                <td key={j}>
                  <Skeleton />
                </td>
              ))}
            </tr>
          ))}
        {rows.map(entry => (
          <tr key={entry.id}>
            <td>{formatEntryDay(entry.shift.scheduledStart, entry.site.timezone)}</td>
            <td>{entry.site.name}</td>
            <td className='whitespace-nowrap'>{clockRange(entry, entry.site.timezone)}</td>
            <td>{entry.breakMinutes}m</td>
            <td>{formatMinutes(entry.actualMinutes)}</td>
            <td>
              <div className='flex flex-col items-start gap-1'>
                <TimesheetStatusChip status={entry.status} />
                <Exceptions entry={entry} />
              </div>
            </td>
            <td>
              <EntryActions entry={entry} {...handlers} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

/** My timesheet history, newest shift first, with a status filter. A table on wide screens, cards on phones. */
const MyEntries = (handlers: EntryHandlers) => {
  const isPhone = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'))
  const [status, setStatus] = useState<TimesheetStatus | ''>('')
  const [page, setPage] = useState(1)
  const entries = useMyTimesheets({ status: status || undefined, page, limit: PAGE_SIZE })

  const rows = entries.data?.items ?? []
  const totalPages = entries.data?.meta.totalPages ?? 1

  return (
    <Card>
      <div className='flex flex-wrap items-center justify-between gap-4 p-6'>
        <Typography variant='h5'>History</Typography>
        <CustomTextField
          select
          className='min-is-[180px]'
          value={status}
          onChange={event => {
            setStatus(event.target.value as TimesheetStatus | '')
            setPage(1)
          }}
          slotProps={{ select: { displayEmpty: true } }}
        >
          <MenuItem value=''>All statuses</MenuItem>
          {TIMESHEET_STATUSES.map(value => (
            <MenuItem key={value} value={value}>
              {TIMESHEET_STATUS_META[value].label}
            </MenuItem>
          ))}
        </CustomTextField>
      </div>
      {entries.isFetching && <LinearProgress className='bs-0.5' />}
      <Divider />
      {entries.isError && (
        <CardContent className='flex items-center justify-between gap-4'>
          <Typography color='error'>{errorMessage(entries.error)}</Typography>
          <Button variant='tonal' onClick={() => entries.refetch()}>
            Retry
          </Button>
        </CardContent>
      )}
      {!entries.isPending && rows.length === 0 ? (
        <CardContent className='flex flex-col items-center gap-2 plb-12'>
          <i className='bx-time-five text-5xl text-textDisabled' />
          <Typography variant='h6'>{status ? 'No timesheets with this status' : 'No timesheets yet'}</Typography>
          <Typography color='text.secondary'>Clock in to a shift and your hours show up here.</Typography>
        </CardContent>
      ) : isPhone ? (
        <div className='flex flex-col divide-y'>
          {entries.isPending ? <Skeleton variant='rounded' height={120} className='m-4' /> : rows.map(entry => <EntryCard key={entry.id} entry={entry} {...handlers} />)}
        </div>
      ) : (
        <EntryTable rows={rows} loading={entries.isPending} {...handlers} />
      )}
      {totalPages > 1 && (
        <div className='flex justify-center p-4'>
          <Pagination count={totalPages} page={page} onChange={(_event, next) => setPage(next)} shape='rounded' color='primary' />
        </div>
      )}
    </Card>
  )
}

export default MyEntries
