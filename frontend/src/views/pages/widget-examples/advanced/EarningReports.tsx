// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'

// Third Party Imports
import type { ApexOptions } from 'apexcharts'
import classnames from 'classnames'

// Types Imports
import type { ThemeColor } from '@core/types'

// Components Imports
import OptionMenu from '@core/components/option-menu'
import CustomAvatar from '@core/components/mui/Avatar'

// Styled Component Imports
import AppReactApexCharts from '@/libs/styles/AppReactApexCharts'

type DataType = {
  avatarIcon: string
  avatarColor: ThemeColor
  title: string
  subtitle: string
  amount: string
  percentage: number
}

// Vars
const series = [{ data: [32, 98, 61, 41, 88, 47, 71] }]

const data: DataType[] = [
  {
    avatarIcon: 'bx-trending-up',
    avatarColor: 'primary',
    title: 'Net Profit',
    subtitle: '12.4k Sales',
    amount: '$1,619',
    percentage: 18.6
  },
  {
    avatarIcon: 'bx-dollar',
    avatarColor: 'success',
    title: 'Total Income',
    subtitle: 'Sales, Affiliation',
    amount: '$3,571',
    percentage: 39.6
  },
  {
    avatarIcon: 'bx-credit-card',
    avatarColor: 'secondary',
    title: 'Total Expenses',
    subtitle: 'ADVT, Marketing',
    amount: '$430',
    percentage: 52.8
  }
]

const EarningReports = () => {
  const options: ApexOptions = {
    chart: {
      parentHeightOffset: 0,
      toolbar: { show: false }
    },
    tooltip: { enabled: false },
    grid: {
      show: false,
      padding: {
        top: -16,
        left: -18,
        right: -17,
        bottom: -11
      }
    },
    plotOptions: {
      bar: {
        borderRadius: 4,
        distributed: true,
        columnWidth: '60%'
      }
    },
    legend: { show: false },
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
      categories: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
      axisTicks: { show: false },
      axisBorder: { show: false },
      tickPlacement: 'on',
      labels: {
        style: {
          fontSize: '13px',
          colors: 'var(--mui-palette-text-disabled)'
        }
      }
    },
    yaxis: { show: false }
  }

  return (
    <Card>
      <CardHeader
        title='Earning Reports'
        subheader='Weekly Earnings Overview'
        action={<OptionMenu options={['Refresh', 'Update', 'Share']} />}
      />
      <CardContent className='flex flex-col gap-4 lg:gap-6'>
        {data.map(item => (
          <div key={item.title} className='flex items-center gap-3'>
            <CustomAvatar skin='light' variant='rounded' color={item.avatarColor} size={34}>
              <i className={classnames(item.avatarIcon, 'text-[22px]')} />
            </CustomAvatar>
            <div className='flex flex-wrap justify-between items-center gap-x-4 gap-y-1 is-full'>
              <div className='flex flex-col items-start'>
                <Typography variant='h6'>{item.title}</Typography>
                <Typography variant='body2' color='text.disabled'>
                  {item.subtitle}
                </Typography>
              </div>
              <div className='flex items-center gap-3'>
                <Typography>{item.amount}</Typography>
                <div className='flex items-center gap-1'>
                  <i
                    className={classnames(
                      {
                        'bx-chevron-up text-success': item.percentage > 0,
                        'bx-chevron-down text-error': item.percentage < 0
                      },
                      'text-xl'
                    )}
                  />
                  <Typography>{`${item.percentage}%`}</Typography>
                </div>
              </div>
            </div>
          </div>
        ))}
        <AppReactApexCharts type='bar' height={158} width='100%' series={series} options={options} />
      </CardContent>
    </Card>
  )
}

export default EarningReports
