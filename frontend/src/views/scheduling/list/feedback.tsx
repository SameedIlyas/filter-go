'use client'

// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'

/** Schedules are planned by admins and supervisors; everyone else gets this instead of a half-working page. */
export const StaffOnly = () => (
  <Card>
    <CardContent className='flex flex-col items-center gap-3 plb-12'>
      <i className='bx-lock-alt text-5xl text-textDisabled' />
      <Typography variant='h5'>Not available</Typography>
      <Typography color='text.secondary'>Schedules are managed by admins and supervisors.</Typography>
    </CardContent>
  </Card>
)
