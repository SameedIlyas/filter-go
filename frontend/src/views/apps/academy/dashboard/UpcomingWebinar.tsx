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
  value: string
}

// Vars
const data: DataType[] = [
  { icon: 'bx-calendar', title: '17 Nov 23', value: 'Date' },
  { icon: 'bx-time-five', title: '32 Minutes', value: 'Duration' }
]

const UpcomingWebinar = () => {
  return (
    <Card>
      <CardContent className='flex flex-col gap-4'>
        <div className='flex justify-center pli-2.5 pbs-2.5 rounded bg-primaryLight'>
          <img src='/images/illustrations/characters-with-objects/1.png' className='bs-[150px]' />
        </div>
        <div>
          <Typography variant='h5' className='mbe-2'>
            Upcoming Webinar
          </Typography>
          <Typography>Next Generation Frontend Architecture Using Layout Engine And React Native Web.</Typography>
        </div>
        <div className='flex flex-wrap justify-between gap-4'>
          {data.map((item, i) => (
            <div key={i} className='flex items-center gap-3'>
              <CustomAvatar size={40} variant='rounded' skin='light' color='primary'>
                <i className={item.icon} />
              </CustomAvatar>
              <div>
                <Typography variant='h6'>{item.title}</Typography>
                <Typography variant='body2'>{item.value}</Typography>
              </div>
            </div>
          ))}
        </div>
        <Button variant='contained'>Join the event</Button>
      </CardContent>
    </Card>
  )
}

export default UpcomingWebinar
