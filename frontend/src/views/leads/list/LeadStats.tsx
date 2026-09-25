// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'

// Type Imports
import type { LeadStatus } from '@/types/leadTypes'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'

import { STATUS_META } from '../shared'

type Props = {
  counts: Record<LeadStatus, number> | undefined
  active?: LeadStatus
  onSelect: (status?: LeadStatus) => void
}

const LeadStats = ({ counts, active, onSelect }: Props) => {
  const total = counts ? Object.values(counts).reduce((sum, n) => sum + n, 0) : 0
  const open = counts ? counts.NEW + counts.CONTACTED + counts.QUALIFIED + counts.PROPOSAL : 0
  const closed = counts ? counts.WON + counts.LOST : 0
  const winRate = closed > 0 && counts ? Math.round((counts.WON / closed) * 100) : 0

  const tiles = [
    { key: 'all', label: 'Total leads', value: total, icon: 'bx-group', color: 'primary' as const, status: undefined },
    { key: 'open', label: 'Open pipeline', value: open, icon: 'bx-trending-up', color: 'info' as const, status: undefined },
    { key: 'won', label: 'Won', value: counts?.WON ?? 0, icon: 'bx-trophy', color: 'success' as const, status: 'WON' as const },
    { key: 'rate', label: 'Win rate', value: `${winRate}%`, icon: 'bx-pie-chart-alt', color: 'warning' as const, status: undefined }
  ]

  return (
    <div className='grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'>
      {tiles.map(tile => (
        <Card
          key={tile.key}
          className='cursor-pointer'
          onClick={() => onSelect(tile.key === 'won' ? 'WON' : undefined)}
          sx={tile.status && active === tile.status ? { outline: theme => `2px solid ${theme.palette.success.main}` } : {}}
        >
          <CardContent className='flex items-start justify-between gap-2'>
            <div className='flex flex-col gap-1'>
              <Typography color='text.secondary'>{tile.label}</Typography>
              {counts ? <Typography variant='h4'>{tile.value}</Typography> : <Skeleton width={60} height={36} />}
              <Typography variant='body2' color='text.disabled'>
                {tile.key === 'open' && counts
                  ? `${counts.NEW} new · ${counts.QUALIFIED} qualified`
                  : tile.key === 'rate'
                    ? `${counts?.LOST ?? 0} lost`
                    : tile.key === 'won'
                      ? 'Converted to contracts'
                      : 'All sources'}
              </Typography>
            </div>
            <CustomAvatar variant='rounded' skin='light' color={tile.color} size={42}>
              <i className={`${tile.icon} text-[26px]`} />
            </CustomAvatar>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export const statusLabel = (status: LeadStatus) => STATUS_META[status].label

export default LeadStats
