// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

// Components Imports
import CustomAvatar from '@core/components/mui/Avatar'

type DataType = {
  icon: string
  title: string
  subtitle: string
}

// Vars
const data: DataType[] = [
  { icon: 'bx-calendar', title: '17 Nov 23', subtitle: 'Date' },
  { icon: 'bx-time-five', title: '32 Minutes', subtitle: 'Duration' }
]

const UpcomingWebinar = () => {
  return (
    <Card>
      <CardContent className='flex flex-col gap-4'>
        <div className='flex justify-center pli-2.5 pbs-2.5 rounded bg-primaryLight'>
          <img src='/images/illustrations/characters-with-objects/1.png' className='bs-[148px]' />
        </div>
        <div className='flex flex-col items-start gap-2'>
          <Typography variant='h5'>Upcoming Webinar</Typography>
          <Typography>Next Generation Frontend Architecture Using Layout Engine And React Native Web.</Typography>
        </div>
        <div className='flex flex-wrap items-center justify-between gap-4'>
          {data.map(item => (
            <div key={item.title} className='flex items-center gap-3'>
              <CustomAvatar variant='rounded' skin='light' color='primary' size={40}>
                <i className={item.icon} />
              </CustomAvatar>
              <div className='flex flex-col items-start'>
                <Typography variant='h6'>{item.title}</Typography>
                <Typography variant='body2'>{item.subtitle}</Typography>
              </div>
            </div>
          ))}
        </div>
        <Button variant='contained'>Join The Event</Button>
      </CardContent>
    </Card>
  )
}

export default UpcomingWebinar
