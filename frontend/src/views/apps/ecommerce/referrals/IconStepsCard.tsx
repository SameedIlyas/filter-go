// React Imports
import type { ReactNode } from 'react'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'

type DataType = {
  description: string
  value: string
  icon: ReactNode
}

// Vars
const data: DataType[] = [
  {
    description: 'Create & validate your referral link and get',
    value: '$50',
    icon: <i className='bx-rocket text-4xl' />
  },
  {
    description: 'For every new signup you get',
    value: '10%',
    icon: <i className='bx-bxs-user-badge text-4xl' />
  },
  {
    description: 'Get other friends to generate link and get',
    value: '$100',
    icon: <i className='bx-paper-plane text-4xl' />
  }
]

const IconStepsCard = () => {
  return (
    <Card>
      <CardHeader title='How to use' subheader='Integrate your referral code in 3 easy steps.' className='pbe-6' />
      <CardContent className='flex flex-col sm:flex-row items-center justify-around gap-6'>
        {data.map((item, index) => (
          <div key={index} className='flex flex-col items-center gap-2 max-is-[185px]'>
            <div className='flex border border-dashed border-primary rounded-full p-4 text-primary'>{item.icon}</div>
            <Typography className='text-wrap text-center'>{item.description}</Typography>
            <Typography variant='h6' color='primary.main'>
              {item.value}
            </Typography>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default IconStepsCard
