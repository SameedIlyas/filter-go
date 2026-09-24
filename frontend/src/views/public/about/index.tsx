// Data Imports
import { about } from '@/data/public/site'

// Component Imports
import AboutHero from './AboutHero'
import MissionSection from './MissionSection'
import ValuesSection from './ValuesSection'
import StatsSection from '../home/StatsSection'
import CtaSection from '../shared/CtaSection'
import TestimonialsSection from '../shared/TestimonialsSection'

const AboutPage = () => (
  <>
    <AboutHero />
    <StatsSection />
    <MissionSection section={about.mission} graphic='schedule' />
    <ValuesSection />
    <MissionSection section={about.story} flip graphic='report' />
    <TestimonialsSection />
    <CtaSection
      title='Ready for cleaner air?'
      highlight='Let’s Talk'
      subtitle='Tell us about your building and we’ll put together a filter plan that fits.'
      primaryCta={{ label: 'Schedule Appointment', href: '/contact' }}
      secondaryCta={{ label: 'Read the FAQs', href: '/faqs' }}
    />
  </>
)

export default AboutPage
