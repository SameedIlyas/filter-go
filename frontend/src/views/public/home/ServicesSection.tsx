'use client'

// Next Imports
import Link from 'next/link'

// MUI Imports
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'

// Data Imports
import { home } from '@/data/public/site'

// Theme Imports
import { radius } from '@components/layout/public/theme'

// Component Imports
import Reveal from '../shared/Reveal'
import SectionHeading from '../shared/SectionHeading'

/**
 * The service grid.
 *
 * Cards are white on the tinted section background, so the grid reads as a set
 * of discrete offers rather than a block of text. The whole card is the link
 * target — the "Learn more" row is an affordance, not the only hit area.
 */
const ServicesSection = () => (
  <Box component='section' id='services' sx={{ paddingBlock: { xs: 10, md: 14 }, scrollMarginBlockStart: 90 }}>
    <Container>
      <SectionHeading eyebrow={home.services.eyebrow} title={home.services.title} subtitle={home.services.subtitle} />

      <Grid container spacing={3}>
        {home.services.items.map((service, index) => (
          <Grid key={service.id} size={{ xs: 12, sm: 6, lg: 4 }}>
            <Reveal delay={index * 0.06} className='bs-full'>
              <Box
                component={Link}
                href='/contact'
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  blockSize: '100%',
                  padding: 4,
                  borderRadius: radius.lg,
                  textDecoration: 'none',
                  backgroundColor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  boxShadow: '0 1px 2px rgba(11,59,92,.06)',
                  transition: 'transform .35s cubic-bezier(.22,1,.36,1), box-shadow .35s ease, border-color .3s ease',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    borderColor: theme => `rgba(${theme.vars.palette.primary.mainChannel} / 0.5)`,
                    boxShadow: '0 18px 34px -22px rgba(11,59,92,.45)'
                  },
                  '&:hover .cc-service-arrow': { transform: 'translateX(5px)' }
                }}
              >
                <Box
                  sx={{
                    display: 'grid',
                    placeItems: 'center',
                    inlineSize: 52,
                    blockSize: 52,
                    marginBlockEnd: 3,
                    borderRadius: radius.md,
                    fontSize: '1.5rem',
                    color: 'secondary.main',
                    backgroundColor: theme => `rgba(${theme.vars.palette.secondary.mainChannel} / 0.09)`
                  }}
                >
                  <i className={service.icon} />
                </Box>

                <Typography variant='h5' component='h3' sx={{ marginBlockEnd: 1.5 }}>
                  {service.title}
                </Typography>
                <Typography variant='body2' sx={{ color: 'text.secondary', flexGrow: 1 }}>
                  {service.description}
                </Typography>

                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.75,
                    marginBlockStart: 3,
                    color: 'primary.dark',
                    fontWeight: 600,
                    fontSize: '0.9375rem'
                  }}
                >
                  Learn more
                  <Box
                    component='span'
                    className='cc-service-arrow'
                    aria-hidden
                    sx={{ display: 'inline-flex', transition: 'transform .3s cubic-bezier(.22,1,.36,1)' }}
                  >
                    <i className='bx-right-arrow-alt' />
                  </Box>
                </Box>
              </Box>
            </Reveal>
          </Grid>
        ))}
      </Grid>
    </Container>
  </Box>
)

export default ServicesSection
