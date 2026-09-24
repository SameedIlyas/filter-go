'use client'

// MUI Imports
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

const ComingSoon = () => {
  return (
    <div className='flex items-center flex-col text-center justify-center min-bs-[100dvh] p-6'>
      <div className='is-[90vw] sm:is-[unset]'>
        <div className='flex flex-col gap-2 is-[90vw] sm:is-[unset] mbe-6'>
          <Typography variant='h3'>We are launching soon 🚀</Typography>
          <Typography>Our website is opening soon. Please register to get notified when it&#39;s ready!</Typography>
        </div>
        <form noValidate autoComplete='off' onSubmit={e => e.preventDefault()}>
          <div className='flex justify-center gap-4'>
            <CustomTextField autoFocus type='email' placeholder='Enter your email or username' className='is-[70%]' />
            <Button type='submit' variant='contained'>
              Notify
            </Button>
          </div>
        </form>
      </div>
      <img
        alt='coming-soon-illustration'
        src='/images/illustrations/characters-with-objects/7.png'
        className='object-cover bs-[327px] sm:bs-[400px] md:bs-[450px] lg:bs-[500px] mbs-10 md:mbs-14'
      />
    </div>
  )
}

export default ComingSoon
