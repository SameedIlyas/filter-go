// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Chip from '@mui/material/Chip'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'
import OptionMenu from '@core/components/option-menu'

type SalesDataType = {
  avatarImg: string
  title: string
  subtitle: string
  amount: string
}
type VolumeDataType = {
  avatarImg: string
  title: string
  subtitle: string
  amount: string
  trendNumber: number
}

// Vars
const salesData: SalesDataType[] = [
  {
    avatarImg: '/images/cards/mobile-error-bg.png',
    title: 'Oneplus Nord',
    subtitle: 'Oneplus',
    amount: '$98,348'
  },
  {
    avatarImg: '/images/cards/band-primary-bg.png',
    title: 'Smart Band 4',
    subtitle: 'Xiaomi',
    amount: '$15,459'
  },
  {
    avatarImg: '/images/cards/mobile-alt-2-info-bg.png',
    title: 'Surface Pro X',
    subtitle: 'Microsoft',
    amount: '$4,589'
  },
  {
    avatarImg: '/images/cards/iphone-success-bg.png',
    title: 'iPhone 13',
    subtitle: 'Apple',
    amount: '$84,345'
  },
  {
    avatarImg: '/images/cards/headphone-secondary-bg.png',
    title: 'Bluetooth Earphone',
    subtitle: 'Beats',
    amount: '$10,375'
  }
]

const volumeData: VolumeDataType[] = [
  {
    avatarImg: '/images/cards/laptop-secondary-bg.png',
    title: 'ENVY Laptop',
    subtitle: 'HP',
    amount: '12.4k',
    trendNumber: 12.4
  },
  {
    avatarImg: '/images/cards/mac-warning-bg.png',
    title: 'Apple',
    subtitle: 'iMac Pro',
    amount: '74.9k',
    trendNumber: -8.5
  },
  {
    avatarImg: '/images/cards/watch-error-bg.png',
    title: 'Smart Watch',
    subtitle: 'Fitbit',
    amount: '4.4k',
    trendNumber: 17.6
  },
  {
    avatarImg: '/images/cards/mobile-success-bg.png',
    title: 'Oneplus Nord',
    subtitle: 'Oneplus',
    amount: '12.35k',
    trendNumber: 13.9
  },
  {
    avatarImg: '/images/cards/mobile-alt-primary-bg.png',
    title: 'Pixel 4a',
    subtitle: 'Google',
    amount: '8.65k',
    trendNumber: -11.8
  }
]

const TopProducts = () => {
  return (
    <Card>
      <Grid container>
        <Grid size={{ xs: 12, md: 6 }} className='border-be md:border-be-0 md:border-ie'>
          <CardHeader
            title={
              <>
                Top Products by <span className='text-primary'>Sales</span>
              </>
            }
            action={<OptionMenu options={['Last Week', 'Last Month', 'Last Year']} />}
          />
          <CardContent className='flex flex-col pbs-6 gap-6'>
            {salesData.map(item => (
              <div key={item.title} className='flex items-center gap-3'>
                <CustomAvatar src={item.avatarImg} alt={item.title} variant='rounded' size={40} />
                <div className='flex items-center justify-between flex-wrap gap-x-4 gap-y-1 is-full'>
                  <div className='flex flex-col items-start'>
                    <Typography variant='h6'>{item.title}</Typography>
                    <Typography variant='body2'>{item.subtitle}</Typography>
                  </div>
                  <Typography className='font-medium'>{item.amount}</Typography>
                </div>
              </div>
            ))}
          </CardContent>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <CardHeader
            title={
              <>
                Top Products by <span className='text-primary'>Volume</span>
              </>
            }
            action={<OptionMenu options={['Last Week', 'Last Month', 'Last Year']} />}
          />
          <CardContent className='flex flex-col pbs-6 gap-6'>
            {volumeData.map((item, index) => (
              <div key={index} className='flex items-center gap-3'>
                <CustomAvatar src={item.avatarImg} alt={item.title} variant='rounded' size={40} />
                <div className='flex items-center justify-between flex-wrap gap-x-4 gap-y-1 is-full'>
                  <div className='flex flex-col items-start'>
                    <Typography variant='h6'>{item.title}</Typography>
                    <Typography variant='body2'>{item.subtitle}</Typography>
                  </div>
                  <div className='flex gap-2'>
                    <Typography className='font-medium'>{item.amount}</Typography>
                    <Chip
                      label={`${item.trendNumber > 0 ? '+' : ''}${item.trendNumber}%`}
                      color={item.trendNumber > 0 ? 'success' : 'error'}
                      variant='tonal'
                      size='small'
                    />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Grid>
      </Grid>
    </Card>
  )
}

export default TopProducts
