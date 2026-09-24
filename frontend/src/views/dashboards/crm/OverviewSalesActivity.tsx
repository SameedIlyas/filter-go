'use client'

// Next Imports
import dynamic from 'next/dynamic'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'

// Third Party Imports
import type { ApexOptions } from 'apexcharts'

// Components Imports
import OptionMenu from '@core/components/option-menu'

// Styled Component Imports
const AppReactApexCharts = dynamic(() => import('@/libs/styles/AppReactApexCharts'))

// Vars
const series = [
  {
    name: 'Product A',
    data: [77, 50, 59, 67, 48, 84, 64]
  },
  {
    name: 'Product B',
    data: [20, 23, 27, 27, 30, 18, 25]
  }
]

const OverviewSalesActivity = () => {
  const options: ApexOptions = {
    chart: {
      stacked: true,
      parentHeightOffset: 0,
      toolbar: { show: false }
    },
    legend: { show: false },
    dataLabels: { enabled: false },
    stroke: {
      width: 6,
      lineCap: 'round',
      colors: ['var(--mui-palette-background-paper)']
    },
    colors: ['var(--mui-palette-error-main)', 'var(--mui-palette-secondary-main)'],
    states: {
      hover: { filter: { type: 'none' } },
      active: { filter: { type: 'none' } }
    },
    grid: {
      show: false
    },
    plotOptions: {
      bar: {
        borderRadius: 7,
        columnWidth: '45%',
        borderRadiusApplication: 'around',
        borderRadiusWhenStacked: 'all'
      }
    },
    xaxis: {
      axisTicks: { show: false },
      crosshairs: { opacity: 0 },
      axisBorder: { show: false },
      categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'],
      labels: {
        style: {
          fontSize: '15px',
          colors: 'var(--mui-palette-text-disabled)',
          fontFamily: 'Public Sans'
        }
      }
    },
    yaxis: { show: false },
    responsive: [
      {
        breakpoint: 1450,
        options: {
          plotOptions: {
            bar: {
              columnWidth: '50%',
              borderRadius: 6
            }
          }
        }
      }
    ]
  }

  return (
    <Card>
      <CardHeader
        title='Overview & Sales Activity'
        subheader='Check out each column for more details'
        action={<OptionMenu options={['Share', 'Refresh', 'Delete']} />}
      />
      <CardContent className='flex flex-col gap-y-6'>
        <AppReactApexCharts type='bar' height={322} width='100%' series={series} options={options} />
      </CardContent>
    </Card>
  )
}

export default OverviewSalesActivity
