'use client'

// Next Imports
import Link from 'next/link'

// MUI Imports
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'

// Data Imports
import { about } from '@/data/public/site'

// Component Imports
import AirBackdrop from '../shared/AirBackdrop'
import AirGraphic from '../shared/AirGraphic'
import Magnetic from '../shared/Magnetic'
import Reveal from '../shared/Reveal'

const AboutHero = () => (
  <Box
    component='section'
    sx={{
      position: 'relative',
      overflow: 'hidden',
      paddingBlockStart: { xs: 16, md: 22 },
      paddingBlockEnd: { xs: 8, md: 12 }
    }}
  >
    <AirBackdrop />

    <Container sx={{ position: 'relative', zIndex: 1 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 0.8fr' },
          alignItems: 'center',
          gap: { xs: 5, md: 6 }
        }}
      >
        <Box>
          <Reveal distance={16}>
            <Typography variant='overline' sx={{ display: 'block', color: 'primary.main', marginBlockEnd: 2 }}>
              {about.hero.eyebrow}
            </Typography>
          </Reveal>

          <Reveal delay={0.06}>
            <Typography variant='h1' component='h1'>
              {about.hero.titleLines[0]}
              <Box component='span' sx={{ display: 'block', color: 'primary.main' }}>
                {about.hero.titleLines[1]}
              </Box>
            </Typography>
          </Reveal>

          <Reveal delay={0.12}>
            <Typography variant='subtitle1' sx={{ color: 'text.secondary', marginBlockStart: 3, maxInlineSize: 540 }}>
              {about.hero.body}
            </Typography>
          </Reveal>

          <Reveal delay={0.18}>
            <Box sx={{ marginBlockStart: 4 }}>
              <Magnetic>
                <Button variant='contained' size='large' component={Link} href={about.hero.cta.href}>
                  {about.hero.cta.label}
                </Button>
              </Magnetic>
            </Box>
          </Reveal>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <AirGraphic variant='filter' width={400} />
        </Box>
      </Box>
    </Container>
  </Box>
)

export default AboutHero
