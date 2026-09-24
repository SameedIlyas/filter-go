'use client'

// Next Imports
import dynamic from 'next/dynamic'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Rating from '@mui/material/Rating'
import Chip from '@mui/material/Chip'

// Third Party Imports
import type { ApexOptions } from 'apexcharts'

// Components Imports
import OptionMenu from '@core/components/option-menu'

// Styled Component Imports
const AppReactApexCharts = dynamic(() => import('@/libs/styles/AppReactApexCharts'))

// Vars
const series = [
  {
    name: 'Last Month',
    data: [20, 54, 22, 40, 20, 25, 16, 22]
  },
  {
    name: 'This Month',
    data: [20, 38, 27, 65, 43, 48, 32, 70]
  }
]

const CustomerRatings = () => {
  const options: ApexOptions = {
    chart: {
      parentHeightOffset: 0,
      toolbar: { show: false },
      dropShadow: {
        top: 14,
        blur: 4,
        left: 0,
        enabled: true,
        opacity: 0.04,
        enabledOnSeries: [1],
        color: 'var(--mui-palette-common-black)'
      }
    },
    grid: {
      show: false,
      padding: {
        left: 7,
        top: 10,
        right: 44,
        bottom: 10
      }
    },
    legend: { show: false },
    colors: ['var(--mui-palette-customColors-inputBorder)', 'var(--mui-palette-primary-main)'],
    markers: {
      size: 6,
      strokeWidth: 5,
      strokeOpacity: 1,
      hover: { size: 6 },
      colors: ['transparent'],
      strokeColors: 'transparent',
      discrete: [
        {
          size: 6,
          seriesIndex: 1,
          fillColor: 'var(--mui-palette-background-paper)',
          strokeColor: 'var(--mui-palette-primary-main)',
          dataPointIndex: series[0].data.length - 1
        },
        {
          size: 6,
          seriesIndex: 1,
          dataPointIndex: 3,
          fillColor: 'var(--mui-palette-common-white)',
          strokeColor: 'var(--mui-palette-common-black)'
        }
      ]
    },
    stroke: {
      width: [3, 5],
      curve: 'smooth',
      lineCap: 'round',
      dashArray: [8, 0]
    },
    xaxis: {
      axisTicks: { show: false },
      axisBorder: { show: false },
      categories: ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'],

      labels: {
        style: {
          fontSize: '1rem',
          colors: 'var(--mui-palette-text-disabled)',
          fontFamily: 'Public Sans'
        }
      }
    },
    yaxis: { labels: { show: false } }
  }

  return (
    <Card>
      <CardHeader title='Customer Ratings' action={<OptionMenu options={['Share', 'Refresh', 'Delete']} />} />
      <CardContent>
        <div className='flex items-center gap-x-2'>
          <Typography variant='h2'>4.0</Typography>
          <Rating value={4} emptyIcon={<i className='bx-bxs-star' />} />
        </div>
        <div className='flex gap-x-2 mbs-1'>
          <Chip label='+5.0' size='small' color='primary' variant='tonal' />
          <Typography>Points from last month</Typography>
        </div>
      </CardContent>
      <div className='p-4'>
        <AppReactApexCharts type='line' height={226} width='100%' series={series} options={options} />
      </div>
    </Card>
  )
}

export default CustomerRatings
