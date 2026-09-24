// Data Imports
import { faqs } from '@/data/public/site'

// Component Imports
import FaqsHero from './FaqsHero'
import BenefitsSection from './BenefitsSection'
import FaqAccordion from './FaqAccordion'
import CtaSection from '../shared/CtaSection'

const FaqsPage = () => (
  <>
    <FaqsHero />
    <BenefitsSection />
    <FaqAccordion />
    <CtaSection title={faqs.stillStuck.title} subtitle={faqs.stillStuck.subtitle} primaryCta={faqs.stillStuck.cta} />
  </>
)

export default FaqsPage
