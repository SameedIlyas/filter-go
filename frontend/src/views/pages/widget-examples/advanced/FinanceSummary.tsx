// MUI Imports
import AvatarGroup from '@mui/material/AvatarGroup'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Chip from '@mui/material/Chip'
import Grid from '@mui/material/Grid'
import LinearProgress from '@mui/material/LinearProgress'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'

const FinanceSummary = () => {
  return (
    <Card>
      <CardHeader
        title='Finance Summary'
        subheader='Check out each Column for more details'
        action={
          <CustomAvatar skin='light' color='primary' size={44}>
            <i className='bx-dollar' />
          </CustomAvatar>
        }
      ></CardHeader>
      <CardContent>
        <Grid container spacing={6}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <div className='flex flex-col gap-0.5'>
              <Typography variant='body2'>Annual Companies Taxes</Typography>
              <Typography variant='h6'>$50,000</Typography>
            </div>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <div className='flex flex-col gap-0.5'>
              <Typography variant='body2'>Next Tax Review Date</Typography>
              <Typography variant='h6'>July 14, 2024</Typography>
            </div>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <div className='flex flex-col gap-0.5'>
              <Typography variant='body2'>Average Product Price</Typography>
              <Typography variant='h6'>$89.90</Typography>
            </div>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <div className='flex flex-col gap-1'>
              <Typography variant='body2'>Satisfaction Rate</Typography>
              <div className='flex items-center gap-5'>
                <LinearProgress variant='determinate' value={78} className='is-full' />
                <Typography>78%</Typography>
              </div>
            </div>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <AvatarGroup className='pull-up'>
              <Tooltip title='Jeffery Warner'>
                <CustomAvatar src='/images/avatars/1.png' alt='Jeffery Warner' size={34} />
              </Tooltip>
              <Tooltip title='Howard Lloyd'>
                <CustomAvatar src='/images/avatars/5.png' alt='Howard Lloyd' size={34} />
              </Tooltip>
              <Tooltip title='Olivia Sparks'>
                <CustomAvatar src='/images/avatars/4.png' alt='Olivia Sparks' size={34} />
              </Tooltip>
              <Tooltip title='Hallie Richards'>
                <CustomAvatar src='/images/avatars/2.png' alt='Hallie Richards' size={34} />
              </Tooltip>
            </AvatarGroup>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Chip label='5 Days Ago' variant='tonal' size='small' color='primary' className='uppercase' />
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  )
}

export default FinanceSummary
