'use client'

// MUI Imports
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import Skeleton from '@mui/material/Skeleton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

// Type Imports
import type { HoursResponse, HoursTally } from '@/types/timesheetTypes'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'

// Util Imports
import { getInitials } from '@/utils/getInitials'

import { todayKey } from '../../scheduling/logic/zoned'
import { formatMinutes } from '../logic/format'
import type { HoursMetric } from '../logic/hoursCsv'
import { formatDayColumn } from '../logic/window'
import type { DayWindow } from '../logic/window'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

type Worker = HoursResponse['workers'][number]

type Props = {
  data: HoursResponse | undefined
  loading: boolean
  metric: HoursMetric
  onDrill: (userId: string, range: DayWindow) => void
  onExceptions: (userId: string) => void
}

/** Worked this much past the schedule before a cell is flagged. */
const OVER_MINUTES = 15

const STICKY = 'sticky inline-start-0 z-[1] bg-backgroundPaper'

const tooltipOf = (tally: HoursTally) =>
  `Scheduled ${formatMinutes(tally.scheduledMinutes)} · Worked ${formatMinutes(tally.workedMinutes)} · Approved ${formatMinutes(tally.approvedMinutes)}`

/** Colour a cell by how the day went: unworked past shifts in red, work well past the schedule in amber. */
const toneOf = (tally: HoursTally, day: string, today: string): string | undefined => {
  if (tally.scheduledMinutes > 0 && tally.workedMinutes === 0 && day < today) return 'error.main'
  if (tally.workedMinutes > tally.scheduledMinutes + OVER_MINUTES) return 'warning.main'

  return undefined
}

const DayCell = ({ tally, day, metric, today, onClick }: { tally: HoursTally | undefined; day: string; metric: HoursMetric; today: string; onClick: () => void }) => {
  if (!tally) return <td className='text-center' />

  return (
    <td className='text-center'>
      <Tooltip title={tooltipOf(tally)}>
        <Typography component='button' type='button' onClick={onClick} color={toneOf(tally, day, today) ?? 'text.primary'} className='cursor-pointer border-0 bg-transparent p-0 font-[inherit] hover:underline'>
          {tally[metric] > 0 ? formatMinutes(tally[metric]) : '0m'}
        </Typography>
      </Tooltip>
    </td>
  )
}

const WorkerRow = ({ worker, days, metric, today, onDrill, onExceptions }: { worker: Worker; days: string[]; metric: HoursMetric; today: string } & Pick<Props, 'onDrill' | 'onExceptions'>) => (
  <tr>
    <td className={STICKY}>
      <div className='flex items-center gap-3'>
        <CustomAvatar size={30} skin='light'>
          {getInitials(worker.user.name)}
        </CustomAvatar>
        <div className='flex flex-col items-start'>
          <Link component='button' type='button' color='text.primary' className='font-medium' onClick={() => onDrill(worker.user.id, { from: days[0], to: days[days.length - 1] })}>
            {worker.user.name}
          </Link>
          <Typography variant='caption' color='text.disabled'>
            {worker.entryCount} timesheet{worker.entryCount === 1 ? '' : 's'}
          </Typography>
        </div>
      </div>
    </td>
    {days.map(day => (
      <DayCell key={day} tally={worker.days[day]} day={day} metric={metric} today={today} onClick={() => onDrill(worker.user.id, { from: day, to: day })} />
    ))}
    <td className='text-end'>{formatMinutes(worker.scheduledMinutes)}</td>
    <td className='text-end font-medium'>{formatMinutes(worker.workedMinutes)}</td>
    <td className='text-end'>{formatMinutes(worker.approvedMinutes)}</td>
    <td className='text-end'>
      <Typography component='span' color={worker.overtimeMinutes > 0 ? 'error.main' : 'text.disabled'}>
        {worker.overtimeMinutes > 0 ? formatMinutes(worker.overtimeMinutes) : '—'}
      </Typography>
    </td>
    <td className='text-center'>
      {worker.openExceptionCount > 0 ? <Chip size='small' variant='tonal' color='error' label={worker.openExceptionCount} onClick={() => onExceptions(worker.user.id)} /> : null}
    </td>
  </tr>
)

const TotalRow = ({ data, metric }: { data: HoursResponse; metric: HoursMetric }) => (
  <tr className='border-bs-2 border-divider'>
    <td className={`${STICKY} font-medium`}>Total</td>
    {data.days.map(day => (
      <td key={day} className='text-center font-medium'>
        {data.totals.days[day]?.[metric] ? formatMinutes(data.totals.days[day][metric]) : ''}
      </td>
    ))}
    <td className='text-end font-medium'>{formatMinutes(data.totals.scheduledMinutes)}</td>
    <td className='text-end font-medium'>{formatMinutes(data.totals.workedMinutes)}</td>
    <td className='text-end font-medium'>{formatMinutes(data.totals.approvedMinutes)}</td>
    <td className='text-end font-medium'>{data.totals.overtimeMinutes > 0 ? formatMinutes(data.totals.overtimeMinutes) : '—'}</td>
    <td />
  </tr>
)

/**
 * The UAT "Officers Work Logs" grid: a row per worker, a column per site-local day showing the chosen metric, then
 * the period totals. A day cell or a name opens the review list for that worker; the exception count opens the queue.
 */
const HoursGrid = ({ data, loading, metric, onDrill, onExceptions }: Props) => {
  const today = todayKey()
  const days = data?.days ?? []

  if (loading && !data) return <Skeleton variant='rounded' height={240} className='m-6' />

  if (!data || data.workers.length === 0) {
    return (
      <div className='flex flex-col items-center gap-2 plb-12'>
        <i className='bx-grid-alt text-5xl text-textDisabled' />
        <Typography variant='h6'>No hours in this period</Typography>
        <Typography color='text.secondary'>Nobody was scheduled or clocked in between these dates.</Typography>
      </div>
    )
  }

  return (
    <div className='overflow-x-auto'>
      <table className={tableStyles.table}>
        <thead>
          <tr>
            <th className={`${STICKY} min-is-[220px]`}>Worker</th>
            {days.map(day => (
              <th key={day} className={`text-center whitespace-nowrap ${day === today ? 'text-primary' : ''}`}>
                {formatDayColumn(day)}
              </th>
            ))}
            <th className='text-end whitespace-nowrap'>Scheduled</th>
            <th className='text-end whitespace-nowrap'>Worked</th>
            <th className='text-end whitespace-nowrap'>Approved</th>
            <th className='text-end whitespace-nowrap'>
              <Tooltip title={`Weekly overtime: time past ${formatMinutes(data.weeklyOvertimeMinutes)} in a Monday-to-Sunday week. Weeks that cross the period edges count whole.`}>
                <span className='cursor-help'>Overtime</span>
              </Tooltip>
            </th>
            <th className='text-center whitespace-nowrap'>Exceptions</th>
          </tr>
        </thead>
        <tbody>
          {data.workers.map(worker => (
            <WorkerRow key={worker.user.id} worker={worker} days={days} metric={metric} today={today} onDrill={onDrill} onExceptions={onExceptions} />
          ))}
          <TotalRow data={data} metric={metric} />
        </tbody>
      </table>
    </div>
  )
}

export default HoursGrid
