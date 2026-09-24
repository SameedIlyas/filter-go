'use client'

// Next Imports
import dynamic from 'next/dynamic'

// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Grid from '@mui/material/Grid'
import { useTheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'

// Third-party Imports
import type { ApexOptions } from 'apexcharts'

// Styled Component Imports
const AppReactApexCharts = dynamic(() => import('@/libs/styles/AppReactApexCharts'))

const series = {
  barSeries: [{ data: [20, 60, 53, 25, 42, 86, 55] }],
  lineAreaSeries: [{ data: [14, 22, 17, 40, 12, 35, 25] }]
}

const NewVisitorsAndActivityCharts = () => {
  // Hook
  const theme = useTheme()

  // Vars
  const barOptions: ApexOptions = {
    chart: {
      parentHeightOffset: 0,
      toolbar: { show: false }
    },
    plotOptions: {
      bar: {
        borderRadius: 6,
        distributed: true,
        columnWidth: '40%'
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
      'var(--mui-palette-primary-lightOpacity)',
      'var(--mui-palette-primary-main)',
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
          fontSize: '14px',
          colors: 'var(--mui-palette-text-disabled)',
          fontFamily: 'Public Sans'
        }
      }
    },
    yaxis: { show: false },
    grid: {
      show: false,
      padding: {
        top: -10,
        left: 5,
        right: 5,
        bottom: -2
      }
    }
  }

  const lineAreaChartOptions: ApexOptions = {
    chart: {
      parentHeightOffset: 0,
      toolbar: { show: false }
    },
    tooltip: { enabled: false },
    dataLabels: { enabled: false },
    stroke: {
      width: 2,
      curve: 'smooth'
    },
    grid: {
      show: false,
      padding: {
        top: -12,
        bottom: -9
      }
    },
    fill: {
      type: 'gradient',
      gradient: {
        opacityTo: 0.7,
        opacityFrom: 0.5,
        shadeIntensity: 1,
        stops: [0, 90, 100],
        colorStops: [
          [
            {
              offset: 0,
              opacity: 0.6,
              color: 'var(--mui-palette-success-main)'
            },
            {
              offset: 100,
              opacity: 0.1,
              color: 'var(--mui-palette-background-default)'
            }
          ]
        ]
      }
    },
    theme: {
      monochrome: {
        enabled: true,
        shadeTo: 'light',
        shadeIntensity: 1,
        color: theme.palette.success.main
      }
    },
    xaxis: {
      axisTicks: { show: false },
      axisBorder: { show: false },
      categories: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
      labels: {
        style: {
          fontSize: '14px',
          colors: 'var(--mui-palette-text-disabled)',
          fontFamily: 'Public Sans'
        }
      }
    },
    yaxis: { show: false }
  }

  return (
    <Card>
      <CardContent>
        <Grid container spacing={6}>
          <Grid size={{ xs: 12, md: 6 }} className='max-md:border-be md:border-ie md:-mlb-6'>
            <div className='flex items-center justify-between pbe-6 md:mie-6 max-md:pie-6'>
              <Typography className='pbs-6' variant='h5'>
                New Visitors
              </Typography>
              <Typography variant='caption' color='text.secondary' className='pbs-6'>
                Last Week
              </Typography>
            </div>
            <div className='flex gap-x-6 justify-between md:mie-6 max-md:mbe-6 max-md:pie-6'>
              <div className='flex flex-col gap-y-1 mbs-auto'>
                <Typography variant='h3'>23%</Typography>
                <div className='flex gap-1 items-center'>
                  <i className='bx-down-arrow-alt text-xl text-error' />
                  <Typography variant='body2' color='error.main' className='font-medium'>
                    8.75%
                  </Typography>
                </div>
              </div>
              <AppReactApexCharts type='bar' height={150} width='100%' series={series.barSeries} options={barOptions} />
            </div>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <div className='flex items-center justify-between pbe-6 max-md:pie-6'>
              <Typography variant='h5'>Activity</Typography>
              <Typography variant='caption' color='text.secondary'>
                Last Week
              </Typography>
            </div>
            <div className='flex gap-x-6 justify-between max-md:pie-6'>
              <div className='flex flex-col gap-y-1 mbs-auto'>
                <Typography variant='h3'>82%</Typography>
                <div className='flex gap-1 items-center'>
                  <i className='bx-up-arrow-alt text-xl text-success' />
                  <Typography variant='body2' color='success.main' className='font-medium'>
                    19.6%
                  </Typography>
                </div>
              </div>
              <AppReactApexCharts
                type='area'
                height={150}
                width='100%'
                series={series.lineAreaSeries}
                options={lineAreaChartOptions}
              />
            </div>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  )
}

export default NewVisitorsAndActivityCharts
