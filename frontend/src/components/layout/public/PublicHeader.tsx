'use client'

// React Imports
import { useState } from 'react'

// Next Imports
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// MUI Imports
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { motion, useMotionValueEvent, useScroll, useSpring } from 'motion/react'

// Theme Imports
import { radius } from './theme'

// Data Imports
import { mainNav, siteConfig } from '@/data/public/site'

// Component Imports
import PublicLogo from './Logo'

/**
 * Sticky site header.
 *
 * Transparent over the hero and switching to a blurred, bordered bar once the
 * page scrolls — so the mark never sits on a competing background. The hairline
 * under it is a scroll-progress indicator, which doubles as a reading cue on
 * the longer pages.
 */
const PublicHeader = () => {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { scrollY, scrollYProgress } = useScroll()
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 26, restDelta: 0.001 })

  useMotionValueEvent(scrollY, 'change', latest => setScrolled(latest > 24))

  const isActive = (href: string) => pathname === href

  return (
    <>
      <Box
        component='header'
        sx={{
          position: 'fixed',
          insetBlockStart: 0,
          insetInline: 0,
          zIndex: 1100,
          backgroundColor: 'background.paper',
          borderBlockEnd: '1px solid',
          borderBlockEndColor: 'divider',
          transition: 'box-shadow .35s ease',
          ...(scrolled && { boxShadow: '0 10px 30px -22px rgba(7,44,70,.6)' })
        }}
      >
        <Container>
          <Stack
            direction='row'
            sx={{ alignItems: 'center', justifyContent: 'space-between', blockSize: { xs: 68, md: 82 } }}
          >
            <Link href='/' aria-label={`${siteConfig.name} home`} style={{ display: 'inline-flex' }}>
              <PublicLogo />
            </Link>

            <Stack direction='row' sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1 }}>
              {mainNav.map(item => (
                <Button
                  key={item.href}
                  component={Link}
                  href={item.href}
                  sx={{
                    color: isActive(item.href) ? 'primary.main' : 'text.primary',
                    fontWeight: isActive(item.href) ? 700 : 500,
                    paddingInline: 2.25,

                    // Underline grows from the centre on hover and stays put when active
                    '&::after': {
                      content: '""',
                      position: 'absolute',
                      insetBlockEnd: 8,
                      insetInline: '50%',
                      blockSize: 2,
                      borderRadius: radius.pill,
                      backgroundColor: 'primary.main',
                      transform: isActive(item.href) ? 'translateX(-50%) scaleX(1)' : 'translateX(-50%) scaleX(0)',
                      inlineSize: 18,
                      transformOrigin: 'center',
                      transition: 'transform .3s cubic-bezier(.22,1,.36,1)'
                    },
                    '&:hover::after': { transform: 'translateX(-50%) scaleX(1)' },
                    '&:hover': { backgroundColor: 'transparent', transform: 'none' }
                  }}
                >
                  {item.label}
                </Button>
              ))}

              <Button variant='contained' component={Link} href='/contact' sx={{ marginInlineStart: 1.5 }}>
                Schedule Appointment
              </Button>
            </Stack>

            <IconButton
              onClick={() => setDrawerOpen(true)}
              aria-label='Open menu'
              sx={{ display: { xs: 'inline-flex', md: 'none' } }}
            >
              <i className='bx-menu' />
            </IconButton>
          </Stack>
        </Container>

        <Box
          component={motion.div}
          aria-hidden
          style={{ scaleX: progress }}
          sx={{
            blockSize: 2,
            transformOrigin: '0 50%',
            background: theme =>
              `linear-gradient(90deg, ${theme.vars.palette.primary.main}, ${theme.vars.palette.primary.light})`,
            opacity: scrolled ? 1 : 0,
            transition: 'opacity .3s ease'
          }}
        />
      </Box>

      <Drawer
        anchor='right'
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        slotProps={{ paper: { sx: { inlineSize: 300, padding: 3 } } }}
      >
        <Stack direction='row' sx={{ alignItems: 'center', justifyContent: 'space-between', marginBlockEnd: 3 }}>
          <PublicLogo size={26} />
          <IconButton onClick={() => setDrawerOpen(false)} aria-label='Close menu'>
            <i className='bx-x' />
          </IconButton>
        </Stack>

        <Stack sx={{ gap: 0.5 }}>
          {mainNav.map(item => (
            <Button
              key={item.href}
              component={Link}
              href={item.href}
              onClick={() => setDrawerOpen(false)}
              sx={{
                justifyContent: 'flex-start',
                paddingBlock: 1.5,
                fontSize: '1.0625rem',
                color: isActive(item.href) ? 'primary.main' : 'text.primary'
              }}
            >
              {item.label}
            </Button>
          ))}
        </Stack>

        <Divider sx={{ marginBlock: 3 }} />

        <Button variant='contained' fullWidth component={Link} href='/contact' onClick={() => setDrawerOpen(false)}>
          Schedule Appointment
        </Button>

        <Stack sx={{ gap: 0.5, marginBlockStart: 4 }}>
          <Typography variant='body2' sx={{ color: 'text.secondary' }}>
            {siteConfig.phone}
          </Typography>
          <Typography variant='body2' sx={{ color: 'text.secondary' }}>
            {siteConfig.email}
          </Typography>
        </Stack>
      </Drawer>
    </>
  )
}

export default PublicHeader
