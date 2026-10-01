'use client'

// MUI Imports
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { useSchedulingSites, useStaffOptions } from '@/libs/api/queries/scheduling'

import { formatWindow, shiftWindow } from '../logic/window'
import { TIMESHEET_STATUSES, TIMESHEET_STATUS_META } from '../shared'
import type { ReviewFilters as Filters } from './useReviewFilters'

type Props = {
  filters: Filters
  update: (patch: Record<string, string | null>) => void
  clear: () => void
}

/** Status, site, worker, the day window (‹ › pages a week at a time) and "only with open exceptions". */
const ReviewFilters = ({ filters, update, clear }: Props) => {
  const staff = useStaffOptions()
  const sites = useSchedulingSites()

  const move = (direction: -1 | 1) => {
    const next = shiftWindow(filters.window, direction)

    update({ from: next.from, to: next.to })
  }

  return (
    <div className='flex flex-wrap items-center gap-4 p-6'>
      <CustomTextField
        select
        className='min-is-[170px]'
        value={filters.status}
        onChange={e => update({ status: e.target.value === 'SUBMITTED' ? null : e.target.value })}
      >
        <MenuItem value='all'>All statuses</MenuItem>
        {TIMESHEET_STATUSES.map(status => (
          <MenuItem key={status} value={status}>
            {status === 'SUBMITTED' ? 'Submitted (needs review)' : TIMESHEET_STATUS_META[status].label}
          </MenuItem>
        ))}
      </CustomTextField>
      <CustomTextField
        select
        className='min-is-[180px]'
        value={filters.siteId}
        onChange={e => update({ siteId: e.target.value })}
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
        select
        className='min-is-[180px]'
        value={filters.userId}
        onChange={e => update({ userId: e.target.value })}
        slotProps={{ select: { displayEmpty: true } }}
      >
        <MenuItem value=''>All workers</MenuItem>
        {(staff.data ?? []).map(user => (
          <MenuItem key={user.id} value={user.id}>
            {user.name}
          </MenuItem>
        ))}
      </CustomTextField>
      <div className='flex items-center gap-1'>
        <IconButton size='small' aria-label='Previous period' onClick={() => move(-1)}>
          <i className='bx-chevron-left text-xl' />
        </IconButton>
        <CustomTextField
          type='date'
          size='small'
          value={filters.window.from}
          onChange={e => e.target.value && update({ from: e.target.value, to: filters.window.to })}
          aria-label='From'
        />
        <Typography color='text.secondary'>–</Typography>
        <CustomTextField
          type='date'
          size='small'
          value={filters.window.to}
          onChange={e => e.target.value && update({ from: filters.window.from, to: e.target.value })}
          aria-label='To'
        />
        <IconButton size='small' aria-label='Next period' onClick={() => move(1)}>
          <i className='bx-chevron-right text-xl' />
        </IconButton>
      </div>
      <FormControlLabel
        control={
          <Switch
            checked={filters.openExceptions}
            onChange={e => update({ exceptions: e.target.checked ? 'open' : null })}
          />
        }
        label='Open exceptions only'
      />
      {!filters.isDefault && (
        <Button variant='text' color='secondary' onClick={clear}>
          Reset
        </Button>
      )}
      <Typography variant='body2' color='text.disabled' className='is-full'>
        Shifts starting {formatWindow(filters.window)}
      </Typography>
    </div>
  )
}

export default ReviewFilters
