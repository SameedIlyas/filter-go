'use client'

// Next Imports
import Link from 'next/link'

// MUI Imports
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

// Data Imports
import { footerNav, siteConfig } from '@/data/public/site'

// Component Imports
import PublicLogo from './Logo'

const linkSx = {
  color: 'rgba(255,255,255,.76)',
  textDecoration: 'none',
  transition: 'color .2s ease',
  '&:hover': { color: 'primary.main' }
} as const

const PublicFooter = () => (
  <Box
    component='footer'
    sx={{
      backgroundColor: 'secondary.dark',
      backgroundImage: 'linear-gradient(180deg, #0B3B5C 0%, #072C46 100%)',
      color: 'rgba(255,255,255,.76)'
    }}
  >
    <Container sx={{ paddingBlock: { xs: 8, md: 11 } }}>
      <Grid container spacing={{ xs: 6, md: 4 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Box sx={{ color: '#FFFFFF' }}>
            <PublicLogo size={32} />
          </Box>
          <Typography
            variant='body2'
            sx={{ color: 'rgba(255,255,255,.72)', marginBlockStart: 2.5, maxInlineSize: 320 }}
          >
            {siteConfig.description}
          </Typography>

          <Stack direction='row' sx={{ gap: 1, marginBlockStart: 3 }}>
            <IconButton
              component='a'
              href={siteConfig.social.instagram}
              target='_blank'
              rel='noopener noreferrer'
              aria-label={`${siteConfig.name} on Instagram`}
              sx={{
                color: 'inherit',
                border: '1px solid rgba(255,255,255,.24)',
                '&:hover': { borderColor: 'primary.main', color: 'primary.main' }
              }}
            >
              <i className='bx-bxl-instagram' />
            </IconButton>
            <IconButton
              component='a'
              href={siteConfig.social.linkedin}
              target='_blank'
              rel='noopener noreferrer'
              aria-label={`${siteConfig.name} on LinkedIn`}
              sx={{
                color: 'inherit',
                border: '1px solid rgba(255,255,255,.24)',
                '&:hover': { borderColor: 'primary.main', color: 'primary.main' }
              }}
            >
              <i className='bx-bxl-linkedin' />
            </IconButton>
          </Stack>
        </Grid>

        <Grid size={{ xs: 6, md: 2 }}>
          <Typography variant='h6' component='h2' sx={{ color: '#FFFFFF', marginBlockEnd: 2 }}>
            Company
          </Typography>
          <Stack sx={{ gap: 1.25 }}>
            {footerNav.company.map(item => (
              <Typography key={item.href} component={Link} href={item.href} variant='body2' sx={linkSx}>
                {item.label}
              </Typography>
            ))}
          </Stack>
        </Grid>

        <Grid size={{ xs: 6, md: 3 }}>
          <Typography variant='h6' component='h2' sx={{ color: '#FFFFFF', marginBlockEnd: 2 }}>
            Legal
          </Typography>
          <Stack sx={{ gap: 1.25 }}>
            {footerNav.legal.map(item => (
              <Typography key={item.label} component={Link} href={item.href} variant='body2' sx={linkSx}>
                {item.label}
              </Typography>
            ))}
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, md: 3 }}>
          <Typography variant='h6' component='h2' sx={{ color: '#FFFFFF', marginBlockEnd: 2 }}>
            {siteConfig.address.label}
          </Typography>
          <Stack sx={{ gap: 1.25 }}>
            <Typography variant='body2' sx={{ color: 'rgba(255,255,255,.72)' }}>
              {siteConfig.address.street}
              <br />
              {siteConfig.address.city}
            </Typography>
            <Typography component='a' href={siteConfig.phoneHref} variant='body2' sx={linkSx}>
              {siteConfig.phone}
            </Typography>
            <Typography component='a' href={siteConfig.emailHref} variant='body2' sx={linkSx}>
              {siteConfig.email}
            </Typography>
          </Stack>
        </Grid>
      </Grid>

      <Divider sx={{ marginBlock: { xs: 5, md: 7 }, borderColor: 'rgba(255,255,255,.16)' }} />

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2 }}
      >
        <Typography variant='body2' sx={{ color: 'rgba(255,255,255,.66)' }}>
          © {new Date().getFullYear()} {siteConfig.legalName}. All rights reserved.
        </Typography>
        <Typography variant='body2' sx={{ color: 'rgba(255,255,255,.66)' }}>
          {siteConfig.tagline}
        </Typography>
      </Stack>
    </Container>
  </Box>
)

export default PublicFooter
