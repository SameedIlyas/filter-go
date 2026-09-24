// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Avatar from '@mui/material/Avatar'
import Button from '@mui/material/Button'

// Components Imports
import OptionMenu from '@core/components/option-menu'
import Link from '@components/Link'
import CustomAvatar from '@core/components/mui/Avatar'
import CustomTextField from '@core/components/mui/TextField'

type DataType = {
  imgSrc: string
  imgAlt: string
  title: string
  cardNumber: string
}

// Vars
const data: DataType[] = [
  {
    imgSrc: '/images/cards/mastercard-with-bg.png',
    imgAlt: 'master-card',
    title: 'Credit Card',
    cardNumber: '2566 xxxx xxxx 8908'
  },
  {
    imgSrc: '/images/cards/dinners-club-with-bg.png',
    imgAlt: 'credit-card',
    title: 'Credit Card',
    cardNumber: '8990 xxxx xxxx 6852'
  }
]

const UpgradePlan = () => {
  return (
    <Card>
      <CardHeader title='Upgrade Plan' action={<OptionMenu options={['Add Card', 'Edit Card', 'Delete Card']} />} />
      <CardContent className='flex flex-col gap-5'>
        <Typography>Please make the payment to start enjoying all the features of our premium plan.</Typography>
        <div className='flex items-center gap-3 pli-4 plb-3 rounded border border-primary'>
          <CustomAvatar src='/images/cards/briefcase-primary-bg.png' alt='briefcase' variant='rounded' size={40} />
          <div className='flex items-center justify-between is-full flex-wrap gap-x-4 gap-y-1'>
            <div className='flex flex-col items-start'>
              <Typography color='text.primary'>Business</Typography>
              <Typography variant='body2' component={Link} color='primary.main'>
                Upgrade Plan
              </Typography>
            </div>
            <div className='flex justify-center'>
              <Typography variant='body2' component='sup' color='text.primary' className='self-start mbs-0.5'>
                $
              </Typography>
              <Typography variant='h5' component='span'>
                2,199
              </Typography>
              <Typography variant='body2' component='sub' color='text.primary' className='self-end mbe-0.5'>
                /Year
              </Typography>
            </div>
          </div>
        </div>
        <div className='flex flex-col gap-3.5'>
          <Typography variant='h6'>Payment details</Typography>
          {data.map(item => (
            <div key={item.cardNumber} className='flex items-center gap-3'>
              <Avatar
                src={item.imgSrc}
                alt={item.imgAlt}
                variant='rounded'
                className='bg-actionHover is-[45px] bs-[32px]'
              />

              <div className='flex items-center justify-between is-full flex-wrap gap-x-4 gap-y-1'>
                <div className='flex flex-col items-start'>
                  <Typography variant='h6'>{item.title}</Typography>
                  <Typography variant='body2' color='text.disabled' className='font-medium'>
                    {item.cardNumber}
                  </Typography>
                </div>
                <CustomTextField placeholder='CVV' className='is-20' />
              </div>
            </div>
          ))}
          <Typography component={Link} color='primary.main' className='font-medium self-start'>
            Add Payment Method
          </Typography>
        </div>
        <CustomTextField fullWidth placeholder='Email Address' />
        <Button variant='contained' color='primary' fullWidth>
          Contact Now
        </Button>
      </CardContent>
    </Card>
  )
}

export default UpgradePlan
