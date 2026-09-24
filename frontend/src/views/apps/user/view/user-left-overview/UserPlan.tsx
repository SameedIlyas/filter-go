// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'
import Button from '@mui/material/Button'
import type { ButtonProps } from '@mui/material/Button'

// Component Imports
import UpgradePlan from '@components/dialogs/upgrade-plan'
import OpenDialogOnElementClick from '@components/dialogs/OpenDialogOnElementClick'

const UserPlan = () => {
  // Vars
  const buttonProps: ButtonProps = {
    variant: 'contained',
    children: 'Upgrade Plan'
  }

  return (
    <>
      <Card className='border-2 border-primary shadow-primarySm'>
        <CardContent className='flex flex-col gap-6'>
          <div className='flex justify-between'>
            <Chip label='standard' size='small' color='primary' variant='tonal' />
            <div className='flex justify-center'>
              <Typography component='sup' variant='h5' className='self-start mbs-2' color='primary.main'>
                $
              </Typography>
              <Typography component='span' variant='h1' color='primary.main'>
                99
              </Typography>
              <Typography component='sub' className='self-end mbe-2' color='text.primary'>
                /month
              </Typography>
            </div>
          </div>
          <div className='flex flex-col gap-2'>
            <div className='flex items-center gap-2'>
              <i className='bx-bxs-circle text-[6px] text-textSecondary' />
              <Typography component='span'>10 Users</Typography>
            </div>
            <div className='flex items-center gap-2'>
              <i className='bx-bxs-circle text-[6px] text-textSecondary' />
              <Typography component='span'>Up to 10 GB storage</Typography>
            </div>
            <div className='flex items-center gap-2'>
              <i className='bx-bxs-circle text-[6px] text-textSecondary' />
              <Typography component='span'>Basic Support</Typography>
            </div>
          </div>
          <div className='flex flex-col gap-1'>
            <div className='flex items-center justify-between'>
              <Typography variant='h6'>Days</Typography>
              <Typography variant='h6'>26 of 30 Days</Typography>
            </div>
            <LinearProgress variant='determinate' value={65} />
            <Typography variant='body2'>4 days remaining</Typography>
          </div>
          <OpenDialogOnElementClick element={Button} elementProps={buttonProps} dialog={UpgradePlan} />
        </CardContent>
      </Card>
    </>
  )
}

export default UserPlan
