// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'

const SalesInfoCard = () => {
  return (
    <Card>
      <CardHeader
        title='Sales'
        subheader='482k'
        titleTypographyProps={{
          variant: 'body1'
        }}
        subheaderTypographyProps={{
          sx: {
            fontSize: '1.5rem !important',
            color: 'var(--mui-palette-text-primary) !important',
            fontWeight: '500 !important',
            marginBlockStart: '0.125rem'
          }
        }}
      />
      <CardContent className='flex flex-col gap-y-4'>
        <Chip label='+34%' color='info' size='small' variant='tonal' className='self-start' />
        <div className='flex flex-col gap-y-0.5'>
          <Typography variant='body2'>Sales Target</Typography>
          <div className='flex items-center gap-x-1.5'>
            <LinearProgress color='info' className='is-full bs-2' variant='determinate' value={78} />
            <Typography variant='body2'>78%</Typography>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default SalesInfoCard
