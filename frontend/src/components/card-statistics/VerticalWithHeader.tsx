'use client'

// React Imports
import { useState } from 'react'
import type { MouseEvent } from 'react'

// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'

// Third-party Imports
import classnames from 'classnames'

// Type Imports
import type { CardStatsVerticalWithHeaderProps } from '@/types/pages/widgetTypes'

// Components Imports
import CustomAvatar from '@core/components/mui/Avatar'

const VerticalWithHeader = (props: CardStatsVerticalWithHeaderProps) => {
  // Props
  const { stats, title, subtitle, trendNumber, trend, avatarIcon, avatarColor, avatarVariant, avatarSkin, avatarSize } =
    props

  // States
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  return (
    <Card>
      <CardHeader
        title={title}
        titleTypographyProps={{ variant: 'body1', color: 'text.primary' }}
        action={
          <>
            <Button color='secondary' size='small' onClick={handleClick} endIcon={<i className='bx-chevron-down' />}>
              Today
            </Button>
            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
              <MenuItem onClick={handleClose}>Yesterday</MenuItem>
              <MenuItem onClick={handleClose}>Last Week</MenuItem>
              <MenuItem onClick={handleClose}>Last Month</MenuItem>
            </Menu>
          </>
        }
      />

      <CardContent className='flex items-center flex-col gap-3'>
        <CustomAvatar
          variant={avatarVariant}
          skin={avatarSkin}
          color={avatarColor}
          size={avatarSize}
          sx={{
            boxShadow: `rgb(var(--mui-palette-${avatarColor}-mainChannel)/ 0.06) 0px 0px 0px 4px`
          }}
        >
          <i className={classnames(avatarIcon, 'text-[26px]')} />
        </CustomAvatar>
        <div className='flex flex-col gap-y-2 items-center justify-center'>
          <div>
            <Typography variant='h4'>{stats}</Typography>
            <Typography>{subtitle}</Typography>
          </div>
          <Typography color={trend === 'positive' ? 'success.main' : 'error.main'} className='flex items-center'>
            <span>{trendNumber}%</span>
            <i className={trend === 'positive' ? 'bx-chevron-up' : 'bx-chevron-down'} />
          </Typography>
        </div>
      </CardContent>
    </Card>
  )
}

export default VerticalWithHeader
