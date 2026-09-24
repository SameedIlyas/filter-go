'use client'

// Next Imports
import dynamic from 'next/dynamic'

// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'

// Third Party Imports
import type { ApexOptions } from 'apexcharts'

// Styled Component Imports
const AppReactApexCharts = dynamic(() => import('@/libs/styles/AppReactApexCharts'))

// Vars
const series = [78]

const Score = () => {
  const options: ApexOptions = {
    chart: { sparkline: { enabled: true } },
    labels: ['Out of 100'],
    stroke: { dashArray: 5 },
    colors: ['var(--mui-palette-primary-main)'],
    states: {
      hover: { filter: { type: 'none' } },
      active: { filter: { type: 'none' } }
    },
    grid: {
      padding: {
        top: -20,
        bottom: -18
      }
    },
    fill: {
      type: 'gradient',
      gradient: {
        shade: 'dark',
        opacityTo: 0.6,
        opacityFrom: 1,
        shadeIntensity: 0.5,
        stops: [30, 70, 100],
        inverseColors: false,
        gradientToColors: ['var(--mui-palette-primary-main)']
      }
    },
    plotOptions: {
      radialBar: {
        endAngle: 150,
        startAngle: -140,
        hollow: { size: '55%' },
        track: { background: 'transparent' },
        dataLabels: {
          name: {
            offsetY: 30,
            fontSize: '15px',
            color: 'var(--mui-palette-text-secondary)',
            fontFamily: 'Public Sans'
          },
          value: {
            offsetY: -10,
            fontWeight: 500,
            fontSize: '24px',
            formatter: value => `${value}%`,
            color: 'var(--mui-palette-text-primary)',
            fontFamily: 'Public Sans'
          }
        }
      }
    }
  }

  return (
    <Card>
      <CardContent className='flex flex-col items-center justify-center'>
        <Typography>Your Score is</Typography>
        <Typography variant='h5'>Awesome</Typography>
        <div className='flex flex-col gap-y-4'>
          <AppReactApexCharts type='radialBar' height={268} width='100%' series={series} options={options} />
          <Typography className='flex flex-col text-center'>
            <span>Your score is based on the last</span>
            <span className='font-medium text-textPrimary'>287 Transactions</span>
          </Typography>
          <Button variant='contained' className='self-center'>
            View My Account
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default Score
