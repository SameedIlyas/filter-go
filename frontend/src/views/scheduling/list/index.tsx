'use client'

// React Imports
import { useEffect, useMemo, useState } from 'react'

// Next Imports
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// MUI Imports
import Card from '@mui/material/Card'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import MenuItem from '@mui/material/MenuItem'
import Chip from '@mui/material/Chip'
import Pagination from '@mui/material/Pagination'
import LinearProgress from '@mui/material/LinearProgress'
import Skeleton from '@mui/material/Skeleton'
import Divider from '@mui/material/Divider'

// Type Imports
import type { Schedule, ScheduleStatus } from '@/types/scheduleTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import CustomAvatar from '@core/components/mui/Avatar'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useSchedulesQuery, useSchedulingSites, useStaffOptions } from '@/libs/api/queries/scheduling'
import type { ScheduleFilters } from '@/libs/api/queries/scheduling'

import GenerateScheduleDialog from './GenerateScheduleDialog'
import { StaffOnly } from './feedback'
import SchedulingTabs from '../SchedulingTabs'
import { SCHEDULE_STATUS_META, ScheduleStatusChip, formatPeriod, useSchedulingRole } from '../shared'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

const PAGE_SIZES = [10, 20, 50]
const STATUSES = Object.keys(SCHEDULE_STATUS_META) as ScheduleStatus[]
const COLUMNS = 6

const ShiftsCell = ({ schedule }: { schedule: Schedule }) => (
  <div className='flex flex-col'>
    <Typography color='text.primary'>{schedule.coverage.total} shifts</Typography>
    {schedule.coverage.open > 0 ? (
      <Typography variant='body2' color='error.main'>
        {schedule.coverage.open} open
      </Typography>
    ) : (
      schedule.coverage.total > 0 && (
        <Typography variant='body2' color='text.disabled'>
          All filled
        </Typography>
      )
    )}
  </div>
)

const SchedulesTable = () => {
  const router = useRouter()

  const [status, setStatus] = useState<ScheduleStatus | ''>('')
  const [siteId, setSiteId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [generateOpen, setGenerateOpen] = useState(false)

  const baseFilters = useMemo(
    () => ({ status: status || undefined, siteId: siteId || undefined, from: from || undefined, to: to || undefined }),
    [status, siteId, from, to]
  )

  const filters: ScheduleFilters = { ...baseFilters, page, limit }
  const schedules = useSchedulesQuery(filters)
  const staff = useStaffOptions()
  const sites = useSchedulingSites()

  // Any filter change goes back to page 1
  useEffect(() => setPage(1), [baseFilters, limit])

  const hasFilters = !!(status || siteId || from || to)
  const meta = schedules.data?.meta
  const rows = schedules.data?.schedules ?? []

  const supervisorName = (id: string | null | undefined) =>
    id ? staff.data?.find(user => user.id === id)?.name : undefined

  return (
    <>
      <Card>
        <div className='flex flex-wrap items-center gap-4 p-6'>
          <CustomTextField
            select
            className='min-is-[180px]'
            value={status}
            onChange={e => setStatus(e.target.value as ScheduleStatus | '')}
            slotProps={{ select: { displayEmpty: true } }}
          >
            <MenuItem value=''>All statuses</MenuItem>
            {STATUSES.map(s => (
              <MenuItem key={s} value={s}>
                {SCHEDULE_STATUS_META[s].label}
              </MenuItem>
            ))}
          </CustomTextField>
          <CustomTextField
            select
            className='min-is-[200px]'
            value={siteId}
            onChange={e => setSiteId(e.target.value)}
            slotProps={{ select: { displayEmpty: true } }}
          >
            <MenuItem value=''>All sites</MenuItem>
            {(sites.data ?? []).map(site => (
              <MenuItem key={site.id} value={site.id}>
                {site.name}
              </MenuItem>
            ))}
          </CustomTextField>
          <CustomTextField
            type='date'
            label='Covering from'
            value={from}
            onChange={e => setFrom(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <CustomTextField
            type='date'
            label='to'
            value={to}
            onChange={e => setTo(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          {hasFilters && (
            <Button
              variant='text'
              color='secondary'
              onClick={() => {
                setStatus('')
                setSiteId('')
                setFrom('')
                setTo('')
              }}
            >
              Clear
            </Button>
          )}
          <div className='flex-1' />
          <Button variant='contained' startIcon={<i className='bx-plus' />} onClick={() => setGenerateOpen(true)}>
            Generate schedule
          </Button>
        </div>

        {schedules.isFetching && <LinearProgress className='bs-0.5' />}
        <Divider />

        {schedules.isError && (
          <div className='p-6 flex items-center justify-between gap-4'>
            <Typography color='error'>{errorMessage(schedules.error)}</Typography>
            <Button variant='tonal' onClick={() => schedules.refetch()}>
              Retry
            </Button>
          </div>
        )}

        <div className='overflow-x-auto'>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Contract</th>
                <th>Site</th>
                <th>Period</th>
                <th>Status</th>
                <th>Shifts</th>
                <th>Supervisor</th>
              </tr>
            </thead>
            <tbody>
              {schedules.isPending &&
                [0, 1, 2, 3, 4].map(i => (
                  <tr key={i}>
                    {Array.from({ length: COLUMNS }).map((_, j) => (
                      <td key={j}>
                        <Skeleton />
                      </td>
                    ))}
                  </tr>
                ))}
              {!schedules.isPending && rows.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS} className='text-center plb-12'>
                    <div className='flex flex-col items-center gap-2'>
                      <i className='bx-calendar text-5xl text-textDisabled' />
                      <Typography variant='h6'>
                        {hasFilters ? 'No schedules match these filters' : 'No schedules yet'}
                      </Typography>
                      <Typography color='text.secondary'>
                        {hasFilters
                          ? 'Try clearing the filters.'
                          : 'Generate one from an active contract to start planning shifts.'}
                      </Typography>
                      {!hasFilters && (
                        <Button variant='tonal' onClick={() => setGenerateOpen(true)} className='mbs-2'>
                          Generate your first schedule
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              {rows.map(schedule => (
                <tr
                  key={schedule.id}
                  className='cursor-pointer'
                  onClick={() => router.push(`/schedules/${schedule.id}`)}
                >
                  <td>
                    <div className='flex items-center gap-3'>
                      <CustomAvatar
                        skin='light'
                        color={SCHEDULE_STATUS_META[schedule.status].color}
                        size={34}
                        variant='rounded'
                      >
                        <i className='bx-calendar text-xl' />
                      </CustomAvatar>
                      <div className='flex items-center gap-2'>
                        <Typography
                          component={Link}
                          href={`/schedules/${schedule.id}`}
                          onClick={e => e.stopPropagation()}
                          color='text.primary'
                          className='font-medium hover:text-primary'
                        >
                          {schedule.contractNumber}
                        </Typography>
                        <Chip size='small' variant='outlined' label={`v${schedule.contractVersion}`} />
                      </div>
                    </div>
                  </td>
                  <td>
                    <Typography color='text.primary'>{schedule.site.name}</Typography>
                  </td>
                  <td>
                    <Typography>{formatPeriod(schedule.periodStart, schedule.periodEnd)}</Typography>
                  </td>
                  <td>
                    <ScheduleStatusChip status={schedule.status} />
                  </td>
                  <td>
                    <ShiftsCell schedule={schedule} />
                  </td>
                  <td>
                    <Typography color={schedule.supervisorId ? 'text.primary' : 'text.disabled'}>
                      {supervisorName(schedule.supervisorId) ?? '—'}
                    </Typography>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className='flex justify-between items-center flex-wrap pli-6 border-bs plb-3 gap-2'>
          <div className='flex items-center gap-3'>
            <Typography color='text.disabled'>
              {meta && meta.total > 0
                ? `Showing ${(meta.page - 1) * meta.limit + 1} to ${Math.min(meta.page * meta.limit, meta.total)} of ${meta.total} schedules`
                : 'No entries'}
            </Typography>
            <CustomTextField select size='small' value={limit} onChange={e => setLimit(Number(e.target.value))}>
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
            onChange={(_, next) => setPage(next)}
            showFirstButton
            showLastButton
          />
        </div>
      </Card>

      <GenerateScheduleDialog open={generateOpen} onClose={() => setGenerateOpen(false)} />
    </>
  )
}

const SchedulesList = () => {
  const { isStaff } = useSchedulingRole()

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-4'>
        <div>
          <Typography variant='h4'>Scheduling</Typography>
          <Typography color='text.secondary'>
            Schedules generated from contracts, one per site and period. Draft, publish, then lock once the period ends.
          </Typography>
        </div>
        <SchedulingTabs value='schedules' />
      </div>

      {isStaff ? <SchedulesTable /> : <StaffOnly />}
    </div>
  )
}

export default SchedulesList
