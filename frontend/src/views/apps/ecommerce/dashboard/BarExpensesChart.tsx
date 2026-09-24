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
    name: `${new Date().getFullYear() - 1}`,
    data: [12, 32, 12, 27, 39, 27, 17, 9, 12, 20]
  },
  {
    name: `${new Date().getFullYear() - 2}`,
    data: [-28, -20, -27, -15, -21, -17, -19, -12, -30, -18]
  }
]

const BarExpensesChart = () => {
  const options: ApexOptions = {
    chart: {
      stacked: true,
      parentHeightOffset: 0,
      toolbar: { show: false }
    },
    legend: { show: false },
    tooltip: { enabled: false },
    dataLabels: { enabled: false },
    stroke: {
      width: 2,
      lineCap: 'round',
      colors: ['var(--mui-palette-background-paper)']
    },
    colors: ['var(--mui-palette-primary-main)', 'var(--mui-palette-warning-main)'],
    states: {
      hover: { filter: { type: 'none' } },
      active: { filter: { type: 'none' } }
    },
    plotOptions: {
      bar: {
        columnWidth: '45%',
        borderRadius: 4,
        borderRadiusApplication: 'around',
        borderRadiusWhenStacked: 'all'
      }
    },
    grid: {
      show: false,
      padding: {
        top: -10,
        right: 2,
        bottom: 0
      }
    },
    xaxis: {
      labels: { show: false },
      axisTicks: { show: false },
      crosshairs: { opacity: 0 },
      axisBorder: { show: false }
    },
    yaxis: { show: false },
    responsive: [
      {
        breakpoint: 1345,
        options: {
          plotOptions: {
            bar: {
              columnWidth: '60%'
            }
          }
        }
      }
    ]
  }

  return (
    <Card className='overflow-visible'>
      <CardContent className='flex justify-between gap-4 max-sm:flex-wrap'>
        <div className='flex flex-col justify-between items-start gap-y-4 is-[30%] max-sm:items-center max-sm:is-full'>
          <Typography variant='h5'>Expenses</Typography>
          <div className='flex flex-col items-start'>
            <Typography variant='h4'>4,234</Typography>
            <div className='flex gap-x-1'>
              <i className='bx-down-arrow-alt text-xl text-error' />
              <Typography color='error.main'>15.8%</Typography>
            </div>
          </div>
          <Chip variant='tonal' size='small' color='secondary' label={`${new Date().getFullYear() - 1} year`} />
        </div>
        <div className='is-full'>
          <AppReactApexCharts type='bar' width='100%' height={156} series={series} options={options} />
        </div>
      </CardContent>
    </Card>
  )
}

export default BarExpensesChart
