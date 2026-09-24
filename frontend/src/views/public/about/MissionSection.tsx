'use client'

// MUI Imports
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'

// Component Imports
import AirGraphic from '../shared/AirGraphic'

import type { AirGraphicVariant } from '../shared/AirGraphic'
import Reveal from '../shared/Reveal'

type Section = {
  eyebrow: string
  title: string
  paragraphs: readonly string[]
}

type Props = {
  section: Section

  /** Put the illustration on the left instead of the right. */
  flip?: boolean
  graphic?: AirGraphicVariant
}

/** Two-column prose block used for the mission and the story. */
const MissionSection = ({ section, flip = false, graphic = 'schedule' }: Props) => (
  <Box component='section' sx={{ paddingBlock: { xs: 8, md: 12 } }}>
    <Container>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '0.9fr 1.1fr' },
          alignItems: 'center',
          gap: { xs: 5, md: 8 }
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'center', order: { xs: -1, md: flip ? -1 : 1 } }}>
          <Reveal direction={flip ? 'left' : 'right'} distance={40}>
            <AirGraphic variant={graphic} width={340} />
          </Reveal>
        </Box>

        <Box>
          <Reveal distance={16}>
            <Typography variant='overline' sx={{ display: 'block', color: 'primary.main', marginBlockEnd: 1.5 }}>
              {section.eyebrow}
            </Typography>
          </Reveal>

          <Reveal delay={0.06}>
            <Typography variant='h2' component='h2' sx={{ marginBlockEnd: 3 }}>
              {section.title}
            </Typography>
          </Reveal>

          {section.paragraphs.map((paragraph, index) => (
            <Reveal key={paragraph.slice(0, 24)} delay={0.12 + index * 0.06}>
              <Typography variant='body1' sx={{ color: 'text.secondary', marginBlockEnd: 2.5 }}>
                {paragraph}
              </Typography>
            </Reveal>
          ))}
        </Box>
      </Box>
    </Container>
  </Box>
)

export default MissionSection
