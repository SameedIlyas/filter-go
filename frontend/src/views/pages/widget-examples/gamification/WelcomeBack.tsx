// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'

const WelcomeBack = () => {
  return (
    <Card>
      <CardContent>
        <Grid container spacing={6}>
          <Grid size={{ xs: 12, sm: 6 }} className='flex items-end justify-center sm:mbs-[-3px] sm:mbe-[-24px]'>
            <img src='/images/illustrations/characters-with-objects/3.png' alt='Welcome back Anna' />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }} className='max-sm:text-center'>
            <Typography variant='h5' color='primary.main' className='mbe-3'>
              Welcome back Anna!
            </Typography>
            <Typography>You have 12 tasks to finish today,</Typography>
            <Typography className='mbe-6'>You already completed 189 tasks. Good Job!</Typography>
            <Chip label='78% of target' color='primary' variant='tonal' size='small' className='uppercase' />
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  )
}

export default WelcomeBack
