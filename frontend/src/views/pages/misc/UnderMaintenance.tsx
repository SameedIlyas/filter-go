'use client'

// Next Imports
import Link from 'next/link'

// MUI Imports
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

const UnderMaintenance = () => {
  // Hooks

  return (
    <div className='flex items-center flex-col text-center justify-center min-bs-[100dvh] p-6'>
      <div className='flex flex-col gap-2 is-[90vw] sm:is-[unset] mbe-6'>
        <Typography variant='h3'>Under Maintenance! 🚧</Typography>
        <Typography>Sorry for the inconvenience but we&#39;re performing some maintenance at the moment</Typography>
      </div>
      <Button href={'/'} component={Link} variant='contained'>
        Back To Home
      </Button>
      <img
        alt='under-maintenance-illustration'
        src='/images/illustrations/characters/2.png'
        className='object-cover max-is-full bs-auto max-bs-[400px] md:bs-[450px] lg:max-bs-[500px] mbs-10 md:mbs-14'
      />
    </div>
  )
}

export default UnderMaintenance
