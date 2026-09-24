'use client'

// MUI Imports
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'

// Theme Imports
import { radius } from '@components/layout/public/theme'

// Data Imports
import { faqs } from '@/data/public/site'

// Component Imports
import Reveal from '../shared/Reveal'
import SectionHeading from '../shared/SectionHeading'

const BenefitsSection = () => (
  <Box component='section' sx={{ paddingBlock: { xs: 8, md: 12 }, backgroundColor: 'background.paper' }}>
    <Container>
      <SectionHeading eyebrow={faqs.benefits.eyebrow} title={faqs.benefits.title} />

      <Grid container spacing={3}>
        {faqs.benefits.items.map((item, index) => (
          <Grid key={item.id} size={{ xs: 12, md: 4 }}>
            <Reveal delay={index * 0.08} className='bs-full'>
              <Box
                sx={{
                  blockSize: '100%',
                  padding: 4,
                  borderRadius: radius.lg,
                  backgroundColor: 'background.default',
                  border: '1px solid',
                  borderColor: 'divider',
                  transition: 'transform .45s cubic-bezier(.22,1,.36,1), border-color .3s ease',
                  '&:hover': {
                    transform: 'translateY(-6px)',
                    borderColor: theme => `rgba(${theme.vars.palette.primary.mainChannel} / 0.42)`
                  }
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
                    color: 'primary.main',
                    backgroundColor: theme => `rgba(${theme.vars.palette.primary.mainChannel} / 0.10)`
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

export default BenefitsSection
