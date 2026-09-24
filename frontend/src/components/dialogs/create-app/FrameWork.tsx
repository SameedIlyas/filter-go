// React Imports
import { useState } from 'react'
import type { ChangeEvent } from 'react'

// MUI Imports
import Typography from '@mui/material/Typography'
import Radio from '@mui/material/Radio'
import Button from '@mui/material/Button'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'
import DirectionalIcon from '@components/DirectionalIcon'

type Props = {
  activeStep: number
  isLastStep: boolean
  handleNext: () => void
  handlePrev: () => void
}

const FrameWork = ({ activeStep, isLastStep, handleNext, handlePrev }: Props) => {
  // States
  const [value, setValue] = useState<string>('react')

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value)
  }

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-4'>
        <Typography variant='h5'>Select Framework</Typography>
        <div onClick={() => setValue('react')} className='flex items-center justify-between cursor-pointer gap-4'>
          <div className='flex items-center gap-3'>
            <CustomAvatar skin='light' color='info' variant='rounded' size={46}>
              <i className='bx-bxl-react text-3xl' />
            </CustomAvatar>
            <div className='flex flex-col gap-1'>
              <Typography variant='h6'>React Native</Typography>
              <Typography variant='body2'>Create truly native apps</Typography>
            </div>
          </div>
          <Radio value='react' onChange={handleChange} checked={value === 'react'} />
        </div>

        <div onClick={() => setValue('angular')} className='flex items-center justify-between cursor-pointer gap-4'>
          <div className='flex items-center gap-3'>
            <CustomAvatar skin='light' color='error' variant='rounded' size={46}>
              <i className='bx-bxl-angular text-3xl' />
            </CustomAvatar>
            <div className='flex flex-col gap-1'>
              <Typography variant='h6'>Angular</Typography>
              <Typography variant='body2'>Most suited for your application</Typography>
            </div>
          </div>
          <Radio value='angular' onChange={handleChange} checked={value === 'angular'} />
        </div>
        <div onClick={() => setValue('vuejs')} className='flex items-center justify-between cursor-pointer gap-4'>
          <div className='flex items-center gap-3'>
            <CustomAvatar skin='light' color='success' variant='rounded' size={46}>
              <i className='bx-bxl-vuejs text-3xl' />
            </CustomAvatar>
            <div className='flex flex-col gap-1'>
              <Typography variant='h6'>Vue</Typography>
              <Typography variant='body2'>JS web frameworks</Typography>
            </div>
          </div>
          <Radio value='vuejs' onChange={handleChange} checked={value === 'vuejs'} />
        </div>
        <div onClick={() => setValue('html')} className='flex items-center justify-between cursor-pointer gap-4'>
          <div className='flex items-center gap-3'>
            <CustomAvatar skin='light' color='warning' variant='rounded' size={46}>
              <i className='bx-bxl-html5 text-3xl' />
            </CustomAvatar>
            <div className='flex flex-col gap-1'>
              <Typography variant='h6'>HTML</Typography>
              <Typography variant='body2'>Progressive Framework</Typography>
            </div>
          </div>
          <Radio value='html' onChange={handleChange} checked={value === 'html'} />
        </div>
      </div>
      <div className='flex items-center justify-between'>
        <Button
          variant='tonal'
          color='secondary'
          disabled={activeStep === 0}
          onClick={handlePrev}
          startIcon={<DirectionalIcon ltrIconClass='bx-left-arrow-alt' rtlIconClass='bx-right-arrow-alt' />}
        >
          Previous
        </Button>
        <Button
          variant='contained'
          color={isLastStep ? 'success' : 'primary'}
          onClick={handleNext}
          endIcon={
            isLastStep ? (
              <i className='bx-check' />
            ) : (
              <DirectionalIcon ltrIconClass='bx-right-arrow-alt' rtlIconClass='bx-left-arrow-alt' />
            )
          }
        >
          {isLastStep ? 'Submit' : 'Next'}
        </Button>
      </div>
    </div>
  )
}

export default FrameWork
