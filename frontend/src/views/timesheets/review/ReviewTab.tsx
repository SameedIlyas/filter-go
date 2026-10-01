'use client'

// React Imports
import { useEffect, useMemo, useState } from 'react'

// MUI Imports
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Checkbox from '@mui/material/Checkbox'
import Divider from '@mui/material/Divider'
import LinearProgress from '@mui/material/LinearProgress'
import MenuItem from '@mui/material/MenuItem'
import Pagination from '@mui/material/Pagination'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { Timesheet } from '@/types/timesheetTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useApproveBatch, useApproveTimesheet, useTimesheetsQuery } from '@/libs/api/queries/timesheets'

import { reviewActions } from '../logic/actions'
import { formatMinutes } from '../logic/format'
import { instantRange } from '../logic/window'
import AdjustDialog from './AdjustDialog'
import { skippedSummary } from './batchSummary'
import RejectDialog from './RejectDialog'
import ReviewFilters from './ReviewFilters'
import ReviewRow, { REVIEW_COLUMNS, STICKY_END } from './ReviewRow'
import { useReviewFilters } from './useReviewFilters'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

const PAGE_SIZES = [10, 20, 50]

const HEADERS = ['Worker', 'Site', 'Shift', 'Clocked', 'Break', 'Worked', 'Exceptions', 'Status']

const EmptyRow = ({ isDefault }: { isDefault: boolean }) => (
  <tr>
    <td colSpan={REVIEW_COLUMNS} className='text-center plb-12'>
      <div className='flex flex-col items-center gap-2'>
        <i className='bx-time-five text-5xl text-textDisabled' />
        <Typography variant='h6'>
          {isDefault ? 'Nothing waiting for review this week' : 'No timesheets match these filters'}
        </Typography>
        <Typography color='text.secondary'>
          {isDefault ? 'Entries show up here when workers clock out.' : 'Try another period or clear the filters.'}
        </Typography>
      </div>
    </td>
  </tr>
)

const SkeletonRows = () =>
  [0, 1, 2, 3, 4].map(i => (
    <tr key={i}>
      {Array.from({ length: REVIEW_COLUMNS }).map((_, j) => (
        <td key={j}>
          <Skeleton />
        </td>
      ))}
    </tr>
  ))

/** Worked and scheduled totals for the rows on this page. */
const PageTotals = ({ rows }: { rows: Timesheet[] }) => {
  const worked = rows.reduce((sum, row) => sum + (row.actualMinutes ?? 0), 0)
  const scheduled = rows.reduce((sum, row) => sum + row.scheduledMinutes, 0)

  return (
    <Typography color='text.secondary'>
      This page: <span className='font-medium text-textPrimary'>{formatMinutes(worked)}</span> worked of{' '}
      {formatMinutes(scheduled)} scheduled
    </Typography>
  )
}

/** Batch approval of the selected rows; reports what the server skipped and why. */
const useBatch = (onDone: () => void) => {
  const batch = useApproveBatch()

  const run = async (ids: string[]) => {
    try {
      const result = await batch.mutateAsync(ids)
      const skipped = skippedSummary(result)

      if (result.approved.length)
        toast.success(`Approved ${result.approved.length} timesheet${result.approved.length === 1 ? '' : 's'}`)
      if (skipped) toast.warning(skipped)
      onDone()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return { run, busy: batch.isPending }
}

/** The review table: this week's submitted entries by default, filters in the URL, single and batch approval. */
const ReviewTab = ({ onOpen }: { onOpen: (timesheetId: string) => void }) => {
  const { filters, page, update, clear } = useReviewFilters()
  const [limit, setLimit] = useState(20)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [adjusting, setAdjusting] = useState<Timesheet | null>(null)
  const [rejecting, setRejecting] = useState<Timesheet | null>(null)

  const range = instantRange(filters.window)

  const query = useTimesheetsQuery({
    status: filters.status === 'all' ? undefined : filters.status,
    siteId: filters.siteId || undefined,
    userId: filters.userId || undefined,
    hasOpenExceptions: filters.openExceptions || undefined,
    from: range.from,
    to: range.to,
    page,
    limit
  })

  const approve = useApproveTimesheet()
  const batch = useBatch(() => setSelected(new Set()))

  const rows = useMemo(() => query.data?.items ?? [], [query.data])
  const batchable = useMemo(() => rows.filter(row => reviewActions(row).batchable).map(row => row.id), [rows])
  const meta = query.data?.meta

  // A new page or filter starts with nothing selected
  useEffect(() => setSelected(new Set()), [filters, page, limit])

  const toggle = (id: string) =>
    setSelected(current => {
      const next = new Set(current)

      if (next.has(id)) next.delete(id)
      else next.add(id)

      return next
    })

  const allSelected = batchable.length > 0 && batchable.every(id => selected.has(id))

  const approveOne = async (entry: Timesheet) => {
    try {
      await approve.mutateAsync(entry.id)
      toast.success(`Approved ${entry.user?.name ?? 'the'} timesheet`)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <>
      <Card>
        <ReviewFilters filters={filters} update={update} clear={clear} />
        {query.isFetching && <LinearProgress className='bs-0.5' />}
        <Divider />
        <div className='flex flex-wrap items-center justify-between gap-3 pli-6 plb-3'>
          <PageTotals rows={rows} />
          <Button
            variant='contained'
            color='success'
            startIcon={<i className='bx-check-double' />}
            disabled={selected.size === 0 || batch.busy}
            onClick={() => void batch.run([...selected])}
          >
            {batch.busy ? 'Approving…' : `Approve selected (${selected.size})`}
          </Button>
        </div>
        {query.isError && (
          <div className='p-6 flex items-center justify-between gap-4'>
            <Typography color='error'>{errorMessage(query.error)}</Typography>
            <Button variant='tonal' onClick={() => query.refetch()}>
              Retry
            </Button>
          </div>
        )}
        <div className='overflow-x-auto'>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>
                  <Checkbox
                    size='small'
                    checked={allSelected}
                    indeterminate={!allSelected && batchable.some(id => selected.has(id))}
                    disabled={batchable.length === 0}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(batchable))}
                    inputProps={{ 'aria-label': 'Select every entry that can be batch approved' }}
                  />
                </th>
                {HEADERS.map(header => (
                  <th key={header}>{header}</th>
                ))}
                <th className={STICKY_END} aria-label='Actions' />
              </tr>
            </thead>
            <tbody>
              {query.isPending && <SkeletonRows />}
              {!query.isPending && !query.isError && rows.length === 0 && <EmptyRow isDefault={filters.isDefault} />}
              {rows.map(entry => (
                <ReviewRow
                  key={entry.id}
                  entry={entry}
                  selected={selected.has(entry.id)}
                  approving={approve.isPending && approve.variables === entry.id}
                  onToggle={() => toggle(entry.id)}
                  onOpen={() => onOpen(entry.id)}
                  onApprove={() => void approveOne(entry)}
                  onAdjust={() => setAdjusting(entry)}
                  onReject={() => setRejecting(entry)}
                />
              ))}
            </tbody>
          </table>
        </div>
        <div className='flex justify-between items-center flex-wrap pli-6 border-bs plb-3 gap-2'>
          <div className='flex items-center gap-3'>
            <Typography color='text.disabled'>
              {meta && meta.total > 0
                ? `Showing ${(meta.page - 1) * meta.limit + 1} to ${Math.min(meta.page * meta.limit, meta.total)} of ${meta.total} timesheets`
                : 'No entries'}
            </Typography>
            <CustomTextField
              select
              size='small'
              value={limit}
              onChange={e => {
                setLimit(Number(e.target.value))
                update({ page: null })
              }}
            >
              {PAGE_SIZES.map(size => (
                <MenuItem key={size} value={size}>
                  {size} / page
                </MenuItem>
              ))}
            </CustomTextField>
          </div>
          <Pagination
            shape='rounded'
            color='primary'
            variant='tonal'
            count={meta?.totalPages ?? 1}
            page={page}
            onChange={(_, next) => update({ page: next === 1 ? null : String(next) })}
            showFirstButton
            showLastButton
          />
        </div>
      </Card>
      <AdjustDialog timesheet={adjusting} onClose={() => setAdjusting(null)} />
      <RejectDialog timesheet={rejecting} onClose={() => setRejecting(null)} />
    </>
  )
}

export default ReviewTab
