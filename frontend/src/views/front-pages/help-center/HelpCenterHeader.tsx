// MUI Imports
import { styled } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import InputAdornment from '@mui/material/InputAdornment'
import type { TextFieldProps } from '@mui/material/TextField'

// Third-party Imports
import classnames from 'classnames'

// Components Imports
import CustomTextField from '@core/components/mui/TextField'

// Styles imports
import styles from './styles.module.css'

// Styled TextField component
const CustomTextFieldStyled = styled(CustomTextField)<TextFieldProps>(({ theme }) => ({
  '& .MuiInputBase-root.MuiFilledInput-root': {
    width: '100%',
    backgroundColor: 'var(--mui-palette-background-paper) !important'
  },
  [theme.breakpoints.up('sm')]: {
    width: '55%'
  }
}))

type Props = {
  searchValue: string
  setSearchValue: (value: string) => void
}

const HelpCenterHeader = ({ searchValue, setSearchValue }: Props) => {
  return (
    <section
      className={classnames('-mbs-[20%] sm:mbs-[-11%] md:mbs-[-8%] lg:mbs-[-7%] bg-primaryLighter', styles.bgImage)}
    >
      <div
        className={classnames(
          'flex flex-col items-center gap-4 text-center pbs-[150px] lg:pbs-[193px] pbe-[40px] sm:pbe-[100px] pli-5'
        )}
      >
        <Typography variant='h4' color='primary.main'>
          Hello, how can we help?
        </Typography>
        <CustomTextFieldStyled
          className='is-full sm:max-is-[55%] md:max-is-[465px]'
          placeholder='Ask a question...'
          value={searchValue}
          onChange={e => setSearchValue(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position='start'>
                  <i className='bx-search' />
                </InputAdornment>
              )
            }
          }}
        />
        <Typography>Common troubleshooting topics: eCommerce, Blogging to payment</Typography>
      </div>
    </section>
  )
}

export default HelpCenterHeader
