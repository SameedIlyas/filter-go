// MUI Imports
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'

// Third-party Imports
import classnames from 'classnames'

// Component Imports
import Link from '@components/Link'
import Logo from '@components/layout/shared/Logo'
import CustomTextField from '@core/components/mui/TextField'

// Util Imports
import { frontLayoutClasses } from '@layouts/utils/layoutClasses'

// Styles Imports
import styles from './styles.module.css'
import frontCommonStyles from '@views/front-pages/styles.module.css'

const Footer = () => {
  return (
    <footer className={frontLayoutClasses.footer}>
      <div className='relative'>
        <img
          src='/images/front-pages/footer-bg.png'
          alt='footer bg'
          className='absolute inset-0 is-full bs-full object-cover -z-[1]'
        />
        <div className={classnames('plb-[58px] text-white', frontCommonStyles.layoutSpacing)}>
          <Grid container rowSpacing={10} columnSpacing={12}>
            <Grid size={{ xs: 12, lg: 5 }}>
              <div className='flex flex-col items-start gap-6'>
                <Link href='/front-pages/landing-page'>
                  <Logo color='var(--mui-palette-common-white)' />
                </Link>
                <Typography color='white' className='md:max-is-[390px] opacity-[0.78]'>
                  Most developer friendly & highly customisable Admin Dashboard Template.
                </Typography>
                <div className='flex items-end'>
                  <CustomTextField
                    size='small'
                    className={styles.inputBorder}
                    label='Subscribe to newsletter'
                    placeholder='Your email'
                    sx={{
                      '& .MuiInputBase-root': {
                        borderStartEndRadius: '0 !important',
                        borderEndEndRadius: '0 !important',
                        '&:not(.Mui-focused)': {
                          borderColor: 'rgb(var(--mui-mainColorChannels-dark) / 0.22)'
                        },
                        '&.MuiFilledInput-root:not(.Mui-focused):not(.Mui-disabled):hover': {
                          borderColor: 'rgba(255 255 255 / 0.6) !important'
                        }
                      }
                    }}
                  />
                  <Button
                    variant='contained'
                    color='primary'
                    sx={{
                      borderStartStartRadius: 0,
                      borderEndStartRadius: 0
                    }}
                  >
                    Subscribe
                  </Button>
                </div>
              </div>
            </Grid>
            <Grid size={{ xs: 12, sm: 3, lg: 2 }}>
              <Typography color='white' className='font-medium mbe-6 opacity-[0.92]'>
                Pages
              </Typography>
              <div className='flex flex-col gap-4'>
                <Typography component={Link} href='/front-pages/pricing' color='white' className='opacity-[0.78]'>
                  Pricing
                </Typography>
                <Link href='/front-pages/payment' className='flex items-center gap-[10px]'>
                  <Typography color='white' className='opacity-[0.78]'>
                    Payment
                  </Typography>
                  <Chip label='New' color='primary' size='small' />
                </Link>
                <Typography
                  component={Link}
                  href='/pages/misc/under-maintenance'
                  color='white'
                  className='opacity-[0.78]'
                >
                  Maintenance
                </Typography>
                <Typography component={Link} href='/pages/misc/coming-soon' color='white' className='opacity-[0.78]'>
                  Coming Soon
                </Typography>
              </div>
            </Grid>
            <Grid size={{ xs: 12, sm: 3, lg: 2 }}>
              <Typography color='white' className='font-medium mbe-6 opacity-[0.92]'>
                Products
              </Typography>
              <div className='flex flex-col gap-4'>
                <Typography component={Link} href='/' color='white' className='opacity-[0.78]'>
                  Page builder
                </Typography>
                <Typography
                  component={Link}
                  href='https://themeselection.com/item/category/admin-templates'
                  color='white'
                  className='opacity-[0.78]'
                >
                  Admin Dashboards
                </Typography>
                <Typography
                  component={Link}
                  href='https://themeselection.com/item/category/ui-kits'
                  color='white'
                  className='opacity-[0.78]'
                >
                  UI Kits
                </Typography>
                <Typography component={Link} href='/' color='white' className='opacity-[0.78]'>
                  Illustrations
                </Typography>
              </div>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <Typography color='white' className='font-medium mbe-6 opacity-[0.92]'>
                Download our App
              </Typography>
              <div className='flex flex-col gap-4'>
                <Link className='bg-[#282C3E] bs-[56px] is-[220px] rounded'>
                  <div className='flex items-center pli-5 plb-[7px] gap-6'>
                    <img
                      src='/images/front-pages/apple-icon.png'
                      alt='apple store'
                      className='is-[34px] bs-[34px] object-contain'
                    />
                    <div className='flex flex-col items-start'>
                      <Typography variant='body2' color='white' className='opacity-75'>
                        Download on the
                      </Typography>
                      <Typography color='white' className='font-medium opacity-[0.92]'>
                        App Store
                      </Typography>
                    </div>
                  </div>
                </Link>
                <Link className='bg-[#282C3E] bs-[56px] is-[220px] rounded'>
                  <div className='flex items-center pli-5 plb-[7px] gap-6'>
                    <img
                      src='/images/front-pages/google-play-icon.png'
                      alt='Google play'
                      className='is-[34px] bs-[34px] object-contain'
                    />
                    <div className='flex flex-col items-start'>
                      <Typography variant='body2' color='white' className='opacity-75'>
                        Download on the
                      </Typography>
                      <Typography color='white' className='font-medium opacity-[0.92]'>
                        Google Play
                      </Typography>
                    </div>
                  </div>
                </Link>
              </div>
            </Grid>
          </Grid>
        </div>
      </div>
      <div className='bg-[#282C3E]'>
        <div
          className={classnames(
            'flex flex-wrap items-center justify-center sm:justify-between gap-4 plb-[15px]',
            frontCommonStyles.layoutSpacing
          )}
        >
          <Typography className='text-[#D3D4DC]'>
            <span>{`© ${new Date().getFullYear()} `}</span>
            <Link href='/' target='_blank' className='font-medium text-white'>
              CoolCraft
            </Link>
            <span>{` · Fresh Air Delivered`}</span>
          </Typography>
          <div className='flex gap-1.5 items-center opacity-[0.92]'>
            <IconButton component={Link} size='small' href='https://github.com/themeselection' target='_blank'>
              <i className='bx-bxl-github text-white' />
            </IconButton>
            <IconButton component={Link} size='small' href='https://www.facebook.com/ThemeSelections' target='_blank'>
              <i className='bx-bxl-facebook text-white' />
            </IconButton>
            <IconButton component={Link} size='small' href='https://twitter.com/Theme_Selection' target='_blank'>
              <i className='bx-bxl-twitter text-white' />
            </IconButton>
            <IconButton
              component={Link}
              size='small'
              href='https://in.linkedin.com/company/themeselection'
              target='_blank'
            >
              <i className='bx-bxl-linkedin text-white' />
            </IconButton>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
