'use client'

// React Imports
import { useState } from 'react'

// Next Imports
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

// MUI Imports
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import { styled, useTheme } from '@mui/material/styles'

// Third-party Imports
import { Controller, useForm } from 'react-hook-form'
import { valibotResolver } from '@hookform/resolvers/valibot'
import { forward, minLength, object, partialCheck, pipe, string } from 'valibot'
import type { SubmitHandler } from 'react-hook-form'
import type { InferInput } from 'valibot'
import classnames from 'classnames'

// Component Imports
import Logo from '@components/layout/shared/Logo'
import CustomTextField from '@core/components/mui/TextField'

// Config Imports
import themeConfig from '@configs/themeConfig'

// Styled Custom Components
const InviteIllustration = styled('img')(({ theme }) => ({
  zIndex: 2,
  blockSize: 'auto',
  maxBlockSize: 650,
  maxInlineSize: '100%',
  margin: theme.spacing(12),
  [theme.breakpoints.down(1536)]: {
    maxBlockSize: 550
  },
  [theme.breakpoints.down('lg')]: {
    maxBlockSize: 450
  }
}))

const schema = pipe(
  object({
    password: pipe(string(), minLength(1, 'This field is required')),
    confirmPassword: pipe(string(), minLength(1, 'This field is required'))
  }),
  forward(
    partialCheck(
      [['password'], ['confirmPassword']],
      input => input.password === input.confirmPassword,
      'Passwords do not match'
    ),
    ['confirmPassword']
  )
)

type FormData = InferInput<typeof schema>

const issueMessage = (payload: { error?: { code?: string; message?: string; details?: { issues?: { message: string }[] } } } | null) =>
  payload?.error?.details?.issues?.[0]?.message ?? payload?.error?.message ?? 'Something went wrong. Please try again.'

const AcceptInvite = () => {
  // States
  const [isPasswordShown, setIsPasswordShown] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Hooks
  const router = useRouter()
  const theme = useTheme()
  const token = useSearchParams().get('token')

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<FormData>({
    resolver: valibotResolver(schema),
    defaultValues: { password: '', confirmPassword: '' }
  })

  const onSubmit: SubmitHandler<FormData> = async data => {
    setErrorMessage(null)

    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/accept-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: data.password })
    })

    if (res.ok) {
      // The invite signs the new user in, so go straight to the portal
      router.replace(themeConfig.homePageUrl)
      router.refresh()

      return
    }

    const payload = await res.json().catch(() => null)

    setErrorMessage(issueMessage(payload))
  }

  const toggleShown = () => setIsPasswordShown(show => !show)

  const passwordAdornment = {
    input: {
      endAdornment: (
        <InputAdornment position='end'>
          <IconButton edge='end' onClick={toggleShown} onMouseDown={e => e.preventDefault()}>
            <i className={isPasswordShown ? 'bx-show' : 'bx-hide'} />
          </IconButton>
        </InputAdornment>
      )
    }
  }

  return (
    <div className='flex bs-full justify-center'>
      <div className='flex bs-full items-center justify-center flex-1 min-bs-[100dvh] relative p-6 max-md:hidden'>
        <InviteIllustration
          src='/images/illustrations/characters-with-objects/10.png'
          alt='character-illustration'
          className={classnames({ 'scale-x-[-1]': theme.direction === 'rtl' })}
        />
      </div>
      <div className='flex justify-center items-center bs-full bg-backgroundPaper !min-is-full p-6 md:!min-is-[unset] md:p-12 md:is-[480px]'>
        <div className='absolute block-start-5 sm:block-start-[33px] inline-start-6 sm:inline-start-[38px]'>
          <Logo />
        </div>
        <div className='flex flex-col gap-6 is-full sm:is-auto md:is-full sm:max-is-[400px] md:max-is-[unset] mbs-11 sm:mbs-14 md:mbs-0'>
          <div className='flex flex-col gap-1'>
            <Typography variant='h4'>{`Join ${themeConfig.templateName} 🎉`}</Typography>
            <Typography>Choose a password to activate your account</Typography>
          </div>
          {!token ? (
            <>
              <Alert severity='error'>This invitation link is missing its token. Ask your administrator to send a new one.</Alert>
              <Typography className='flex justify-center' color='primary.main' component={Link} href='/login'>
                Back to Login
              </Typography>
            </>
          ) : (
            <form noValidate autoComplete='off' onSubmit={handleSubmit(onSubmit)} className='flex flex-col gap-6'>
              {errorMessage && <Alert severity='error'>{errorMessage}</Alert>}
              <Controller
                name='password'
                control={control}
                render={({ field }) => (
                  <CustomTextField
                    {...field}
                    autoFocus
                    fullWidth
                    label='Password'
                    placeholder='············'
                    type={isPasswordShown ? 'text' : 'password'}
                    slotProps={passwordAdornment}
                    onChange={e => {
                      field.onChange(e.target.value)
                      setErrorMessage(null)
                    }}
                    {...(errors.password && { error: true, helperText: errors.password.message })}
                  />
                )}
              />
              <Controller
                name='confirmPassword'
                control={control}
                render={({ field }) => (
                  <CustomTextField
                    {...field}
                    fullWidth
                    label='Confirm password'
                    placeholder='············'
                    type={isPasswordShown ? 'text' : 'password'}
                    {...(errors.confirmPassword && { error: true, helperText: errors.confirmPassword.message })}
                  />
                )}
              />
              <Button fullWidth variant='contained' type='submit' disabled={isSubmitting}>
                {isSubmitting ? 'Activating…' : 'Activate account'}
              </Button>
              <Typography className='flex justify-center' color='primary.main' component={Link} href='/login'>
                Back to Login
              </Typography>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default AcceptInvite
