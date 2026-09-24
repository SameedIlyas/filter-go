// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'

// Third-party Imports
import classnames from 'classnames'

// Type Imports
import type { ThemeColor } from '@core/types'

// Components Imports
import OptionMenu from '@core/components/option-menu'
import CustomAvatar from '@core/components/mui/Avatar'

type DataType = {
  avatarIcon: string
  avatarColor: ThemeColor
  title: string
  trendNumber: number
  trend?: 'positive' | 'negative'
  stat: string
}

// Vars
const data: DataType[] = [
  {
    avatarIcon: 'bx-cube',
    avatarColor: 'primary',
    title: 'Packages in transit',
    trendNumber: 25.8,
    stat: '10k'
  },
  {
    avatarIcon: 'bx-bxs-truck',
    avatarColor: 'info',
    title: 'Packages out for delivery',
    trendNumber: 4.3,
    stat: '5k'
  },
  {
    avatarIcon: 'bx-check-circle',
    avatarColor: 'success',
    title: 'Packages delivered',
    trendNumber: 12.5,
    trend: 'negative',
    stat: '15k'
  },
  {
    avatarIcon: 'bx-bxs-offer',
    avatarColor: 'warning',
    title: 'Delivery success rate',
    trendNumber: 35.6,
    stat: '95%'
  },
  {
    avatarIcon: 'bx-time-five',
    avatarColor: 'secondary',
    title: 'Average delivery time',
    trendNumber: 2.15,
    trend: 'negative',
    stat: '2.5 Days'
  },
  {
    avatarIcon: 'bx-group',
    avatarColor: 'error',
    title: 'Customer satisfaction',
    trendNumber: 5.7,
    stat: '4.5/5'
  }
]

const DeliveryPerformance = () => {
  return (
    <Card>
      <CardHeader
        title='Delivery Performance'
        subheader='12% increase in this month'
        action={<OptionMenu options={['Last Week', 'Last Month', 'Last Year']} />}
      />
      <CardContent className='flex flex-col gap-6'>
        {data.map(item => {
          const { trend = 'positive' } = item

          return (
            <div key={item.stat} className='flex items-center gap-4'>
              <CustomAvatar variant='rounded' skin='light' color={item.avatarColor}>
                <i className={item.avatarIcon} />
              </CustomAvatar>
              <div className='flex flex-wrap justify-between items-center gap-x-4 gap-y-1 is-full'>
                <div className='flex flex-col items-start gap-0.5'>
                  <Typography color='text.primary'>{item.title}</Typography>
                  <div className='flex items-center gap-1'>
                    <i
                      className={classnames({
                        'bx-chevron-up text-success': trend === 'positive',
                        'bx-chevron-down text-error': trend === 'negative'
                      })}
                    />
                    <Typography color={trend === 'negative' ? 'error.main' : 'success.main'}>
                      {`${item.trendNumber}%`}
                    </Typography>
                  </div>
                </div>
                <Typography variant='h6'>{item.stat}</Typography>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

export default DeliveryPerformance
