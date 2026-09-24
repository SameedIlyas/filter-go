// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Avatar from '@mui/material/Avatar'
import Typography from '@mui/material/Typography'

// Component Imports
import OptionMenu from '@core/components/option-menu'

type DataType = {
  imgSrc: string
  subtitle: string
  title: string
  amount: number
}

// Vars
const data: DataType[] = [
  {
    imgSrc: '/images/cards/paypal-error-bg.png',
    subtitle: 'Paypal',
    title: 'Send money',
    amount: 82.6
  },
  {
    imgSrc: '/images/cards/wallet-success-bg.png',
    subtitle: 'Wallet',
    title: "Mac'D",
    amount: 270.69
  },
  {
    imgSrc: '/images/cards/chart-info-bg.png',
    subtitle: 'Transfer',
    title: 'Refund',
    amount: 637.91
  },
  {
    imgSrc: '/images/cards/credit-card-primary-bg.png',
    subtitle: 'Credit Card',
    title: 'Ordered Food',
    amount: -838.71
  },
  {
    imgSrc: '/images/cards/wallet-success-bg.png',
    subtitle: 'Wallet',
    title: 'Starbucks',
    amount: 203.33
  },
  {
    imgSrc: '/images/cards/credit-card-warning-bg.png',
    subtitle: 'Mastercard',
    title: 'Ordered Food',
    amount: -92.45
  }
]

const Transactions = () => {
  return (
    <Card>
      <CardHeader title='Transactions' action={<OptionMenu options={['Last Week', 'Last Month', 'Last 6 Months']} />} />
      <CardContent className='flex flex-col gap-6'>
        {data.map((item, index) => (
          <div key={index} className='flex items-center gap-3'>
            <Avatar src={item.imgSrc} alt={item.subtitle} variant='rounded' />
            <div className='flex flex-wrap justify-between items-center gap-x-4 gap-y-1 is-full'>
              <div className='flex flex-col items-start'>
                <Typography variant='body2'>{item.subtitle}</Typography>
                <Typography color='text.primary'>{item.title}</Typography>
              </div>
              <div className='flex items-center gap-2'>
                <Typography color='text.primary'>{`${item.amount > 0 ? '+' : ''}${item.amount}`}</Typography>
                <Typography color='text.disabled'>USD</Typography>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default Transactions
