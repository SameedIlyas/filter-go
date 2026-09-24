// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'

const Award = () => {
  return (
    <Card>
      <CardContent className='flex flex-col gap-3 relative items-start'>
        <div className='flex flex-col items-start'>
          <Typography variant='h5'>Congratulations Katie! 🎉</Typography>
          <Typography variant='subtitle1'>Best seller of the month</Typography>
        </div>
        <div className='flex flex-col items-start'>
          <Typography variant='h5' color='primary.main'>
            $42.8k
          </Typography>
          <Typography>78% of target 🚀</Typography>
        </div>
        <Button size='small' variant='contained'>
          View Sales
        </Button>
        <img src='/images/cards/trophy.png' alt='trophy' className='absolute inline-end-7 block-end-0' />
      </CardContent>
    </Card>
  )
}

export default Award
