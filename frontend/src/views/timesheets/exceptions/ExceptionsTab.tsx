'use client'

// React Imports
import { useCallback, useEffect, useState } from 'react'

// Next Imports
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

// MUI Imports
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import MenuItem from '@mui/material/MenuItem'
import Pagination from '@mui/material/Pagination'
import Skeleton from '@mui/material/Skeleton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

// Type Imports
import type { ExceptionQueueResponse, ExceptionType } from '@/types/timesheetTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useSchedulingSites, useStaffOptions } from '@/libs/api/queries/scheduling'
import { useExceptionQueue } from '@/libs/api/queries/timesheets'

import { formatTimeIn } from '../../scheduling/logic/zoned'
import { describeException, formatAge } from '../logic/format'
import { EXCEPTION_META, EXCEPTION_TYPES, ExceptionChip, TimesheetStatusChip, formatEntryDay } from '../shared'
import ResolveDialog from './ResolveDialog'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

type QueueItem = ExceptionQueueResponse['exceptions'][number]

const PAGE_SIZE = 20
const COLUMNS = 6

/** Filters in the URL (`type`, `siteId`, `userId`), shared with the review list where the keys overlap. */
const useQueueParams = () => {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const typeParam = params.get('type')
  const type: ExceptionType | '' = EXCEPTION_TYPES.find(value => value === typeParam) ?? ''

  const set = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString())

      if (value) next.set(key, value)
      else next.delete(key)

      router.replace(`${pathname}?${next.toString()}`, { scroll: false })
    },
    [params, pathname, router]
  )

  return { type, siteId: params.get('siteId') ?? '', userId: params.get('userId') ?? '', set }
}

const QueueRow = ({ item, now, onOpen, onResolve }: { item: QueueItem; now: number; onOpen: (id: string) => void; onResolve: (item: QueueItem) => void }) => {
  const { timesheet } = item
  const zone = timesheet.site.timezone

  return (
    <tr className='cursor-pointer hover:bg-actionHover' onClick={() => onOpen(timesheet.id)}>
      <td>
        <div className='flex flex-col items-start gap-1'>
          <ExceptionChip exception={item} />
          <Typography variant='body2' color='text.secondary'>
            {describeException(item)}
          </Typography>
        </div>
      </td>
      <td>
        <Typography color='text.primary' className='font-medium'>
          {timesheet.user?.name ?? 'Unknown worker'}
        </Typography>
      </td>
      <td>
        <div className='flex flex-col'>
          <Typography color='text.primary'>{timesheet.site.name}</Typography>
          <Typography variant='body2' color='text.secondary'>
            {formatEntryDay(timesheet.shift.scheduledStart, zone)} · {formatTimeIn(timesheet.shift.scheduledStart, zone)}–{formatTimeIn(timesheet.shift.scheduledEnd, zone)}
          </Typography>
        </div>
      </td>
      <td>
        <TimesheetStatusChip status={timesheet.status} />
      </td>
      <td>
        <Tooltip title={new Date(item.createdAt).toLocaleString()}>
          <Typography variant='body2'>{formatAge(item.createdAt, now)}</Typography>
        </Tooltip>
      </td>
      <td className='text-end whitespace-nowrap' onClick={event => event.stopPropagation()}>
        <Button size='small' variant='tonal' onClick={() => onResolve(item)}>
          Resolve
        </Button>
        <Tooltip title='Open timesheet'>
          <IconButton size='small' onClick={() => onOpen(timesheet.id)} aria-label='Open timesheet'>
            <i className='bx-chevron-right' />
          </IconButton>
        </Tooltip>
      </td>
    </tr>
  )
}

/**
 * The supervisor's queue: unresolved exceptions, oldest first. Resolve one with a note, or open the timesheet to fix
 * its times or approve it (which resolves all of its exceptions).
 */
const ExceptionsTab = ({ onOpen }: { onOpen: (timesheetId: string) => void }) => {
  const { type, siteId, userId, set } = useQueueParams()
  const [page, setPage] = useState(1)
  const [resolving, setResolving] = useState<QueueItem | null>(null)

  const queue = useExceptionQueue({ type: type || undefined, siteId: siteId || undefined, userId: userId || undefined, page, limit: PAGE_SIZE })
  const staff = useStaffOptions()
  const sites = useSchedulingSites()

  useEffect(() => setPage(1), [type, siteId, userId])

  const rows = queue.data?.items ?? []
  const meta = queue.data?.meta
  const hasFilters = Boolean(type || siteId || userId)
  const now = Date.now()

  return (
    <Card>
      <div className='flex flex-wrap items-center gap-4 p-6'>
        <CustomTextField select className='min-is-[180px]' value={type} onChange={e => set('type', e.target.value)} slotProps={{ select: { displayEmpty: true } }}>
          <MenuItem value=''>All exceptions</MenuItem>
          {EXCEPTION_TYPES.map(value => (
            <MenuItem key={value} value={value}>
              {EXCEPTION_META[value].label}
            </MenuItem>
          ))}
        </CustomTextField>
        <CustomTextField select className='min-is-[200px]' value={siteId} onChange={e => set('siteId', e.target.value)} slotProps={{ select: { displayEmpty: true } }}>
          <MenuItem value=''>All sites</MenuItem>
          {(sites.data ?? []).map(site => (
            <MenuItem key={site.id} value={site.id}>
              {site.name}
            </MenuItem>
          ))}
        </CustomTextField>
        <CustomTextField select className='min-is-[200px]' value={userId} onChange={e => set('userId', e.target.value)} slotProps={{ select: { displayEmpty: true } }}>
          <MenuItem value=''>All workers</MenuItem>
          {(staff.data ?? []).map(user => (
            <MenuItem key={user.id} value={user.id}>
              {user.name}
            </MenuItem>
          ))}
        </CustomTextField>
        {hasFilters && (
          <Button
            variant='text'
            color='secondary'
            onClick={() => {
              set('type', '')
              set('siteId', '')
              set('userId', '')
            }}
          >
            Clear
          </Button>
        )}
        <div className='flex-1' />
        {meta && meta.total > 0 && (
          <Typography color='text.secondary'>
            {meta.total} open exception{meta.total === 1 ? '' : 's'}
          </Typography>
        )}
      </div>
      {queue.isFetching && <LinearProgress className='bs-0.5' />}
      <Divider />
      {queue.isError && (
        <div className='p-6 flex items-center justify-between gap-4'>
          <Typography color='error'>{errorMessage(queue.error)}</Typography>
          <Button variant='tonal' onClick={() => queue.refetch()}>
            Retry
          </Button>
        </div>
      )}
      <div className='overflow-x-auto'>
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th>Exception</th>
              <th>Worker</th>
              <th>Shift</th>
              <th>Timesheet</th>
              <th>Waiting</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {queue.isPending &&
              [0, 1, 2, 3].map(i => (
                <tr key={i}>
                  {Array.from({ length: COLUMNS }).map((_, j) => (
                    <td key={j}>
                      <Skeleton />
                    </td>
                  ))}
                </tr>
              ))}
            {!queue.isPending && rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS} className='text-center plb-12'>
                  <div className='flex flex-col items-center gap-2'>
                    <i className='bx-check-shield text-5xl text-success' />
                    <Typography variant='h6'>{hasFilters ? 'No open exceptions match these filters' : 'No open exceptions'}</Typography>
                    <Typography color='text.secondary'>Late clock-ins, off-site punches, overtime and no-shows show up here.</Typography>
                  </div>
                </td>
              </tr>
            )}
            {rows.map(item => (
              <QueueRow key={item.id} item={item} now={now} onOpen={onOpen} onResolve={setResolving} />
            ))}
          </tbody>
        </table>
      </div>
      {meta && meta.totalPages > 1 && (
        <div className='flex justify-end p-4'>
          <Pagination count={meta.totalPages} page={page} onChange={(_event, next) => setPage(next)} shape='rounded' color='primary' />
        </div>
      )}
      <ResolveDialog exception={resolving} onClose={() => setResolving(null)} />
    </Card>
  )
}

export default ExceptionsTab
