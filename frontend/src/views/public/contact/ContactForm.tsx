'use client'

// React Imports
import { useMemo } from 'react'

// Next Imports
import Link from 'next/link'

// MUI Imports
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import Grid from '@mui/material/Grid'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { Controller, useForm } from 'react-hook-form'
import { valibotResolver } from '@hookform/resolvers/valibot'
import { email, literal, maxLength, nonEmpty, object, optional, pipe, string } from 'valibot'

import type { SubmitHandler } from 'react-hook-form'
import type { InferInput } from 'valibot'

// Data Imports
import { contact } from '@/data/public/site'

// Lib Imports
import { ApiError, useAppointmentMutation } from '@/libs/api'

// Theme Imports
import { radius } from '@components/layout/public/theme'

const optionalText = (max: number) => optional(pipe(string(), maxLength(max)), '')

const schema = object({
  firstName: pipe(string(), nonEmpty('Please tell us your first name'), maxLength(80)),
  lastName: optionalText(80),
  email: pipe(string(), nonEmpty('Please add an email'), email('That email does not look right')),
  company: optionalText(160),
  region: optionalText(120),
  phone: optionalText(40),

  serviceAddress: optionalText(240),
  preferredDate: optionalText(10),
  preferredTime: pipe(string(), nonEmpty('Please pick a time')),

  businessType: pipe(string(), nonEmpty('Please pick a type of business')),
  notes: optionalText(4000),

  privacy: literal(true, 'Please confirm you have read the privacy policy')
})

type FormValues = InferInput<typeof schema>

/** Numbered heading above each group of fields. */
const SectionLegend = ({ index, title, description }: { index: number; title: string; description: string }) => (
  <Box component='legend' sx={{ display: 'block', inlineSize: '100%', padding: 0, marginBlockEnd: 3 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box
        aria-hidden
        sx={{
          display: 'grid',
          placeItems: 'center',
          inlineSize: 28,
          blockSize: 28,
          flexShrink: 0,
          borderRadius: radius.sm,
          fontSize: '0.8125rem',
          fontWeight: 700,
          color: 'primary.main',
          backgroundColor: theme => `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`
        }}
      >
        {index}
      </Box>
      <Typography variant='h5' component='span'>
        {title}
      </Typography>
    </Box>
    <Typography variant='body2' sx={{ color: 'text.secondary', marginBlockStart: 0.75 }}>
      {description}
    </Typography>
  </Box>
)

/**
 * The appointment request form.
 *
 * Twelve fields is a lot to face at once, so they are split into the three
 * named `fieldset`s the business already uses — that grouping is semantic, not
 * decorative, so screen readers announce which part of the booking a field
 * belongs to.
 *
 * Validation runs on blur so a first pass through the form is never interrupted
 * by errors, then re-validates on change once a field has been corrected.
 */
const ContactForm = () => {
  const { mutate, isPending, isSuccess, error, reset: resetMutation } = useAppointmentMutation()

  // Stops anyone booking an assessment in the past
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<FormValues>({
    resolver: valibotResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      company: '',
      region: '',
      phone: '',
      serviceAddress: '',
      preferredDate: '',
      preferredTime: '',
      businessType: '',
      notes: '',
      privacy: false as unknown as true
    }
  })

  const onSubmit: SubmitHandler<FormValues> = values => mutate(values, { onSuccess: () => reset() })

  const errorMessage =
    error instanceof ApiError && error.status === 422
      ? error.message
      : error
        ? 'We could not send that just now. Please try again, or call us directly.'
        : null

  const fieldsetSx = { border: 0, margin: 0, padding: 0, marginBlockEnd: 6, '&:last-of-type': { marginBlockEnd: 0 } }

  return (
    <Box
      component='form'
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      sx={{
        padding: { xs: 3, md: 5 },
        borderRadius: radius.xl,
        backgroundColor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider'
      }}
    >
      {isSuccess ? (
        <Alert severity='success' onClose={() => resetMutation()} sx={{ marginBlockEnd: 4 }}>
          Thanks — we’ll call to confirm your free assessment shortly.
        </Alert>
      ) : null}

      {errorMessage ? (
        <Alert severity='error' onClose={() => resetMutation()} sx={{ marginBlockEnd: 4 }}>
          {errorMessage}
        </Alert>
      ) : null}

      <Box component='fieldset' sx={fieldsetSx}>
        <SectionLegend index={1} {...contact.form.sections[0]} />

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Controller
              name='firstName'
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  fullWidth
                  required
                  label='First name'
                  autoComplete='given-name'
                  error={Boolean(errors.firstName)}
                  helperText={errors.firstName?.message}
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Controller
              name='lastName'
              control={control}
              render={({ field }) => <TextField {...field} fullWidth label='Last name' autoComplete='family-name' />}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Controller
              name='email'
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  fullWidth
                  required
                  type='email'
                  label='Email'
                  autoComplete='email'
                  error={Boolean(errors.email)}
                  helperText={errors.email?.message}
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Controller
              name='phone'
              control={control}
              render={({ field }) => (
                <TextField {...field} fullWidth type='tel' label='Phone number' autoComplete='tel' />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Controller
              name='company'
              control={control}
              render={({ field }) => (
                <TextField {...field} fullWidth label='Company name' autoComplete='organization' />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Controller
              name='region'
              control={control}
              render={({ field }) => <TextField {...field} fullWidth label='Location / region' />}
            />
          </Grid>
        </Grid>
      </Box>

      <Box component='fieldset' sx={fieldsetSx}>
        <SectionLegend index={2} {...contact.form.sections[1]} />

        <Grid container spacing={3}>
          <Grid size={{ xs: 12 }}>
            <Controller
              name='serviceAddress'
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  fullWidth
                  label='Service address'
                  autoComplete='street-address'
                  placeholder='Where the units are'
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Controller
              name='preferredDate'
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  fullWidth
                  type='date'
                  label='Preferred date'
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today } }}
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Controller
              name='preferredTime'
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  fullWidth
                  required
                  label='Preferred time'
                  error={Boolean(errors.preferredTime)}
                  helperText={errors.preferredTime?.message}
                >
                  {contact.timeSlots.map(slot => (
                    <MenuItem key={slot} value={slot}>
                      {slot}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          </Grid>
        </Grid>
      </Box>

      <Box component='fieldset' sx={fieldsetSx}>
        <SectionLegend index={3} {...contact.form.sections[2]} />

        <Grid container spacing={3}>
          <Grid size={{ xs: 12 }}>
            <Controller
              name='businessType'
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  fullWidth
                  required
                  label='Type of business'
                  error={Boolean(errors.businessType)}
                  helperText={errors.businessType?.message}
                >
                  {contact.businessTypes.map(type => (
                    <MenuItem key={type} value={type}>
                      {type}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Controller
              name='notes'
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  fullWidth
                  multiline
                  rows={4}
                  label='Additional notes'
                  placeholder='How many rooftop units? Any idea when filters were last changed?'
                />
              )}
            />
          </Grid>
        </Grid>
      </Box>

      <Box sx={{ marginBlockStart: 5 }}>
        <Controller
          name='privacy'
          control={control}
          render={({ field }) => (
            <>
              <FormControlLabel
                control={<Checkbox {...field} checked={Boolean(field.value)} />}
                label={
                  <Typography variant='body2'>
                    I have read and understood the{' '}
                    <Box component={Link} href='/privacy-policy' sx={{ color: 'primary.main', fontWeight: 600 }}>
                      Privacy Policy
                    </Box>
                    .
                  </Typography>
                }
              />
              {errors.privacy ? <FormHelperText error>{errors.privacy.message}</FormHelperText> : null}
            </>
          )}
        />

        <Button
          type='submit'
          variant='contained'
          size='large'
          disabled={isPending}
          sx={{ marginBlockStart: 3, minInlineSize: 220 }}
        >
          {isPending ? 'Sending…' : contact.form.submitLabel}
        </Button>
      </Box>
    </Box>
  )
}

export default ContactForm
