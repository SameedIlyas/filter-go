'use client'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'

// Third Party Imports
import type { ApexOptions } from 'apexcharts'

// Type Imports
import type { ThemeColor } from '@core/types'

// Components Imports
import OptionMenu from '@core/components/option-menu'
import CustomAvatar from '@core/components/mui/Avatar'

// Styled Component Imports
import AppReactApexCharts from '@/libs/styles/AppReactApexCharts'

type DataType = {
  avatarIcon: string
  avatarColor: ThemeColor
  title: string
  subtitle: string
  stat: string
}

// Vars
const data: DataType[] = [
  {
    avatarIcon: 'bx-mobile-alt',
    avatarColor: 'primary',
    title: 'Electronic',
    subtitle: 'Mobile, Earbuds, TV',
    stat: '82.5k'
  },
  {
    avatarIcon: 'bx-closet',
    avatarColor: 'success',
    title: 'Fashion',
    subtitle: 'Tshirt, Jeans, Shoes',
    stat: '23.8k'
  },
  {
    avatarIcon: 'bx-home-alt',
    avatarColor: 'info',
    title: 'Decor',
    subtitle: 'Fine Art, Dining',
    stat: '849'
  },
  {
    avatarIcon: 'bx-football',
    avatarColor: 'secondary',
    title: 'Sports',
    subtitle: 'Football, Cricket Kit',
    stat: '99'
  }
]

const OrderStatistics = () => {
  const options: ApexOptions = {
    chart: {
      sparkline: { enabled: true }
    },
    colors: [
      'var(--mui-palette-success-main)',
      'var(--mui-palette-primary-main)',
      'var(--mui-palette-secondary-main)',
      'var(--mui-palette-info-main)'
    ],
    grid: {
      padding: {}
    },
    tooltip: { enabled: false },
    dataLabels: { enabled: false },
    stroke: { width: 4, lineCap: 'round', colors: ['var(--mui-palette-background-paper)'] },
    labels: ['Fashion', 'Electronic', 'Sports', 'Decor'],
    states: {
      hover: {
        filter: { type: 'none' }
      },
      active: {
        filter: { type: 'none' }
      }
    },
    plotOptions: {
      pie: {
        customScale: 1,
        donut: {
          size: '75%',
          labels: {
            show: true,
            name: {
              offsetY: 17,
              fontSize: '0.8125rem',
              color: 'var(--mui-palette-text-secondary)'
            },
            value: {
              offsetY: -16,
              fontWeight: 500,
              fontSize: '1.125rem',
              formatter: value => `${value}`,
              color: 'var(--mui-palette-text-primary)'
            },
            total: {
              show: true,
              label: 'Weekly',
              fontSize: '0.8125rem',
              color: 'var(--mui-palette-text-secondary)',
              formatter: () => '38%'
            }
          }
        }
      }
    }
  }

  return (
    <Card>
      <CardHeader
        title='Order Statistics'
        subheader='42.82k Total Sales'
        action={<OptionMenu options={['Last Week', 'Last Month', 'Last Year']} />}
      />
      <CardContent className='flex flex-col gap-6'>
        <div className='flex items-center justify-between flex-wrap gap-x-4 gap-y-1'>
          <div className='flex flex-col items-start gap-1'>
            <Typography variant='h3'>8,258</Typography>
            <Typography variant='caption' color='text.secondary'>
              Total Orders
            </Typography>
          </div>
          <AppReactApexCharts type='donut' height={110} width={110} options={options} series={[45, 80, 20, 40]} />
        </div>
        <div className='flex flex-col gap-5'>
          {data.map(item => (
            <div key={item.title} className='flex items-center gap-3'>
              <CustomAvatar variant='rounded' skin='light' color={item.avatarColor} size={40}>
                <i className={item.avatarIcon} />
              </CustomAvatar>
              <div className='flex flex-wrap justify-between items-center gap-x-4 gap-y-1 is-full'>
                <div className='flex flex-col items-start'>
                  <Typography variant='h6'>{item.title}</Typography>
                  <Typography variant='body2'>{item.subtitle}</Typography>
                </div>
                <Typography color='text.primary'>{item.stat}</Typography>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default OrderStatistics
