// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'

// Type Imports
import type { ThemeColor } from '@core/types'

// Components Imports
import CustomAvatar from '@core/components/mui/Avatar'
import OptionMenu from '@core/components/option-menu'

type DataType = {
  avatarIcon: string
  avatarColor: ThemeColor
  title: string
  views: string
}

// Vars
const data: DataType[] = [
  {
    avatarIcon: 'bx-video',
    avatarColor: 'primary',
    title: 'Videography Basic Design Course',
    views: '1.2k'
  },
  {
    avatarIcon: 'bx-code-alt',
    avatarColor: 'info',
    title: 'Basic Front-end Development Course',
    views: '834'
  },
  {
    avatarIcon: 'bx-camera',
    avatarColor: 'success',
    title: 'Basic Fundamentals of Photography',
    views: '3.7k'
  },
  {
    avatarIcon: 'bx-basketball',
    avatarColor: 'warning',
    title: 'Advance Dribble Base Visual Design',
    views: '2.5k'
  },
  {
    avatarIcon: 'bx-microphone',
    avatarColor: 'error',
    title: 'Your First Singing Lesson',
    views: '948'
  }
]

const TopCourses = () => {
  return (
    <Card>
      <CardHeader title='Top Courses' action={<OptionMenu options={['Refresh', 'View All', 'Download All']} />} />
      <CardContent className='flex flex-col gap-6 md:max-lg:gap-8'>
        {data.map(item => (
          <div key={item.title} className='flex items-center gap-4'>
            <CustomAvatar variant='rounded' skin='light' color={item.avatarColor} size={40}>
              <i className={item.avatarIcon} />
            </CustomAvatar>
            <div className='flex justify-between items-center gap-4 is-full flex-wrap'>
              <Typography variant='h6' className='flex-1'>
                {item.title}
              </Typography>
              <Chip label={`${item.views} Views`} variant='tonal' size='small' color='secondary' />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default TopCourses
