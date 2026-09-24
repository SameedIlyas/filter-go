'use client'

// Next Imports
import dynamic from 'next/dynamic'

// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Grid from '@mui/material/Grid'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'

// Third Party Imports
import type { ApexOptions } from 'apexcharts'

// Components Imports
import OptionMenu from '@core/components/option-menu'

// Styled Component Imports
const AppReactApexCharts = dynamic(() => import('@/libs/styles/AppReactApexCharts'))

type SessionDataTypes = {
  title: string
  stat: string
}

// Vars
const series = [75]

const sessionData: SessionDataTypes[] = [
  {
    title: 'Today',
    stat: '+ $340'
  },
  {
    title: 'Last Week',
    stat: '+ $680'
  },
  {
    title: 'Last Month',
    stat: '+ $3,540'
  }
]

const SessionsOverview = () => {
  const options: ApexOptions = {
    chart: { sparkline: { enabled: true } },
    labels: ['Loss Rate'],
    stroke: { lineCap: 'round' },
    colors: ['var(--mui-palette-warning-main)'],
    states: {
      hover: { filter: { type: 'none' } },
      active: { filter: { type: 'none' } }
    },
    grid: {
      padding: {
        top: -15,
        bottom: -10
      }
    },
    plotOptions: {
      radialBar: {
        endAngle: 140,
        startAngle: -140,
        hollow: { size: '66%' },
        track: {
          strokeWidth: '40%',
          background: 'var(--mui-palette-customColors-trackBg)'
        },
        dataLabels: {
          name: {
            offsetY: 60,
            fontSize: '13px',
            color: 'var(--mui-palette-text-disabled)',
            fontFamily: 'Public Sans'
          },
          value: {
            offsetY: -5,
            fontWeight: 500,
            fontSize: '24px',
            color: 'var(--mui-palette-text-primary)',
            fontFamily: 'Public Sans'
          }
        }
      }
    }
  }

  return (
    <Card>
      <CardHeader title='Sessions Overview' action={<OptionMenu options={['Share', 'Refresh', 'Delete']} />} />
      <CardContent className='flex flex-col gap-y-8'>
        <div className='flex items-center max-sm:flex-wrap max-sm:justify-center justify-between gap-x-4 gap-y-2'>
          <div>
            <Typography variant='h3'>32,754</Typography>
            <Typography color='success.main'>+0.7645%</Typography>
          </div>
          <div className='flex items-center gap-x-10'>
            {sessionData.map(data => (
              <div key={data.title} className='flex flex-col gap-y-0.5 items-center'>
                <Typography variant='body2' color='text.disabled'>
                  {data.title}
                </Typography>
                <Typography className='font-medium'>{data.stat}</Typography>
              </div>
            ))}
          </div>
        </div>
        <Grid container spacing={10}>
          <Grid size={{ xs: 12, lg: 4 }}>
            <AppReactApexCharts type='radialBar' height={200} width='100%' series={series} options={options} />
          </Grid>
          <Grid size={{ xs: 12, lg: 8 }} className='flex flex-col justify-center'>
            <Typography>Effective Return</Typography>
            <div className='flex items-center gap-x-4'>
              <LinearProgress variant='determinate' className='bs-2 is-full' value={74} />
              <Typography variant='body2' className='font-medium'>
                74%
              </Typography>
            </div>
            <Typography className='mbs-6'>Invalid Session</Typography>
            <div className='flex items-center gap-x-4'>
              <LinearProgress variant='determinate' className='bs-2 is-full' value={40} />
              <Typography variant='body2' className='font-medium'>
                40%
              </Typography>
            </div>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  )
}

export default SessionsOverview
