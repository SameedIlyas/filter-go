'use client'

// MUI Imports
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

// Theme Imports
import { radius } from '@components/layout/public/theme'

// Component Imports
import Reveal from './Reveal'

type Props = {
  eyebrow?: string
  title: string
  subtitle?: string
  align?: 'left' | 'center'
  maxWidth?: number
}

/** Eyebrow + heading + supporting line, with a staggered reveal. */
const SectionHeading = ({ eyebrow, title, subtitle, align = 'center', maxWidth = 720 }: Props) => (
  <Box
    sx={{
      textAlign: align,
      maxInlineSize: maxWidth,
      marginInline: align === 'center' ? 'auto' : 0,
      marginBlockEnd: { xs: 6, md: 9 }
    }}
  >
    {eyebrow ? (
      <Reveal distance={16}>
        <Box
          component='span'
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            paddingBlock: 0.75,
            paddingInline: 2,
            marginBlockEnd: 2.5,
            borderRadius: radius.pill,
            border: theme => `1px solid rgba(${theme.vars.palette.primary.mainChannel} / 0.22)`,
            backgroundColor: theme => `rgba(${theme.vars.palette.primary.mainChannel} / 0.08)`,
            color: 'primary.main',
            fontSize: '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.16em',
            textTransform: 'uppercase'
          }}
        >
          <Box
            component='span'
            sx={{ inlineSize: 6, blockSize: 6, borderRadius: '50%', backgroundColor: 'primary.main' }}
          />
          {eyebrow}
        </Box>
      </Reveal>
    ) : null}

    <Reveal delay={0.06}>
      <Typography variant='h2' component='h2'>
        {title}
      </Typography>
    </Reveal>

    {subtitle ? (
      <Reveal delay={0.12}>
        <Typography
          variant='subtitle1'
          sx={{ color: 'text.secondary', marginBlockStart: 2.5, marginInline: align === 'center' ? 'auto' : 0 }}
        >
          {subtitle}
        </Typography>
      </Reveal>
    ) : null}
  </Box>
)

export default SectionHeading
