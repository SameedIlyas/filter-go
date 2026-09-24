// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'

// Type Imports
import type { ThemeColor } from '@core/types'

// Components Imports
import CustomIconButton from '@core/components/mui/IconButton'
import OptionMenu from '@core/components/option-menu'
import DirectionalIcon from '@components/DirectionalIcon'

type DataType = {
  progress: number
  color: ThemeColor
  title: string
  tasks: number
}

// Vars
const data: DataType[] = [
  {
    progress: 72,
    color: 'primary',
    title: 'User Experience Design',
    tasks: 120
  },
  {
    progress: 48,
    color: 'success',
    title: 'Basic fundamentals',
    tasks: 32
  },
  {
    progress: 15,
    color: 'error',
    title: 'React Native components',
    tasks: 182
  },
  {
    progress: 28,
    color: 'info',
    title: 'Basic of music theory',
    tasks: 56
  }
]

const AssignmentProgress = () => {
  return (
    <Card>
      <CardHeader title='Assignment Progress' action={<OptionMenu options={['Refresh', 'Update', 'Share']} />} />
      <CardContent className='flex flex-col gap-8'>
        {data.map(item => (
          <div key={item.title} className='flex items-center gap-4'>
            <div className='relative flex items-center justify-center'>
              <CircularProgress
                variant='determinate'
                size={54}
                value={100}
                thickness={4}
                className='absolute text-[var(--mui-palette-customColors-trackBg)]'
              />
              <CircularProgress
                variant='determinate'
                size={54}
                value={item.progress}
                thickness={4}
                color={item.color}
                sx={{ '& .MuiCircularProgress-circle': { strokeLinecap: 'round' } }}
              />
              <Typography variant='h6' className='absolute'>
                {`${item.progress}%`}
              </Typography>
            </div>
            <div className='flex justify-between items-center is-full gap-4'>
              <div className='flex flex-col items-start gap-1'>
                <Typography variant='h6'>{item.title}</Typography>
                <Typography>{`${item.tasks} Tasks`}</Typography>
              </div>
              <CustomIconButton size='small' variant='tonal' color='secondary' className='min-is-fit'>
                <DirectionalIcon ltrIconClass='bx-chevron-right' rtlIconClass='bx-chevron-left' />
              </CustomIconButton>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default AssignmentProgress
