// MUI Imports
import Typography from '@mui/material/Typography'

// Type Imports
import type { BoardResponse, ShiftStatus } from '@/types/scheduleTypes'

import { SHIFT_STATUS_META, statusColor } from '../shared'

const LEGEND: Array<{ status: ShiftStatus; key: keyof BoardResponse['counts'] }> = [
  { status: 'OPEN', key: 'open' },
  { status: 'ASSIGNED', key: 'assigned' },
  { status: 'CONFIRMED', key: 'confirmed' },
  { status: 'IN_PROGRESS', key: 'inProgress' },
  { status: 'COMPLETED', key: 'completed' },
  { status: 'NO_SHOW', key: 'noShow' },
  { status: 'CANCELLED', key: 'cancelled' }
]

/**
 * Totals for the visible days. When rows were truncated the board passes the server's counts instead, which
 * cover a day either side as well, and marks them `approximate`.
 */
const BoardFooter = ({ counts, approximate = false }: { counts: BoardResponse['counts']; approximate?: boolean }) => {
  const live = counts.total - counts.cancelled
  const filled = live - counts.open
  const percent = live === 0 ? 0 : Math.round((filled / live) * 100)

  return (
    <div className='flex flex-wrap items-center gap-x-6 gap-y-2 border-bs px-6 py-3'>
      <Typography variant='body2' className='font-medium' color='text.primary'>
        {approximate && '≈ '}
        {counts.total} shifts · {percent}% filled
        {counts.extra > 0 && ` · ${counts.extra} extra`}
      </Typography>
      <div className='flex flex-wrap items-center gap-x-4 gap-y-1'>
        {LEGEND.map(({ status, key }) => (
          <span key={status} className='flex items-center gap-1.5'>
            <span className='inline-block rounded-full' style={{ width: 8, height: 8, background: statusColor(status) }} />
            <Typography variant='caption' color='text.secondary'>
              <strong>{counts[key]}</strong> {SHIFT_STATUS_META[status].label}
            </Typography>
          </span>
        ))}
      </div>
    </div>
  )
}

export default BoardFooter
