'use client'

// MUI Imports
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'

// Type Imports
import type { Site } from '@/types/contractTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

import { todayKey } from '../../scheduling/logic/zoned'
import type { HoursMetric } from '../logic/hoursCsv'
import { formatWindow, shiftWindow, weekOf } from '../logic/window'
import type { DayWindow } from '../logic/window'

type Props = {
  window: DayWindow
  siteId: string
  sites: Site[]
  metric: HoursMetric
  canExport: boolean
  onWindow: (window: DayWindow) => void
  onSite: (siteId: string) => void
  onMetric: (metric: HoursMetric) => void
  onExport: () => void
}

const METRICS: Array<{ value: HoursMetric; label: string }> = [
  { value: 'workedMinutes', label: 'Worked' },
  { value: 'approvedMinutes', label: 'Approved' },
  { value: 'scheduledMinutes', label: 'Scheduled' }
]

/** Period navigation (by the window's length), a custom range up to 45 days, the site, what the cells show, export. */
const HoursToolbar = ({ window, siteId, sites, metric, canExport, onWindow, onSite, onMetric, onExport }: Props) => (
  <div className='flex flex-wrap items-center justify-between gap-3 p-6'>
    <div className='flex flex-wrap items-center gap-2'>
      <div className='flex items-center gap-1'>
        <IconButton size='small' onClick={() => onWindow(shiftWindow(window, -1))} aria-label='Previous period'>
          <i className='bx-chevron-left' />
        </IconButton>
        <Typography variant='h6' component='h2' className='min-is-[200px] text-center'>
          {formatWindow(window)}
        </Typography>
        <IconButton size='small' onClick={() => onWindow(shiftWindow(window, 1))} aria-label='Next period'>
          <i className='bx-chevron-right' />
        </IconButton>
      </div>
      <Button size='small' variant='tonal' color='secondary' onClick={() => onWindow(weekOf(todayKey()))}>
        This week
      </Button>
      <CustomTextField type='date' size='small' label='From' value={window.from} onChange={e => e.target.value && onWindow({ ...window, from: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
      <CustomTextField type='date' size='small' label='To' value={window.to} onChange={e => e.target.value && onWindow({ ...window, to: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
      <CustomTextField select size='small' className='min-is-[180px]' value={siteId} onChange={e => onSite(e.target.value)} slotProps={{ select: { displayEmpty: true } }}>
        <MenuItem value=''>All sites</MenuItem>
        {sites.map(site => (
          <MenuItem key={site.id} value={site.id}>
            {site.name}
          </MenuItem>
        ))}
      </CustomTextField>
    </div>
    <div className='flex flex-wrap items-center gap-2'>
      <ToggleButtonGroup exclusive size='small' value={metric} onChange={(_event, next: HoursMetric | null) => next && onMetric(next)} aria-label='Show in the day cells'>
        {METRICS.map(option => (
          <ToggleButton key={option.value} value={option.value}>
            {option.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <Button variant='tonal' startIcon={<i className='bx-download' />} onClick={onExport} disabled={!canExport}>
        Export CSV
      </Button>
    </div>
  </div>
)

export default HoursToolbar
