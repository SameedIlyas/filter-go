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
  title: string
  views: string
  icon: string
  color: ThemeColor
}

// Vars
const data: DataType[] = [
  { title: 'Videography Basic Design Course', views: '1.2k', icon: 'bx-video', color: 'primary' },
  { title: 'Basic Front-end Development Course', views: '834', icon: 'bx-code', color: 'info' },
  { title: 'Basic Fundamentals of Photography', views: '3.7k', icon: 'bx-image', color: 'success' },
  { title: 'Advance Dribble Base Visual Design', views: '2.5k', icon: 'bx-palette', color: 'warning' },
  { title: 'Your First Singing Lesson', views: '948', icon: 'bx-music', color: 'error' }
]

const TopCourses = () => {
  return (
    <Card>
      <CardHeader
        title='Top Courses'
        action={<OptionMenu iconClassName='text-[22px]' options={['Last 28 Days', 'Last Month', 'Last Year']} />}
      />
      <CardContent className='flex flex-col gap-6'>
        {data.map((item, i) => (
          <div key={i} className='flex items-center gap-4'>
            <CustomAvatar size={40} variant='rounded' skin='light' color={item.color}>
              <i className={item.icon} />
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
