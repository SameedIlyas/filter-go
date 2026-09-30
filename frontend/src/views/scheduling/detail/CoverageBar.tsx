// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

// Type Imports
import type { Schedule, ShiftCounts, ShiftStatus } from '@/types/scheduleTypes'

import { SHIFT_STATUS_META, statusColor } from '../shared'

/** Legend order, from "needs attention" to "done". */
const SEGMENTS: Array<{ status: ShiftStatus; key: Exclude<keyof ShiftCounts, 'total'> }> = [
  { status: 'OPEN', key: 'open' },
  { status: 'ASSIGNED', key: 'assigned' },
  { status: 'CONFIRMED', key: 'confirmed' },
  { status: 'IN_PROGRESS', key: 'inProgress' },
  { status: 'COMPLETED', key: 'completed' },
  { status: 'NO_SHOW', key: 'noShow' },
  { status: 'CANCELLED', key: 'cancelled' }
]

/**
 * Hand-added shifts are only countable when the schedule has nothing but ad-hoc coverage: then every live shift
 * was added by hand. With mixed patterns the generated ones cannot be told apart, so the count is left out.
 */
const addedByHand = (schedule: Schedule) => {
  const patterns = schedule.termsSnapshot?.coverage.filter(row => row.siteId === schedule.siteId) ?? []

  if (patterns.length === 0 || patterns.some(row => row.patternType !== 'AD_HOC')) return null

  return schedule.coverage.total - schedule.coverage.cancelled
}

/** A stacked bar of the schedule's shifts by status, with a legend of counts. */
const CoverageBar = ({ schedule }: { schedule: Schedule }) => {
  const { coverage } = schedule
  const added = addedByHand(schedule)

  return (
    <Card>
      <CardContent className='flex flex-col gap-4'>
        <div className='flex flex-wrap items-baseline justify-between gap-2'>
          <Typography variant='h5'>Coverage</Typography>
          <Typography color='text.secondary'>
            {coverage.total} shift{coverage.total === 1 ? '' : 's'}
            {coverage.open > 0 && (
              <Typography component='span' color='error.main' className='font-medium'>
                {' '}
                · {coverage.open} open
              </Typography>
            )}
          </Typography>
        </div>

        <div
          className='flex bs-3 overflow-hidden rounded-full bg-[var(--mui-palette-action-hover)]'
          role='img'
          aria-label={SEGMENTS.map(({ status, key }) => `${SHIFT_STATUS_META[status].label}: ${coverage[key]}`).join(
            ', '
          )}
        >
          {coverage.total > 0 &&
            SEGMENTS.filter(({ key }) => coverage[key] > 0).map(({ status, key }) => (
              <Tooltip key={status} title={`${SHIFT_STATUS_META[status].label}: ${coverage[key]}`}>
                <div
                  style={{
                    inlineSize: `${(coverage[key] / coverage.total) * 100}%`,
                    backgroundColor: statusColor(status)
                  }}
                />
              </Tooltip>
            ))}
        </div>

        <div className='flex flex-wrap gap-x-6 gap-y-2'>
          {SEGMENTS.map(({ status, key }) => (
            <div key={status} className='flex items-center gap-2'>
              <span className='is-2.5 bs-2.5 rounded-full' style={{ backgroundColor: statusColor(status) }} />
              <Typography variant='body2' color={coverage[key] > 0 ? 'text.primary' : 'text.disabled'}>
                {SHIFT_STATUS_META[status].label} <b>{coverage[key]}</b>
              </Typography>
            </div>
          ))}
        </div>

        {schedule.expectedVisits !== null && (
          <Typography variant='body2' color='text.secondary'>
            <i className='bx-calendar-plus align-middle mie-1' />
            Ad hoc: {schedule.expectedVisits} visit{schedule.expectedVisits === 1 ? '' : 's'} expected
            {added !== null ? `, ${added} added` : ' — add them on the board below'}
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}

export default CoverageBar
