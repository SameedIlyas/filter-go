'use client'

// Next Imports
import dynamic from 'next/dynamic'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import CardActions from '@mui/material/CardActions'
import Typography from '@mui/material/Typography'

// Third Party Imports
import type { ApexOptions } from 'apexcharts'

// Components Imports
import OptionMenu from '@core/components/option-menu'
import CustomAvatar from '@core/components/mui/Avatar'
import CustomIconButton from '@core/components/mui/IconButton'
import DirectionalIcon from '@components/DirectionalIcon'

// Styled Component Imports
const AppReactApexCharts = dynamic(() => import('@/libs/styles/AppReactApexCharts'))

// Vars
const series = [
  {
    name: 'Balance',
    data: [137, 210, 160, 275, 205, 315]
  }
]

const TotalBalance = () => {
  const options: ApexOptions = {
    chart: {
      parentHeightOffset: 0,
      toolbar: { show: false },
      dropShadow: {
        top: 15,
        blur: 5,
        left: 0,
        opacity: 0.1,
        enabled: true,
        color: 'var(--mui-palette-warning-main)'
      }
    },
    grid: {
      show: false,
      padding: {
        left: 0,
        top: -20,
        bottom: 3
      }
    },
    legend: { show: false },
    colors: ['var(--mui-palette-warning-main)'],
    markers: {
      size: 8,
      strokeWidth: 6,
      strokeOpacity: 1,
      hover: { size: 8 },
      colors: ['transparent'],
      strokeColors: 'transparent',
      discrete: [
        {
          size: 8,
          seriesIndex: 0,
          fillColor: 'var(--mui-palette-background-paper)',
          strokeColor: 'var(--mui-palette-warning-main)',
          dataPointIndex: series[0].data.length - 1
        }
      ]
    },
    stroke: {
      width: 4,
      curve: 'smooth',
      lineCap: 'round'
    },
    xaxis: {
      axisTicks: { show: false },
      axisBorder: { show: false },
      categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      labels: {
        style: {
          fontSize: '13px',
          colors: 'var(--mui-palette-text-disabled)',
          fontFamily: 'Public Sans'
        }
      }
    },
    yaxis: { labels: { show: false } }
  }

  return (
    <Card>
      <CardHeader title='Total Balance' action={<OptionMenu options={['Share', 'Refresh', 'Delete']} />} />
      <CardContent className='flex flex-col gap-y-6'>
        <div className='flex items-center justify-between gap-x-2'>
          <div className='flex items-center gap-x-3'>
            <CustomAvatar variant='rounded' size={40} skin='light' color='warning'>
              <i className='bx-wallet' />
            </CustomAvatar>
            <div>
              <Typography variant='h6'>$2.54k</Typography>
              <Typography className='mbs-0.5'>Wallet</Typography>
            </div>
          </div>
          <div className='flex items-center gap-x-3'>
            <CustomAvatar variant='rounded' size={40} color='secondary' skin='light'>
              <i className='bx-dollar' />
            </CustomAvatar>
            <div>
              <Typography variant='h6'>$4.21k</Typography>
              <Typography className='mbs-0.5'>Paypal</Typography>
            </div>
          </div>
        </div>
        <AppReactApexCharts type='line' height={208} width='100%' series={series} options={options} />
      </CardContent>
      <CardActions className='flex items-center justify-between gap-x-4 border-bs pbs-6'>
        <Typography variant='body2'>You have done 57.6% more sales. Check your new badge in your profile.</Typography>
        <CustomIconButton variant='tonal' color='warning' className='shrink-0'>
          <DirectionalIcon className='text-[22px]' ltrIconClass='bx-chevron-right' rtlIconClass='bx-chevron-left' />
        </CustomIconButton>
      </CardActions>
    </Card>
  )
}

export default TotalBalance
