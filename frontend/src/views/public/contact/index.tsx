'use client'

// MUI Imports
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

// Theme Imports
import { radius } from '@components/layout/public/theme'

// Data Imports
import { contact, siteConfig } from '@/data/public/site'

// Component Imports
import AirBackdrop from '../shared/AirBackdrop'
import AirGraphic from '../shared/AirGraphic'
import Reveal from '../shared/Reveal'
import ContactForm from './ContactForm'

const channels = [
  { icon: 'bx-phone', label: 'Call us', value: siteConfig.phone, href: siteConfig.phoneHref },
  { icon: 'bx-envelope', label: 'Email us', value: siteConfig.email, href: siteConfig.emailHref }
]

const ContactPage = () => (
  <Box
    component='section'
    sx={{
      position: 'relative',
      overflow: 'hidden',
      paddingBlockStart: { xs: 16, md: 22 },
      paddingBlockEnd: { xs: 10, md: 16 }
    }}
  >
    <AirBackdrop />

    <Container sx={{ position: 'relative', zIndex: 1 }}>
      <Box sx={{ maxInlineSize: 680, marginBlockEnd: { xs: 6, md: 8 } }}>
        <Reveal distance={16}>
          <Typography variant='overline' sx={{ display: 'block', color: 'primary.main', marginBlockEnd: 2 }}>
            {contact.hero.eyebrow}
          </Typography>
        </Reveal>

        <Reveal delay={0.06}>
          <Typography variant='h1' component='h1' sx={{ fontSize: 'clamp(2.4rem, 6vw, 4.5rem)' }}>
            {contact.hero.titleLines[0]}
            <Box component='span' sx={{ display: 'block', color: 'primary.main' }}>
              {contact.hero.titleLines[1]}
            </Box>
          </Typography>
        </Reveal>

        <Reveal delay={0.12}>
          <Typography variant='subtitle1' sx={{ color: 'text.secondary', marginBlockStart: 3 }}>
            {contact.hero.subtitle}
          </Typography>
        </Reveal>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1.75fr 0.85fr' },
          alignItems: 'start',
          gap: { xs: 5, md: 6 }
        }}
      >
        <Reveal>
          <ContactForm />
        </Reveal>

        <Stack sx={{ gap: 3 }}>
          {channels.map((channel, index) => (
            <Reveal key={channel.label} delay={0.08 + index * 0.06}>
              <Stack
                component='a'
                href={channel.href}
                direction='row'
                sx={{
                  alignItems: 'center',
                  gap: 2.5,
                  padding: 3,
                  borderRadius: radius.lg,
                  textDecoration: 'none',
                  color: 'inherit',
                  backgroundColor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  transition: 'transform .4s cubic-bezier(.22,1,.36,1), border-color .3s ease',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    borderColor: theme => `rgba(${theme.vars.palette.primary.mainChannel} / 0.42)`
                  }
                }}
              >
                <Box
                  sx={{
                    display: 'grid',
                    placeItems: 'center',
                    inlineSize: 48,
                    blockSize: 48,
                    flexShrink: 0,
                    borderRadius: radius.md,
                    fontSize: '1.4rem',
                    color: 'primary.main',
                    backgroundColor: theme => `rgba(${theme.vars.palette.primary.mainChannel} / 0.10)`
                  }}
                >
                  <i className={channel.icon} />
                </Box>
                <Box>
                  <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                    {channel.label}
                  </Typography>
                  <Typography variant='subtitle2' sx={{ fontWeight: 600 }}>
                    {channel.value}
                  </Typography>
                </Box>
              </Stack>
            </Reveal>
          ))}

          <Reveal delay={0.2}>
            <Box
              sx={{
                padding: 3,
                borderRadius: radius.lg,
                backgroundColor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider'
              }}
            >
              <Typography variant='h6' component='h2' sx={{ marginBlockEnd: 1.5 }}>
                {siteConfig.address.label}
              </Typography>
              <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                {siteConfig.address.street}
                <br />
                {siteConfig.address.city}
              </Typography>
            </Box>
          </Reveal>

          <Reveal delay={0.26}>
            <Box sx={{ display: 'flex', justifyContent: 'center', paddingBlockStart: 2 }}>
              <AirGraphic variant='schedule' width={220} />
            </Box>
          </Reveal>
        </Stack>
      </Box>
    </Container>
  </Box>
)

export default ContactPage
