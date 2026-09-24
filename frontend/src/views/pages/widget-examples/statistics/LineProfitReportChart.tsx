'use client'

// Next Imports
import dynamic from 'next/dynamic'

// MUI Imports
import Card from '@mui/material/Card'
import Typography from '@mui/material/Typography'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'

// Third-party Imports
import type { ApexOptions } from 'apexcharts'

// Styled Component Imports
const AppReactApexCharts = dynamic(() => import('@/libs/styles/AppReactApexCharts'))

const series = [
  {
    data: [30, 58, 35, 53, 50, 68]
  }
]

const LineProfitReportChart = () => {
  const options: ApexOptions = {
    chart: {
      parentHeightOffset: 0,
      toolbar: { show: false },
      dropShadow: {
        top: 12,
        blur: 4,
        left: 0,
        enabled: true,
        opacity: 0.12,
        color: 'var(--mui-palette-warning-main)'
      }
    },
    tooltip: { enabled: false },
    colors: ['var(--mui-palette-warning-main)'],
    stroke: {
      width: 4,
      curve: 'smooth',
      lineCap: 'round'
    },
    grid: {
      show: false,
      padding: {
        top: -21,
        left: -5,
        bottom: -8
      }
    },
    xaxis: {
      labels: { show: false },
      axisTicks: { show: false },
      axisBorder: { show: false }
    },
    yaxis: { labels: { show: false } }
  }

  return (
    <Card className='overflow-visible'>
      <CardContent className='flex justify-between gap-6'>
        <div className='flex flex-col justify-between'>
          <div className='flex flex-col gap-y-1'>
            <Typography variant='h5'>Profit Report</Typography>
            <Chip
              color='warning'
              variant='tonal'
              size='small'
              className='uppercase self-start'
              label={`Year ${new Date().getFullYear() - 2}`}
            />
          </div>
          <div className='flex flex-col items-start'>
            <div className='flex items-center gap-x-1'>
              <i className='bx-up-arrow-alt text-xl text-success' />
              <Typography color='success.main'>68.2%</Typography>
            </div>
            <Typography variant='h4'>$84,686k</Typography>
          </div>
        </div>
        <AppReactApexCharts type='line' width='100%' height={165} series={series} options={options} />
      </CardContent>
    </Card>
  )
}

export default LineProfitReportChart
