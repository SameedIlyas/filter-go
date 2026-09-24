// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'

// Component Imports
import OptionMenu from '@core/components/option-menu'
import CustomAvatar from '@core/components/mui/Avatar'

type DataType = {
  imgSrc: string
  title: string
  subtitle: string
  courses: number
}

const data: DataType[] = [
  {
    imgSrc: '/images/avatars/1.png',
    title: 'John Hale',
    subtitle: 'Business Intelligence',
    courses: 33
  },
  {
    imgSrc: '/images/avatars/7.png',
    title: 'Roy Sparks',
    subtitle: 'UI/UX Design',
    courses: 12
  },
  {
    imgSrc: '/images/avatars/20.png',
    title: 'Lizzie Payne',
    subtitle: 'Digital Marketing',
    courses: 52
  },
  {
    imgSrc: '/images/avatars/2.png',
    title: 'Ella Weber',
    subtitle: 'React Native',
    courses: 8
  },
  {
    imgSrc: '/images/avatars/8.png',
    title: 'Ava McCoy',
    subtitle: 'Web Development',
    courses: 21
  },
  {
    imgSrc: '/images/avatars/9.png',
    title: 'Liam Powell',
    subtitle: 'Python',
    courses: 15
  }
]

const PopularInstructors = () => {
  return (
    <Card>
      <CardHeader title='Popular Instructors' action={<OptionMenu options={['Refresh', 'Update', 'Share']} />} />
      <Divider />
      <CardContent className='flex items-center justify-between gap-4 plb-4'>
        <Typography className='uppercase'>Top Instructors</Typography>
        <Typography className='uppercase'>Courses</Typography>
      </CardContent>
      <Divider />
      <CardContent className='flex flex-col gap-5 md:max-lg:gap-4 md:max-lg:plb-4'>
        {data.map(item => (
          <div key={item.title} className='flex items-center gap-4'>
            <CustomAvatar src={item.imgSrc} alt={item.title} size={34} />
            <div className='flex items-center justify-between gap-4 is-full'>
              <div className='flex flex-col'>
                <Typography variant='h6'>{item.title}</Typography>
                <Typography variant='body2'>{item.subtitle}</Typography>
              </div>
              <Typography variant='h6'>{item.courses}</Typography>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default PopularInstructors
