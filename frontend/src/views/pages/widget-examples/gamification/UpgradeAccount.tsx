// MUI Imports
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'

const UpgradeAccount = () => {
  return (
    <Card className='relative'>
      <Grid container spacing={6}>
        <Grid size={{ xs: 4 }}>
          <img
            src='/images/illustrations/characters-with-objects/4.png'
            alt='upgrade-account-launch'
            className='absolute block-end-0 inline-start-6'
          />
        </Grid>
        <Grid size={{ xs: 8 }}>
          <CardContent className='flex flex-col gap-3 items-center text-center'>
            <div className='flex flex-col items-center'>
              <Typography variant='h5'>Upgrade Account</Typography>
              <Typography variant='subtitle1'>Add 15 team members</Typography>
            </div>
            <div className='flex flex-col items-center'>
              <Typography variant='h5' color='info.main'>
                $129
              </Typography>
              <Typography>20% OFF</Typography>
            </div>
            <Button size='small' variant='contained' color='info'>
              Upgrade
            </Button>
          </CardContent>
        </Grid>
      </Grid>
    </Card>
  )
}

export default UpgradeAccount
