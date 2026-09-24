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
import Counter from '../shared/Counter'
import Reveal from '../shared/Reveal'

/** Proof points, counted up on first view. */
const StatsSection = () => (
  <Box component='section' sx={{ paddingBlock: { xs: 8, md: 12 } }}>
    <Container>
      <Box
        sx={{
          padding: { xs: 4, md: 7 },
          borderRadius: radius.xl,
          border: '1px solid',
          borderColor: 'divider',
          backgroundColor: 'background.paper',
          backgroundImage: theme =>
            `radial-gradient(120% 140% at 50% 0%, rgba(${theme.vars.palette.primary.mainChannel} / 0.08) 0%, transparent 60%)`
        }}
      >
        <Grid container spacing={{ xs: 4, md: 3 }}>
          {home.stats.map((stat, index) => (
            <Grid key={stat.label} size={{ xs: 6, md: 3 }}>
              <Reveal delay={index * 0.08}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography
                    variant='h2'
                    component='p'
                    sx={{
                      background: theme =>
                        `linear-gradient(140deg, ${theme.vars.palette.primary.main} 0%, #7FE0D4 100%)`,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text'
                    }}
                  >
                    <Counter value={stat.value} suffix={stat.suffix} />
                  </Typography>
                  <Typography variant='h6' component='p' sx={{ marginBlockStart: 1 }}>
                    {stat.label}
                  </Typography>
                  <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                    {stat.note}
                  </Typography>
                </Box>
              </Reveal>
            </Grid>
          ))}
        </Grid>
      </Box>
    </Container>
  </Box>
)

export default StatsSection
