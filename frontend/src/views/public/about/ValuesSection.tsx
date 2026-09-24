'use client'

// MUI Imports
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'

// Theme Imports
import { radius } from '@components/layout/public/theme'

// Data Imports
import { about } from '@/data/public/site'

// Component Imports
import Reveal from '../shared/Reveal'
import SectionHeading from '../shared/SectionHeading'

/**
 * The four F's.
 *
 * The oversized initial behind each card is decorative, so it is aria-hidden
 * and sits at low opacity — it gives the row a typographic beat without
 * competing with the value's name.
 */
const ValuesSection = () => (
  <Box component='section' sx={{ paddingBlock: { xs: 10, md: 16 }, backgroundColor: 'background.paper' }}>
    <Container>
      <SectionHeading eyebrow={about.values.eyebrow} title={about.values.title} subtitle={about.values.subtitle} />

      <Grid container spacing={3}>
        {about.values.items.map((value, index) => (
          <Grid key={value.id} size={{ xs: 12, sm: 6, lg: 3 }}>
            <Reveal delay={index * 0.08} className='bs-full'>
              <Box
                sx={{
                  position: 'relative',
                  blockSize: '100%',
                  overflow: 'hidden',
                  padding: 4,
                  borderRadius: radius.lg,
                  backgroundColor: 'background.default',
                  border: '1px solid',
                  borderColor: 'divider',
                  transition: 'transform .45s cubic-bezier(.22,1,.36,1), border-color .3s ease',
                  '&:hover': {
                    transform: 'translateY(-8px)',
                    borderColor: theme => `rgba(${theme.vars.palette.primary.mainChannel} / 0.42)`
                  },
                  '&:hover .coolcraft-value-initial': { transform: 'translate(6px, -6px)', opacity: 0.16 }
                }}
              >
                <Box
                  aria-hidden
                  className='coolcraft-value-initial'
                  sx={{
                    position: 'absolute',
                    insetBlockStart: -18,
                    insetInlineEnd: 4,
                    fontSize: '7rem',
                    fontWeight: 800,
                    lineHeight: 1,
                    color: 'primary.main',
                    opacity: 0.08,
                    transition: 'transform .5s cubic-bezier(.22,1,.36,1), opacity .4s ease',
                    pointerEvents: 'none'
                  }}
                >
                  {value.title.charAt(0)}
                </Box>

                <Box
                  sx={{
                    position: 'relative',
                    display: 'grid',
                    placeItems: 'center',
                    inlineSize: 52,
                    blockSize: 52,
                    marginBlockEnd: 3,
                    borderRadius: radius.md,
                    fontSize: '1.5rem',
                    color: 'primary.main',
                    backgroundColor: theme => `rgba(${theme.vars.palette.primary.mainChannel} / 0.10)`
                  }}
                >
                  <i className={value.icon} />
                </Box>

                <Typography variant='h5' component='h3' sx={{ position: 'relative', marginBlockEnd: 1 }}>
                  {value.title}
                </Typography>
                <Typography variant='body2' sx={{ position: 'relative', color: 'text.secondary' }}>
                  {value.description}
                </Typography>
              </Box>
            </Reveal>
          </Grid>
        ))}
      </Grid>
    </Container>
  </Box>
)

export default ValuesSection
