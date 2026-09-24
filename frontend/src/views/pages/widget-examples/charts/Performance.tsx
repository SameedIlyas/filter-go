'use client'

// Next Imports
import dynamic from 'next/dynamic'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'

// Third Party Imports
import type { ApexOptions } from 'apexcharts'

// Components Imports
import OptionMenu from '@core/components/option-menu'

// Styled Component Imports
const AppReactApexCharts = dynamic(() => import('@/libs/styles/AppReactApexCharts'))

// Vars
const series = [
  { name: 'Income', data: [32, 27, 27, 30, 25, 25] },
  { name: 'Earnings', data: [25, 20, 20, 20, 20, 35] }
]

const Performance = () => {
  // Vars
  const textDisabled = 'var(--mui-palette-text-disabled)'
  const divider = 'var(--mui-palette-divider)'

  // Hooks
  const theme = useTheme()

  const options: ApexOptions = {
    chart: {
      parentHeightOffset: 0,
      toolbar: { show: false }
    },
    colors: ['var(--mui-palette-primary-main)', 'var(--mui-palette-info-main)'],
    plotOptions: {
      radar: {
        polygons: {
          connectorColors: divider,
          strokeColors: divider
        }
      }
    },
    stroke: { width: 0 },
    fill: {
      opacity: [1, 0.85]
    },
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    markers: { size: 0 },
    legend: {
      fontSize: '13px',
      labels: { colors: 'var(--mui-palette-text-secondary)' },
      markers: { offsetY: -1, offsetX: theme.direction === 'rtl' ? 7 : -4 },
      itemMargin: { horizontal: 9 }
    },
    grid: { show: false },
    xaxis: {
      labels: {
        show: true,
        style: {
          fontSize: '13px',
          colors: [textDisabled, textDisabled, textDisabled, textDisabled, textDisabled, textDisabled]
        }
      }
    },
    yaxis: { show: false }
  }

  return (
    <Card>
      <CardHeader title='Performance' action={<OptionMenu options={['Last Month', 'Last 6 months', 'Last Year']} />} />
      <CardContent>
        <div className='flex gap-x-2 mbe-2 items-center justify-between'>
          <Typography>Earning: $846.17</Typography>
          <Typography>Sales: 25.7M</Typography>
        </div>
        <AppReactApexCharts type='radar' height={332} width='100%' series={series} options={options} />
      </CardContent>
    </Card>
  )
}

export default Performance
