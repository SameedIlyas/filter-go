'use client'

// Next Imports
import dynamic from 'next/dynamic'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'

// Third-party Imports
import type { ApexOptions } from 'apexcharts'

// Styled Component Imports
const AppReactApexCharts = dynamic(() => import('@/libs/styles/AppReactApexCharts'))

const series = [78]

const RadialExpensesChart = () => {
  // Vars
  const options: ApexOptions = {
    chart: {
      sparkline: { enabled: true }
    },
    stroke: { lineCap: 'round' },
    colors: ['var(--mui-palette-primary-main)'],
    states: {
      hover: {
        filter: { type: 'none' }
      },
      active: {
        filter: { type: 'none' }
      }
    },
    plotOptions: {
      radialBar: {
        endAngle: 90,
        startAngle: -90,
        hollow: { size: '64%' },
        track: {
          background: 'var(--mui-palette-customColors-trackBg)'
        },
        dataLabels: {
          name: { show: false },
          value: {
            offsetY: 3,
            fontWeight: 500,
            fontSize: '18px',
            color: 'var(--mui-palette-text-primary)'
          }
        }
      }
    }
  }

  return (
    <Card>
      <CardHeader
        className='pb-4'
        title='Expenses'
        titleTypographyProps={{
          variant: 'body1'
        }}
      />
      <CardContent className='flex flex-col gap-y-4 pbs-0'>
        <AppReactApexCharts type='radialBar' height={138} width='100%' series={series} options={options} />
        <Typography variant='body2' className='text-center'>
          $21k Expenses more than last month
        </Typography>
      </CardContent>
    </Card>
  )
}

export default RadialExpensesChart
