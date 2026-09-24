'use client'

// MUI Imports
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'

// Data Imports
import { home } from '@/data/public/site'

// Theme Imports
import { radius } from '@components/layout/public/theme'

// Component Imports
import Reveal from '../shared/Reveal'

/**
 * Credential strip sitting across the seam between the hero and the page.
 *
 * Pulled up over the hero's lower edge so it overlaps both surfaces — it reads
 * as the hero's footing rather than as the first of the content sections, which
 * is what gets these four claims seen.
 */
const TrustStrip = () => (
  <Box component='section' sx={{ position: 'relative', zIndex: 2, marginBlockStart: { xs: -4, md: -7 } }}>
    <Container>
      <Reveal>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
            gap: { xs: 2, md: 0 },
            padding: { xs: 3, md: 1 },
            borderRadius: radius.lg,
            backgroundColor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: '0 20px 44px -30px rgba(7,44,70,.55)'
          }}
        >
          {home.trust.map((item, index) => (
            <Box
              key={item.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: { md: 'center' },
                gap: 1.5,
                paddingBlock: { md: 3 },
                paddingInline: { md: 2 },
                borderInlineStart: { md: index === 0 ? 'none' : '1px solid' },
                borderColor: { md: 'divider' }
              }}
            >
              <Box
                aria-hidden
                sx={{ display: 'inline-flex', fontSize: '1.375rem', color: 'primary.main', flexShrink: 0 }}
              >
                <i className={item.icon} />
              </Box>
              <Typography variant='body2' sx={{ fontWeight: 600, color: 'text.primary', lineHeight: 1.35 }}>
                {item.label}
              </Typography>
            </Box>
          ))}
        </Box>
      </Reveal>
    </Container>
  </Box>
)

export default TrustStrip
