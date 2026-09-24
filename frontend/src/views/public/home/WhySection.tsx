'use client'

// MUI Imports
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'

// Theme Imports
import { radius } from '@components/layout/public/theme'

// Data Imports
import { home } from '@/data/public/site'

// Component Imports
import AirBackdrop from '../shared/AirBackdrop'
import Reveal from '../shared/Reveal'
import SectionHeading from '../shared/SectionHeading'

/**
 * The four reasons to choose CoolCraft.
 *
 * Each card lifts on hover and reveals a gradient edge. The icon tile rotates a
 * few degrees rather than scaling, which keeps the row's rhythm intact while
 * still acknowledging the pointer.
 */
const WhySection = () => (
  <Box
    component='section'
    sx={{ position: 'relative', paddingBlock: { xs: 10, md: 16 }, backgroundColor: 'background.paper' }}
  >
    <AirBackdrop variant='section' />

    <Container sx={{ position: 'relative', zIndex: 1 }}>
      <SectionHeading eyebrow={home.why.eyebrow} title={home.why.title} subtitle={home.why.subtitle} />

      <Grid container spacing={3}>
        {home.why.items.map((item, index) => (
          <Grid key={item.id} size={{ xs: 12, sm: 6, lg: 3 }}>
            <Reveal delay={index * 0.08} className='bs-full'>
              <Box
                sx={{
                  position: 'relative',
                  blockSize: '100%',
                  padding: 4,
                  borderRadius: radius.lg,
                  overflow: 'hidden',
                  backgroundColor: 'background.default',
                  border: '1px solid',
                  borderColor: 'divider',
                  transition: 'transform .45s cubic-bezier(.22,1,.36,1), box-shadow .45s ease',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    insetBlockStart: 0,
                    insetInline: 0,
                    blockSize: 3,
                    background: theme => `linear-gradient(90deg, ${theme.vars.palette.primary.main}, #7FE0D4)`,
                    transform: 'scaleX(0)',
                    transformOrigin: 'left',
                    transition: 'transform .5s cubic-bezier(.22,1,.36,1)'
                  },
                  '&:hover': { transform: 'translateY(-8px)', boxShadow: '0 30px 60px -34px rgba(27,154,170,.6)' },
                  '&:hover::before': { transform: 'scaleX(1)' },
                  '&:hover .coolcraft-why-icon': { transform: 'rotate(-8deg)' }
                }}
              >
                <Box
                  className='coolcraft-why-icon'
                  sx={{
                    display: 'grid',
                    placeItems: 'center',
                    inlineSize: 56,
                    blockSize: 56,
                    marginBlockEnd: 3,
                    borderRadius: radius.md,
                    fontSize: '1.6rem',
                    color: 'primary.main',
                    backgroundColor: theme => `rgba(${theme.vars.palette.primary.mainChannel} / 0.10)`,
                    transition: 'transform .45s cubic-bezier(.22,1,.36,1)'
                  }}
                >
                  <i className={item.icon} />
                </Box>

                <Typography variant='h5' component='h3' sx={{ marginBlockEnd: 1.5 }}>
                  {item.title}
                </Typography>
                <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                  {item.description}
                </Typography>
              </Box>
            </Reveal>
          </Grid>
        ))}
      </Grid>
    </Container>
  </Box>
)

export default WhySection
