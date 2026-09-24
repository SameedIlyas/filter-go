// MUI Imports
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'

const Congratulations = () => {
  return (
    <Card>
      <CardContent>
        <Grid container spacing={6}>
          <Grid size={{ xs: 12, sm: 6 }} className='max-sm:order-2 max-sm:text-center'>
            <Typography variant='h5' color='primary.main' className='mbe-3'>
              Congratulations John! 🎉
            </Typography>
            <Typography>You have done 72% more sales today.</Typography>
            <Typography className='mbe-6'>Check your new badge in your profile.</Typography>
            <Button variant='tonal' size='small'>
              View Badges
            </Button>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }} className='flex items-end justify-center sm:mbs-[-3px] sm:mbe-[-25px]'>
            <img
              src='/images/illustrations/characters-with-objects/2.png'
              alt='Congratulations John'
              className='bs-[185px]'
            />
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  )
}

export default Congratulations
