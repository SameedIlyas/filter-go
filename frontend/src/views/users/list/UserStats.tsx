// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'

// Type Imports
import type { ThemeColor } from '@core/types'
import type { Role, UserStatus } from '@/types/userTypes'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'

type Counts = { total: number; byRole: Record<Role, number>; byStatus: Record<UserStatus, number> }

type Tile = {
  key: string
  label: string
  value: number | undefined
  caption: string
  icon: string
  color: ThemeColor
  filter: { role?: Role; status?: UserStatus }
}

type Props = {
  counts: Counts | undefined
  role?: Role
  status?: UserStatus
  onSelect: (filter: { role?: Role; status?: UserStatus }) => void
}

const UserStats = ({ counts, role, status, onSelect }: Props) => {
  const tiles: Tile[] = [
    {
      key: 'all',
      label: 'Total users',
      value: counts?.total,
      caption: counts ? `${counts.byStatus.ACTIVE} active` : '',
      icon: 'bx-group',
      color: 'primary',
      filter: {}
    },
    {
      key: 'field',
      label: 'Field users',
      value: counts?.byRole.FIELD_USER,
      caption: 'Out on shifts',
      icon: 'bx-hard-hat',
      color: 'info',
      filter: { role: 'FIELD_USER' }
    },
    {
      key: 'supervisors',
      label: 'Supervisors & admins',
      value: counts ? counts.byRole.SUPERVISOR + counts.byRole.ADMIN : undefined,
      caption: counts ? `${counts.byRole.CLIENT_USER} client users` : '',
      icon: 'bx-user-check',
      color: 'warning',
      filter: { role: 'SUPERVISOR' }
    },
    {
      key: 'invited',
      label: 'Pending invites',
      value: counts?.byStatus.INVITED,
      caption: counts ? `${counts.byStatus.DISABLED} disabled` : '',
      icon: 'bx-envelope',
      color: 'success',
      filter: { status: 'INVITED' }
    }
  ]

  const isActive = (tile: Tile) =>
    tile.key === 'all' ? !role && !status : tile.filter.role === role && tile.filter.status === status

  return (
    <div className='grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'>
      {tiles.map(tile => (
        <Card
          key={tile.key}
          className='cursor-pointer'
          onClick={() => onSelect(tile.filter)}
          sx={isActive(tile) ? { outline: theme => `2px solid ${theme.palette[tile.color].main}` } : {}}
        >
          <CardContent className='flex items-start justify-between gap-2'>
            <div className='flex flex-col gap-1'>
              <Typography color='text.secondary'>{tile.label}</Typography>
              {tile.value !== undefined ? (
                <Typography variant='h4'>{tile.value}</Typography>
              ) : (
                <Skeleton width={60} height={36} />
              )}
              <Typography variant='body2' color='text.disabled'>
                {tile.caption || ' '}
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

export default UserStats
