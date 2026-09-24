'use client'

// Next Imports
import dynamic from 'next/dynamic'

// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'

// Third Party Imports
import type { ApexOptions } from 'apexcharts'

// Components Imports
import CustomAvatar from '@core/components/mui/Avatar'
import OptionMenu from '@core/components/option-menu'

// Styled Component Imports
const AppReactApexCharts = dynamic(() => import('@/libs/styles/AppReactApexCharts'))

type ReportDataType = {
  title: string
  avatarWidth: number
  stats: string
  trendNumber: number
  trend: 'up' | 'down'
  avatarSrc: string
}

// Vars
const series = [
  {
    name: 'Income',
    data: [3350, 3350, 4800, 4800, 2950, 2950, 1800, 1800, 3750, 3750, 5700, 5700]
  }
]

const reportData: ReportDataType[] = [
  {
    title: 'Income',
    avatarWidth: 20,
    stats: '$42,845',
    trendNumber: 2.34,
    trend: 'up',
    avatarSrc: '/images/cards/paypal-without-bg.png'
  },
  {
    avatarWidth: 20,
    title: 'Expense',
    stats: '$38,658',
    trendNumber: 1.15,
    trend: 'down',
    avatarSrc: '/images/cards/credit-card-without-bg.png'
  },
  {
    title: 'Profit',
    avatarWidth: 22,
    stats: '$18,220',
    trendNumber: 1.34,
    trend: 'up',
    avatarSrc: '/images/cards/wallet-without-bg.png'
  }
]

const TotalIncome = () => {
  // Hooks
  const theme = useTheme()

  const options: ApexOptions = {
    chart: {
      parentHeightOffset: 0,
      toolbar: { show: false }
    },
    dataLabels: { enabled: false },
    stroke: {
      width: 4,
      curve: 'straight'
    },
    grid: {
      borderColor: 'var(--mui-palette-divider)',
      strokeDashArray: 6,
      padding: {
        top: 5,
        right: 6,
        bottom: 7
      }
    },
    fill: {
      type: 'gradient',
      gradient: {
        opacityTo: 0.5,
        opacityFrom: 0.8,
        stops: [0, 95, 100],
        shadeIntensity: 0.8,
        colorStops: [
          [
            {
              offset: 0,
              opacity: 0.5,
              color: 'var(--mui-palette-primary-main)'
            },
            {
              opacity: 0.2,
              offset: 100,
              color: 'var(--mui-palette-background-paper)'
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
        color: theme.palette.primary.main
      }
    },
    xaxis: {
      axisTicks: { show: false },
      axisBorder: { show: false },
      categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      labels: {
        style: {
          fontSize: '13px',
          colors: 'var(--mui-palette-text-disabled)',
          fontFamily: 'Public Sans'
        }
      }
    },
    yaxis: {
      tickAmount: 6,
      labels: {
        formatter: value => `${value / 1000}k`,
        style: {
          fontSize: '13px',
          colors: 'var(--mui-palette-text-disabled)',
          fontFamily: 'Public Sans'
        }
      }
    }
  }

  return (
    <Card>
      <Grid container spacing={6}>
        <Grid size={{ xs: 12, lg: 7, xl: 8 }} className='max-md:border-be md:border-ie'>
          <CardHeader
            title='Total Income'
            subheader='Yearly report overview'
            action={<OptionMenu options={['Share', 'Refresh', 'Delete']} />}
          />
          <CardContent className='flex flex-col gap-y-6'>
            <AppReactApexCharts type='area' height={315} width='100%' series={series} options={options} />
          </CardContent>
        </Grid>
        <Grid size={{ xs: 12, lg: 5, xl: 4 }}>
          <CardHeader
            title='Report'
            subheader='Monthly Avg. $45.57k'
            action={<OptionMenu options={['Share', 'Refresh', 'Delete']} />}
          />
          <CardContent className='flex flex-col gap-y-4'>
            {reportData.map((data, index) => (
              <div key={index} className='plb-3 pli-4 flex items-center justify-between gap-x-4 bg-actionHover rounded'>
                <CustomAvatar size={40} variant='rounded' className='bg-backgroundPaper'>
                  <img src={data.avatarSrc} alt='Paypal' className='is-5' />
                </CustomAvatar>
                <div>
                  <Typography color='text.disabled'>{data.title}</Typography>
                  <Typography variant='h5'>{data.stats}</Typography>
                </div>
                <Typography color={data.trend === 'up' ? 'success.main' : 'error.main'} variant='body2'>
                  {data.trend === 'up' ? '+' : '-'}
                  {data.trendNumber}k
                </Typography>
              </div>
            ))}
          </CardContent>
        </Grid>
      </Grid>
    </Card>
  )
}

export default TotalIncome
