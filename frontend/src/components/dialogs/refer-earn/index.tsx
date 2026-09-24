'use client'

// React Imports
import type { ReactNode } from 'react'

// MUI Imports
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import InputAdornment from '@mui/material/InputAdornment'
import Typography from '@mui/material/Typography'

// Third-party Imports
import classnames from 'classnames'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'
import CustomIconButton from '@core/components/mui/IconButton'
import CustomTextField from '@core/components/mui/TextField'
import DialogCloseButton from '../DialogCloseButton'

// Config Imports
import themeConfig from '@configs/themeConfig'

type ReferEarnProps = {
  open: boolean
  setOpen: (open: boolean) => void
}

type Options = {
  icon?: ReactNode
  title?: string
  subtitle?: string
}

const options: Options[] = [
  {
    icon: 'bx-message-square-dots',
    title: 'Send Invitation 👍🏻',
    subtitle: 'Send your referral link to your friend'
  },
  {
    icon: 'bx-detail',
    title: 'Registration 😎',
    subtitle: 'Let them register to our services'
  },
  {
    icon: 'bx-gift',
    title: 'Free Trial  🎉',
    subtitle: 'Your friend will get 30 days free trial'
  }
]

const ReferEarn = ({ open, setOpen }: ReferEarnProps) => {
  return (
    <Dialog
      fullWidth
      open={open}
      onClose={() => setOpen(false)}
      maxWidth='md'
      scroll='body'
      closeAfterTransition={false}
      sx={{ '& .MuiDialog-paper': { overflow: 'visible' } }}
    >
      <DialogCloseButton onClick={() => setOpen(false)} disableRipple>
        <i className='bx-x' />
      </DialogCloseButton>
      <DialogTitle variant='h4' className='flex gap-2 flex-col text-center sm:pbs-16 sm:pbe-12 sm:pli-16'>
        Refer & Earn
        <Typography component='span' className='flex flex-col text-center'>
          {`Invite your friend to ${themeConfig.templateName}, if they sign up, you and your friend will get 30 days free
          trial`}
        </Typography>
      </DialogTitle>
      <DialogContent className='flex flex-col gap-6 pbs-0 sm:pli-16 sm:pbe-16'>
        <Grid container spacing={6}>
          {options?.map((option, index) => (
            <Grid size={{ xs: 12, md: 4 }} key={index}>
              <div className='flex items-center flex-col gap-4'>
                <CustomAvatar
                  variant='rounded'
                  skin='light'
                  color='primary'
                  className='bs-[66px] is-[66px] sm:bs-[88px] sm:is-[88px]'
                >
                  {typeof option.icon === 'string' ? (
                    <i className={classnames('text-[32px] sm:text-[40px]', option.icon)} />
                  ) : (
                    option.icon
                  )}
                </CustomAvatar>
                <div className='flex flex-col gap-2 text-center'>
                  <Typography variant='h5'>{option.title}</Typography>
                  <Typography>{option.subtitle}</Typography>
                </div>
              </div>
            </Grid>
          ))}
        </Grid>
        <Divider className='mbs-6' />
        <div className='flex flex-col gap-6'>
          <Typography variant='h5'>Invite your friends</Typography>
          <div className='flex items-end is-full flex-wrap sm:flex-nowrap gap-4'>
            <CustomTextField
              fullWidth
              size='small'
              id='refer-email'
              placeholder='johnDoe@email.com'
              label=' Enter your friend&#39;s email address and invite them to join Vuexy 😍'
            />
            <Button variant='contained' className='max-sm:is-full'>
              Send
            </Button>
          </div>
        </div>
        <div className='flex flex-col gap-6'>
          <Typography variant='h5'>Share the referral link</Typography>
          <div className='flex items-end justify-center sm:justify-initial flex-wrap sm:flex-nowrap gap-4'>
            <CustomTextField
              fullWidth
              size='small'
              id='refer-social'
              placeholder='http://themeselection.link'
              label='You can also copy and send it or share it on your social media. 🚀'
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position='end'>
                      <Button size='small' className='capitalize !text-primary'>
                        Copy Link
                      </Button>
                    </InputAdornment>
                  )
                }
              }}
            />
            <div className='flex items-center gap-1'>
              <CustomIconButton className='rounded text-white bg-facebook' color='inherit'>
                <i className='bx-bxl-facebook' />
              </CustomIconButton>
              <CustomIconButton className='rounded text-white bg-twitter' color='inherit'>
                <i className='bx-bxl-twitter' />
              </CustomIconButton>
              <CustomIconButton className='rounded text-white bg-linkedin' color='inherit'>
                <i className='bx-bxl-linkedin' />
              </CustomIconButton>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ReferEarn
