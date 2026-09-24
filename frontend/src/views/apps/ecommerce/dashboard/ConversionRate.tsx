// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'

// Third Party Imports
import classnames from 'classnames'
import type { ApexOptions } from 'apexcharts'

// Components Imports
import OptionMenu from '@core/components/option-menu'

// Styled Component Imports
import AppReactApexCharts from '@/libs/styles/AppReactApexCharts'

type DataType = {
  title: string
  subtitle: string
  percentage: number
}

// Vars
const series = [
  {
    data: [30, 58, 45, 68]
  }
]

const data: DataType[] = [
  {
    title: 'Impressions',
    subtitle: '12.4k Visits',
    percentage: 12.8
  },
  {
    title: 'Added to Cart',
    subtitle: '32 Products in Cart',
    percentage: -8.3
  },
  {
    title: 'Checkout',
    subtitle: '21 Products checkout',
    percentage: 9.12
  },
  {
    title: 'Purchased',
    subtitle: '12 Orders',
    percentage: 2.24
  }
]

const ConversionRate = () => {
  const options: ApexOptions = {
    chart: {
      parentHeightOffset: 0,
      toolbar: { show: false },
      dropShadow: {
        top: 6,
        blur: 3,
        left: 3,
        enabled: true,
        opacity: 0.14,
        color: 'var(--mui-palette-primary-main)'
      }
    },
    grid: {
      show: false,
      padding: {
        top: -20,
        bottom: -5,
        left: -5
      }
    },
    tooltip: { enabled: false },
    colors: ['var(--mui-palette-primary-main)'],
    markers: {
      size: 6,
      offsetX: -2,
      offsetY: -1,
      strokeWidth: 5,
      strokeOpacity: 1,
      colors: ['transparent'],
      strokeColors: 'transparent',
      discrete: [
        {
          size: 7,
          seriesIndex: 0,
          strokeColor: 'var(--mui-palette-primary-main)',
          fillColor: 'var(--mui-palette-background-paper)',
          dataPointIndex: series[0].data.length - 1
        }
      ]
    },
    stroke: {
      width: 5,
      curve: 'smooth',
      lineCap: 'round'
    },
    xaxis: {
      labels: { show: false },
      axisTicks: { show: false },
      axisBorder: { show: false }
    },
    yaxis: {
      labels: { show: false }
    }
  }

  return (
    <Card>
      <CardHeader
        title='Conversion Rate'
        subheader='Compared To Last Month'
        action={<OptionMenu options={['Last Week', 'Last Month', 'Last Year']} />}
      />
      <CardContent className='flex flex-col gap-6 md:max-lg:gap-8 md:max-lg:pbs-3'>
        <div className='flex items-center justify-between flex-wrap gap-x-4 gap-y-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <Typography variant='h3'>8.72%</Typography>
            <div className='flex items-center'>
              <i className='bx-chevron-up text-success' />
              <Typography variant='body2' color='success.main'>
                4.8%
              </Typography>
            </div>
          </div>
          <AppReactApexCharts type='line' height={60} width={100} options={options} series={series} />
        </div>
        <div className='flex flex-col gap-5 md:max-lg:gap-7'>
          {data.map(item => (
            <div key={item.title} className='flex items-center justify-between flex-wrap gap-x-6 gap-y-1'>
              <div className='flex flex-col items-start'>
                <Typography color='text.primary'>{item.title}</Typography>
                <Typography variant='body2'>{item.subtitle}</Typography>
              </div>
              <div className='flex items-start gap-2'>
                <i
                  className={classnames({
                    'bx-up-arrow-alt text-success': item.percentage > 0,
                    'bx-down-arrow-alt text-error': item.percentage < 0
                  })}
                />
                <Typography>{`${item.percentage}%`}</Typography>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default ConversionRate
