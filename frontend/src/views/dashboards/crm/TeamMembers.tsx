// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import Avatar from '@mui/material/Avatar'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'

// Type Imports
import type { ThemeColor } from '@core/types'

// Components Imports
import OptionsMenu from '@core/components/option-menu'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

type DataType = {
  imgSrc: string
  name: string
  post: string
  project: string
  color: ThemeColor
  completedTasks: number
  totalTasks: number
  progressValue: number
}

// Vars
const teamData: DataType[] = [
  {
    imgSrc: '/images/avatars/1.png',
    name: 'Dean Hogan',
    post: 'IOS developer',
    project: 'Zipcar',
    color: 'primary',
    completedTasks: 87,
    totalTasks: 135,
    progressValue: 60
  },
  {
    imgSrc: '/images/avatars/2.png',
    name: 'Hilda Rice',
    post: 'Laravel developer',
    project: 'Bitbank',
    color: 'error',
    completedTasks: 340,
    totalTasks: 420,
    progressValue: 80
  },
  {
    imgSrc: '/images/avatars/5.png',
    name: "Andrew O'Brian",
    post: 'React developer',
    project: 'Payers',
    color: 'warning',
    completedTasks: 50,
    totalTasks: 82,
    progressValue: 50
  },
  {
    imgSrc: '/images/avatars/16.png',
    name: 'Elanor Price',
    post: 'Angular developer',
    project: 'Brandi',
    color: 'info',
    completedTasks: 98,
    totalTasks: 260,
    progressValue: 70
  },
  {
    imgSrc: '/images/avatars/7.png',
    name: 'Carl Bowman',
    post: 'VueJs developer',
    project: 'Aviato',
    color: 'secondary',
    completedTasks: 12,
    totalTasks: 25,
    progressValue: 60
  }
]

const TeamMembers = () => {
  return (
    <Card>
      <CardHeader title='Team Members' action={<OptionsMenu options={['Refresh', 'Share', 'Update']} />} />
      <div className='overflow-x-auto'>
        <table className={tableStyles.table}>
          <thead className='border-none'>
            <tr>
              <th>Name</th>
              <th>Project</th>
              <th>Tasks</th>
              <th>Progress</th>
            </tr>
          </thead>
          <tbody>
            {teamData.map(item => (
              <tr key={item.name} className='border-none'>
                <td>
                  <div className='flex items-center gap-3'>
                    <Avatar src={item.imgSrc} alt={item.name} />
                    <div className='flex flex-col items-start'>
                      <Typography variant='h6'>{item.name}</Typography>
                      <Typography color='text.secondary'>{item.post}</Typography>
                    </div>
                  </div>
                </td>
                <td>
                  <Chip label={item.project} color={item.color} variant='tonal' size='small' className='uppercase' />
                </td>
                <td>
                  <Typography className='font-medium'>{`${item.completedTasks}/${item.totalTasks}`}</Typography>
                </td>
                <td>
                  <div className='flex justify-center relative'>
                    <CircularProgress
                      variant='determinate'
                      size={32}
                      value={100}
                      thickness={5}
                      sx={{ position: 'absolute', color: 'var(--mui-palette-customColors-trackBg)' }}
                    />
                    <CircularProgress
                      variant='determinate'
                      size={32}
                      value={item.progressValue}
                      thickness={5}
                      color={item.color}
                      sx={{ '& .MuiCircularProgress-circle': { strokeLinecap: 'round' } }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export default TeamMembers
