// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardMedia from '@mui/material/CardMedia'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import AvatarGroup from '@mui/material/AvatarGroup'
import Tooltip from '@mui/material/Tooltip'
import Button from '@mui/material/Button'

// Component Imports
import OptionMenu from '@core/components/option-menu'
import CustomAvatar from '@core/components/mui/Avatar'

const SharedEvent = () => {
  return (
    <Card>
      <CardHeader
        avatar={<CustomAvatar size={40} src='/images/avatars/4.png' />}
        title='Olivia Shared Event'
        titleTypographyProps={{ variant: 'h5' }}
        subheader='07 Sep 2020 at 10:30 AM'
        subheaderTypographyProps={{
          fontSize: '0.8125rem !important',
          lineHeight: '1.5385 !important',
          color: 'var(--mui-palette-text-secondary) !important'
        }}
        action={<OptionMenu options={['Share', 'Edit', 'Delete']} />}
      />
      <CardMedia component='img' src='/images/cards/shared-event.png' alt='Shared Event' height='160' />
      <CardContent className='flex flex-col gap-6'>
        <div className='flex flex-col items-center pli-4 plb-1 rounded bg-backgroundPaper shadow-lg self-start -mbs-[57px]'>
          <Typography variant='h4' className='-mbe-1.5'>
            {new Date().getDate()}
          </Typography>
          <Typography color='primary.main'>{new Date().toLocaleString('default', { month: 'short' })}</Typography>
        </div>
        <div className='flex flex-col gap-2'>
          <Typography variant='h5'>How To Excel In A Technical…</Typography>
          <div className='flex flex-wrap gap-2'>
            <Chip label='Technical' color='success' variant='tonal' className='uppercase' size='small' />
            <Chip label='Excel' color='primary' variant='tonal' className='uppercase' size='small' />
            <Chip label='Account' color='info' variant='tonal' className='uppercase' size='small' />
          </div>
        </div>
        <div className='flex items-center justify-between flex-wrap gap-x-4 gap-y-2'>
          <AvatarGroup className='pull-up'>
            <Tooltip title='Jeffery Warner'>
              <CustomAvatar src='/images/avatars/1.png' alt='Jeffery Warner' size={34} />
            </Tooltip>
            <Tooltip title='Howard Lloyd'>
              <CustomAvatar src='/images/avatars/5.png' alt='Howard Lloyd' size={34} />
            </Tooltip>
            <Tooltip title='Olivia Sparks'>
              <CustomAvatar src='/images/avatars/4.png' alt='Olivia Sparks' size={34} />
            </Tooltip>
            <Tooltip title='Hallie Richards'>
              <CustomAvatar src='/images/avatars/2.png' alt='Hallie Richards' size={34} />
            </Tooltip>
          </AvatarGroup>
          <Button variant='contained'>Join Now</Button>
        </div>
        <div className='flex items-center gap-4'>
          <div className='flex items-center gap-1'>
            <i className='bx-heart text-[22px] text-textSecondary' />
            <Typography color='textSecondary'>248</Typography>
          </div>
          <div className='flex items-center gap-1'>
            <i className='bx-chat text-[22px] text-textSecondary' />
            <Typography color='textSecondary'>12</Typography>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default SharedEvent
