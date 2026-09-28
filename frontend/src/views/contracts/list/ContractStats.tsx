// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'

// Type Imports
import type { ThemeColor } from '@core/types'
import type { ContractStatus } from '@/types/contractTypes'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'

type Props = {
  counts: Record<ContractStatus, number> | undefined
  active?: ContractStatus
  onSelect: (status?: ContractStatus) => void
}

type Tile = { status: ContractStatus; label: string; caption: string; icon: string; color: ThemeColor }

const TILES: Tile[] = [
  { status: 'ACTIVE', label: 'Active', caption: 'Generating schedules', icon: 'bx-check-shield', color: 'success' },
  {
    status: 'PENDING_SIGNATURE',
    label: 'Awaiting signature',
    caption: 'Sent to the client',
    icon: 'bx-pen',
    color: 'warning'
  },
  { status: 'DRAFT', label: 'Drafts', caption: 'Rates or coverage to finish', icon: 'bx-edit-alt', color: 'secondary' },
  { status: 'SUSPENDED', label: 'Suspended', caption: 'Paused, no new visits', icon: 'bx-pause-circle', color: 'info' }
]

/** Latest version of each contract, per status. A tile toggles the matching status tab. */
const ContractStats = ({ counts, active, onSelect }: Props) => (
  <div className='grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'>
    {TILES.map(tile => (
      <Card
        key={tile.status}
        className='cursor-pointer'
        onClick={() => onSelect(active === tile.status ? undefined : tile.status)}
        sx={active === tile.status ? { outline: theme => `2px solid ${theme.palette[tile.color].main}` } : {}}
      >
        <CardContent className='flex items-start justify-between gap-2'>
          <div className='flex flex-col gap-1'>
            <Typography color='text.secondary'>{tile.label}</Typography>
            {counts ? <Typography variant='h4'>{counts[tile.status]}</Typography> : <Skeleton width={60} height={36} />}
            <Typography variant='body2' color='text.disabled'>
              {tile.caption}
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

export default ContractStats
