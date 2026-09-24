// Data Imports
import { home } from '@/data/public/site'

// Component Imports
import HeroSection from './HeroSection'
import TrustStrip from './TrustStrip'
import ServicesSection from './ServicesSection'
import ProcessSection from './ProcessSection'
import WhySection from './WhySection'
import StatsSection from './StatsSection'
import CtaSection from '../shared/CtaSection'
import TestimonialsSection from '../shared/TestimonialsSection'

const HomePage = () => (
  <>
    <HeroSection />
    <TrustStrip />
    <ServicesSection />
    <ProcessSection />
    <WhySection />
    <StatsSection />
    <TestimonialsSection />
    <CtaSection
      title={home.cta.title}
      highlight={home.cta.highlight}
      subtitle={home.cta.subtitle}
      primaryCta={home.cta.primaryCta}
      secondaryCta={home.cta.secondaryCta}
    />
  </>
)

export default HomePage
