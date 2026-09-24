'use client'

// Next Imports
import dynamic from 'next/dynamic'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'

// Third-party Imports
import type { ApexOptions } from 'apexcharts'

// Styled Component Imports
const AppReactApexCharts = dynamic(() => import('@/libs/styles/AppReactApexCharts'))

const series = [{ data: [23, 81, 70, 31, 99, 46, 73] }]

const BarRevenueChart = () => {
  // Vars
  const options: ApexOptions = {
    chart: {
      parentHeightOffset: 0,
      toolbar: { show: false }
    },
    plotOptions: {
      bar: {
        borderRadius: 2,
        distributed: true,
        columnWidth: '65%'
      }
    },
    legend: { show: false },
    tooltip: { enabled: false },
    dataLabels: { enabled: false },
    colors: [
      'var(--mui-palette-primary-lightOpacity)',
      'var(--mui-palette-primary-lightOpacity)',
      'var(--mui-palette-primary-lightOpacity)',
      'var(--mui-palette-primary-lightOpacity)',
      'var(--mui-palette-primary-main)',
      'var(--mui-palette-primary-lightOpacity)',
      'var(--mui-palette-primary-lightOpacity)'
    ],
    states: {
      hover: {
        filter: { type: 'none' }
      },
      active: {
        filter: { type: 'none' }
      }
    },
    xaxis: {
      categories: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
      axisTicks: { show: false },
      axisBorder: { show: false },
      tickPlacement: 'on',
      labels: {
        style: {
          fontSize: '11px',
          colors: 'var(--mui-palette-text-disabled)',
          fontFamily: 'Public Sans'
        }
      }
    },
    yaxis: { show: false },
    grid: {
      show: false,
      padding: {
        left: 0,
        top: -18,
        right: 7,
        bottom: -3
      }
    }
  }

  return (
    <Card>
      <CardHeader
        className='pb-3'
        title='Revenue'
        subheader='425k'
        titleTypographyProps={{
          variant: 'body1'
        }}
        subheaderTypographyProps={{
          sx: {
            fontSize: '1.5rem !important',
            color: 'var(--mui-palette-text-primary) !important',
            fontWeight: '500 !important',
            marginBlockStart: '0.125rem'
          }
        }}
      />
      <CardContent className='pbs-0'>
        <AppReactApexCharts type='bar' height={87} width='100%' series={series} options={options} />
      </CardContent>
    </Card>
  )
}

export default BarRevenueChart
