// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Avatar from '@mui/material/Avatar'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'

// Type Imports
import type { ThemeColor } from '@core/types'

// Component Imports
import OptionMenu from '@core/components/option-menu'

type DataType = {
  imgSrc: string
  name: string
  designation: string
  completedHours: number
  totalHours: number
  progress: number
  progressColor: ThemeColor
}

// Vars
const data: DataType[] = [
  {
    imgSrc: '/images/avatars/4.png',
    name: 'Alberta',
    designation: 'UI Designer',
    completedHours: 100,
    totalHours: 138,
    progress: 90,
    progressColor: 'primary'
  },
  {
    imgSrc: '/images/avatars/3.png',
    name: 'Paul',
    designation: 'Branding',
    completedHours: 121,
    totalHours: 149,
    progress: 80,
    progressColor: 'success'
  },
  {
    imgSrc: '/images/avatars/6.png',
    name: 'Nannie',
    designation: 'iOS Developer',
    completedHours: 112,
    totalHours: 160,
    progress: 70,
    progressColor: 'secondary'
  },
  {
    imgSrc: '/images/avatars/5.png',
    name: 'Rodney',
    designation: 'iOS Developer',
    completedHours: 125,
    totalHours: 166,
    progress: 55,
    progressColor: 'info'
  },
  {
    imgSrc: '/images/avatars/7.png',
    name: 'Martin',
    designation: 'Project Designer',
    completedHours: 76,
    totalHours: 89,
    progress: 45,
    progressColor: 'warning'
  },
  {
    imgSrc: '/images/avatars/10.png',
    name: 'Nancy',
    designation: 'PHP Developer',
    completedHours: 22,
    totalHours: 45,
    progress: 35,
    progressColor: 'error'
  }
]

const EmployeeList = () => {
  return (
    <Card>
      <CardHeader title='Employee List' action={<OptionMenu options={['Refresh', 'Update', 'Share']} />} />
      <CardContent className='flex flex-col gap-[30px]'>
        {data.map(item => (
          <div key={item.name} className='flex items-center gap-3'>
            <Avatar src={item.imgSrc} alt={item.name} variant='rounded' />
            <div className='flex flex-wrap justify-between items-center gap-x-4 gap-y-1 is-full'>
              <div className='flex flex-col items-start'>
                <Typography color='text.primary'>{item.name}</Typography>
                <Typography variant='body2'>{item.designation}</Typography>
              </div>
              <div className='flex items-center gap-4'>
                <Typography>
                  <span className='text-textPrimary'>{`${item.completedHours}:`}</span>
                  <span className='text-textDisabled'>{item.totalHours}</span>
                </Typography>
                <div className='flex relative'>
                  <CircularProgress
                    variant='determinate'
                    size={30}
                    value={100}
                    thickness={5}
                    sx={{ position: 'absolute', color: 'var(--mui-palette-customColors-trackBg)' }}
                  />
                  <CircularProgress
                    variant='determinate'
                    size={30}
                    value={item.progress}
                    thickness={5}
                    color={item.progressColor}
                    sx={{ '& .MuiCircularProgress-circle': { strokeLinecap: 'round' } }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default EmployeeList
