'use client'

// Next Imports
import dynamic from 'next/dynamic'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'

// Third Party Imports
import type { ApexOptions } from 'apexcharts'

// Components Imports
import OptionMenu from '@core/components/option-menu'

// Styled Component Imports
const AppReactApexCharts = dynamic(() => import('@/libs/styles/AppReactApexCharts'))

// Vars
const series = [75]

const CustomerRatings = () => {
  const options: ApexOptions = {
    chart: { sparkline: { enabled: true } },
    labels: ['Sales'],
    stroke: { lineCap: 'round' },
    colors: ['var(--mui-palette-success-main)'],
    states: {
      hover: { filter: { type: 'none' } },
      active: { filter: { type: 'none' } }
    },
    plotOptions: {
      radialBar: {
        hollow: {
          size: '73%',
          imageWidth: 72,
          imageHeight: 53,
          imageOffsetY: -40,
          imageClipped: false,
          image: '/images/cards/arrow.png'
        },
        track: {
          strokeWidth: '45px',
          background: 'var(--mui-palette-customColors-trackBg)'
        },
        dataLabels: {
          name: {
            offsetY: 50,
            color: 'var(--mui-palette-text-disabled)'
          },
          value: {
            offsetY: 10,
            fontWeight: 500,
            fontSize: '32px',
            color: 'var(--mui-palette-text-primary)',
            fontFamily: 'Public Sans'
          }
        }
      }
    }
  }

  return (
    <Card>
      <CardHeader title='Sales Stats' action={<OptionMenu options={['Share', 'Refresh', 'Delete']} />} />
      <CardContent className='flex flex-col gap-y-6'>
        <AppReactApexCharts type='radialBar' height={330} width='100%' series={series} options={options} />
        <div className='flex items-center justify-center gap-x-4'>
          <Typography variant='caption' className='flex items-center gap-x-2' color='text.secondary'>
            <i className='bx-bxs-circle text-[10px] text-success' />
            <span>Conversion Ratio</span>
          </Typography>
          <Typography variant='caption' className='flex items-center gap-x-2' color='text.secondary'>
            <i className='bx-bxs-circle text-[10px]' />
            <span>Total requirements</span>
          </Typography>
        </div>
      </CardContent>
    </Card>
  )
}

export default CustomerRatings
