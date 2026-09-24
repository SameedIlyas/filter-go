// React Imports
import { useEffect, useRef } from 'react'

// MUI Imports
import Chip from '@mui/material/Chip'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'

// Third-party Imports
import classnames from 'classnames'

// Hook Imports
import { useIntersection } from '@/hooks/useIntersection'

// SVG Imports
import Check from '@assets/svg/front-pages/landing-page/Check'
import Document from '@assets/svg/front-pages/landing-page/Document'
import LaptopCharging from '@assets/svg/front-pages/landing-page/LaptopCharging'
import Paper from '@assets/svg/front-pages/landing-page/Paper'
import Rocket from '@assets/svg/front-pages/landing-page/Rocket'
import User from '@assets/svg/front-pages/landing-page/User'

// Styles Imports
import frontCommonStyles from '@views/front-pages/styles.module.css'

// Data
const feature = [
  {
    icon: <LaptopCharging color='var(--mui-palette-primary-main)' />,
    title: 'Quality Code',
    description: 'Code structure that all developers will easily understand and fall in love with.'
  },
  {
    icon: <Rocket color='var(--mui-palette-primary-main)' />,
    title: 'Continuous Updates',
    description: 'Free updates for the next 12 months, including new demos and features.'
  },
  {
    icon: <Paper color='var(--mui-palette-primary-main)' />,
    title: 'Stater-Kit',
    description: 'Start your project quickly without having to remove unnecessary features.'
  },
  {
    icon: <Check color='var(--mui-palette-primary-main)' />,
    title: 'API Ready',
    description: 'Just change the endpoint and see your own data loaded within seconds.'
  },
  {
    icon: <User color='var(--mui-palette-primary-main)' />,
    title: 'Excellent Support',
    description: 'An easy-to-follow doc with lots of references and code examples.'
  },
  {
    icon: <Document color='var(--mui-palette-primary-main)' />,
    title: 'Well Documented',
    description: 'An easy-to-follow doc with lots of references and code examples.'
  }
]

const UsefulFeature = () => {
  // Refs
  const skipIntersection = useRef(true)
  const ref = useRef<null | HTMLDivElement>(null)

  // Hooks
  const { updateIntersections } = useIntersection()

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (skipIntersection.current) {
          skipIntersection.current = false

          return
        }

        updateIntersections({ [entry.target.id]: entry.isIntersecting })
      },
      { threshold: 0.35 }
    )

    ref.current && observer.observe(ref.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section id='features' ref={ref}>
      <div className={classnames('flex flex-col gap-12 plb-[100px]', frontCommonStyles.layoutSpacing)}>
        <div className='flex flex-col items-center justify-center gap-4'>
          <Chip size='small' variant='tonal' color='primary' label='Useful Feature' />
          <div className='flex flex-wrap flex-col items-center justify-center gap-1 text-center'>
            <Typography variant='h4'>
              <span className='relative z-[1] font-extrabold'>
                Everything you need
                <img
                  src='/images/front-pages/landing-page/bg-shape.png'
                  alt='bg-shape'
                  className='absolute block-end-0 z-[1] bs-[40%] is-[125%] sm:is-[132%] -inline-start-[13%] sm:inline-start-[-19%] block-start-[17px]'
                />
              </span>{' '}
              to start your next project
            </Typography>
            <Typography>
              Not just a set of tools, the package includes ready-to-deploy conceptual application.
            </Typography>
          </div>
        </div>
        <div>
          <Grid container spacing={6} rowGap={12}>
            {feature.map((item, index) => (
              <Grid size={{ xs: 12, sm: 6, lg: 4 }} key={index}>
                <div className='flex flex-col items-center justify-center'>
                  {item.icon}
                  <Typography variant='h5' className='mbs-4'>
                    {item.title}
                  </Typography>
                  <Typography className='max-is-[364px] mbs-2 text-center'>{item.description}</Typography>
                </div>
              </Grid>
            ))}
          </Grid>
        </div>
      </div>
    </section>
  )
}

export default UsefulFeature
