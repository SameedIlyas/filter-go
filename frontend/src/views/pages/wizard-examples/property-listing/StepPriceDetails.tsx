// MUI Imports
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormLabel from '@mui/material/FormLabel'
import Grid from '@mui/material/Grid'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'

// Component Imports
import DirectionalIcon from '@components/DirectionalIcon'
import CustomTextField from '@core/components/mui/TextField'

type Props = {
  activeStep: number
  handleNext: () => void
  handlePrev: () => void
  steps: { title: string; subtitle: string }[]
}

const StepPriceDetails = ({ activeStep, handleNext, handlePrev, steps }: Props) => {
  return (
    <Grid container spacing={6}>
      <Grid size={{ xs: 12, md: 6 }}>
        <CustomTextField
          fullWidth
          type='number'
          placeholder='25,000'
          label='Expected Price'
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position='end'>
                  <i className='bx-dollar' />
                </InputAdornment>
              )
            }
          }}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <CustomTextField
          fullWidth
          type='number'
          placeholder='500'
          label='Price Per SQFT'
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position='end'>
                  <i className='bx-dollar' />
                </InputAdornment>
              )
            }
          }}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <CustomTextField
          fullWidth
          type='number'
          placeholder='50'
          label='Maintenance Charge'
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position='end'>
                  <i className='bx-dollar' />
                </InputAdornment>
              )
            }
          }}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <CustomTextField select fullWidth label='Maintenance Period' defaultValue=''>
          <MenuItem value=''>Select Maintenance Period</MenuItem>
          <MenuItem value='monthly'>Monthly</MenuItem>
          <MenuItem value='quarterly'>Quarterly</MenuItem>
          <MenuItem value='half-yearly'>Half Yearly</MenuItem>
          <MenuItem value='yearly'>Yearly</MenuItem>
          <MenuItem value='one-time'>One-time</MenuItem>
        </CustomTextField>
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <CustomTextField
          fullWidth
          type='number'
          placeholder='250'
          label='Booking/Token Amount'
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position='end'>
                  <i className='bx-dollar' />
                </InputAdornment>
              )
            }
          }}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <CustomTextField
          fullWidth
          type='number'
          placeholder='500'
          label='Other Amount'
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position='end'>
                  <i className='bx-dollar' />
                </InputAdornment>
              )
            }
          }}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <FormControl>
          <FormLabel id='price-radio'>Show Price As</FormLabel>
          <RadioGroup name='price-group' defaultValue='negotiable' aria-labelledby='price-radio'>
            <FormControlLabel value='negotiable' control={<Radio />} label='Negotiable' />
            <FormControlLabel value='call-for-price' control={<Radio />} label='Call For Price' />
          </RadioGroup>
        </FormControl>
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <FormControl>
          <FormLabel>Price Includes</FormLabel>
          <FormControlLabel control={<Checkbox defaultChecked />} label='Car Parking' />
          <FormControlLabel control={<Checkbox />} label='Club Membership' />
        </FormControl>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <FormControlLabel control={<Checkbox />} label='Stamp Duty & Registration charges excluded.' />
      </Grid>
      <Grid size={{ xs: 12 }}>
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
            color={activeStep === steps.length - 1 ? 'success' : 'primary'}
            onClick={handleNext}
            endIcon={
              activeStep === steps.length - 1 ? (
                <i className='bx-check' />
              ) : (
                <DirectionalIcon ltrIconClass='bx-right-arrow-alt' rtlIconClass='bx-left-arrow-alt' />
              )
            }
          >
            {activeStep === steps.length - 1 ? 'Submit' : 'Next'}
          </Button>
        </div>
      </Grid>
    </Grid>
  )
}

export default StepPriceDetails
