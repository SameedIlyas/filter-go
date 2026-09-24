'use client'

// MUI Imports
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'

// Data Imports
import { faqs } from '@/data/public/site'

// Component Imports
import AirBackdrop from '../shared/AirBackdrop'
import AirGraphic from '../shared/AirGraphic'
import Reveal from '../shared/Reveal'

const FaqsHero = () => (
  <Box
    component='section'
    sx={{
      position: 'relative',
      overflow: 'hidden',
      paddingBlockStart: { xs: 16, md: 22 },
      paddingBlockEnd: { xs: 6, md: 10 }
    }}
  >
    <AirBackdrop />

    <Container sx={{ position: 'relative', zIndex: 1 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 0.7fr' },
          alignItems: 'center',
          gap: { xs: 4, md: 6 }
        }}
      >
        <Box>
          <Reveal distance={16}>
            <Typography variant='overline' sx={{ display: 'block', color: 'primary.main', marginBlockEnd: 2 }}>
              {faqs.hero.eyebrow}
            </Typography>
          </Reveal>

          <Reveal delay={0.06}>
            <Typography variant='h1' component='h1' sx={{ fontSize: 'clamp(2.4rem, 6vw, 4.5rem)' }}>
              {faqs.hero.titleLines[0]}
              <Box component='span' sx={{ display: 'block', color: 'primary.main' }}>
                {faqs.hero.titleLines[1]}
              </Box>
            </Typography>
          </Reveal>

          <Reveal delay={0.12}>
            <Typography variant='subtitle1' sx={{ color: 'text.secondary', marginBlockStart: 3, maxInlineSize: 520 }}>
              {faqs.hero.subtitle}
            </Typography>
          </Reveal>
        </Box>

        <Box sx={{ display: { xs: 'none', md: 'flex' }, justifyContent: 'center' }}>
          <AirGraphic variant='report' width={330} />
        </Box>
      </Box>
    </Container>
  </Box>
)

export default FaqsHero
