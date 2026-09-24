// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Avatar from '@mui/material/Avatar'
import Typography from '@mui/material/Typography'

// Third-party Imports
import classnames from 'classnames'

// Components Imports
import OptionMenu from '@core/components/option-menu'

type DataType = {
  imgSrc: string
  title: string
  trendNumber: number
  subtitle: string
  stat: string
}

// Vars
const data: DataType[] = [
  {
    imgSrc: '/images/cards/us.png',
    title: '$8,656k',
    trendNumber: 22.5,
    subtitle: 'United States of America',
    stat: '894k'
  },
  {
    imgSrc: '/images/cards/brazil.png',
    title: '$2,415k',
    trendNumber: -6.2,
    subtitle: 'Brazil',
    stat: '645k'
  },
  {
    imgSrc: '/images/cards/india.png',
    title: '$865k',
    trendNumber: 25.8,
    subtitle: 'India',
    stat: '148k'
  },
  {
    imgSrc: '/images/cards/australia.png',
    title: '$745k',
    trendNumber: -11.9,
    subtitle: 'Australia',
    stat: '86k'
  },
  {
    imgSrc: '/images/cards/france.png',
    title: '$45k',
    trendNumber: 16.2,
    subtitle: 'France',
    stat: '42k'
  },
  {
    imgSrc: '/images/cards/china.png',
    title: '$12k',
    trendNumber: 14.8,
    subtitle: 'China',
    stat: '8k'
  }
]

const SalesByCountries = () => {
  return (
    <Card>
      <CardHeader
        title='Sales by Countries'
        subheader='Monthly Sales Overview'
        action={<OptionMenu options={['Last Week', 'Last Month', 'Last Year']} />}
      />
      <CardContent className='flex flex-col gap-5'>
        {data.map(item => (
          <div key={item.title} className='flex items-center gap-3'>
            <Avatar src={item.imgSrc} alt={item.subtitle} />
            <div className='flex flex-wrap justify-between items-center gap-x-4 gap-y-1 is-full'>
              <div className='flex flex-col items-start'>
                <div className='flex items-center flex-wrap gap-x-2 gap-y-1'>
                  <Typography variant='h6'>{item.title}</Typography>
                  <div
                    className={classnames('flex items-center', {
                      'text-success': item.trendNumber > 0,
                      'text-error': item.trendNumber < 0
                    })}
                  >
                    <i
                      className={classnames(
                        {
                          'bx-chevron-up': item.trendNumber > 0,
                          'bx-chevron-down': item.trendNumber < 0
                        },
                        'text-[22px]'
                      )}
                    />
                    <Typography variant='body2' color='inherit' className='font-medium'>
                      {`${item.trendNumber > 0 ? '+' : ''}${item.trendNumber}%`}
                    </Typography>
                  </div>
                </div>
                <Typography variant='body2'>{item.subtitle}</Typography>
              </div>
              <Typography color='text.primary'>{item.stat}</Typography>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default SalesByCountries
