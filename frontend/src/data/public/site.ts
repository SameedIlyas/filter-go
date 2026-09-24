/*
 * Every word on the public website lives here.
 *
 * Keeping copy in one typed module means a wording change never requires
 * touching a component, and the same strings feed both the page and its
 * metadata.
 *
 * ---------------------------------------------------------------------------
 * TODO — replace before launch. These are placeholders, not real values:
 *   · siteConfig.url / email / phone / address
 *   · siteConfig.social.*
 *   · every entry in `testimonials`
 *   · every figure in `home.stats`
 * Nothing here should go live claiming a customer or a number CoolCraft
 * cannot stand behind.
 * ---------------------------------------------------------------------------
 */

export type ProcessStep = {
  id: string
  label: string
  title: string
  description: string
  icon: string
}

export type ValueProp = {
  id: string
  title: string
  description: string
  icon: string
}

export type Testimonial = {

  /** Stable key — two customers can share a name, so never key on `name`. */
  id: string
  quote: string
  name: string
  business: string
}

export type FaqItem = {
  question: string
  answer: string
}

export type FaqCategory = {
  id: string
  label: string
  icon: string
  items: FaqItem[]
}

export const siteConfig = {
  name: 'CoolCraft',
  legalName: 'CoolCraft',
  tagline: 'Cleaner air, on schedule',
  description:
    'CoolCraft replaces commercial air filters on a schedule you never have to think about. No contracts, no service fees.',

  // TODO: real domain
  url: 'https://www.coolcraft.com',

  // TODO: real phone
  phone: '(555) 010-0100',
  phoneHref: 'tel:+15550100100',

  // TODO: real inbox
  email: 'hello@coolcraft.com',
  emailHref: 'mailto:hello@coolcraft.com',

  // TODO: real address
  address: {
    label: 'CoolCraft HQ',
    street: '000 Example Street, Suite 000',
    city: 'Your City, ST 00000'
  },

  // TODO: real profiles
  social: {
    instagram: 'https://www.instagram.com/',
    linkedin: 'https://www.linkedin.com/'
  }
} as const

export const mainNav = [
  { label: 'About', href: '/about' },
  { label: 'FAQs', href: '/faqs' },
  { label: 'Contact', href: '/contact' }
] as const

export const home = {
  hero: {
    titleLines: ['Cleaner Air,', 'On Schedule'],
    subtitle:
      'We replace the filters in your commercial HVAC units before anyone notices they needed replacing. No contracts. No service fees.',
    primaryCta: { label: 'Book an assessment', href: '/contact' },
    secondaryCta: { label: 'How it works', href: '#process' },
    scrollHint: 'Scroll to explore'
  },

  process: {
    eyebrow: 'How it works',
    title: 'Three steps to cleaner air',
    subtitle: 'Set it up once and filter maintenance stops being something you have to remember.',
    steps: [
      {
        id: 'assess',
        label: 'Step one',
        title: 'We survey your units',
        description:
          'A technician walks your roof and mechanical rooms, logs every unit, and records the filter sizes, counts and access notes. You get a written plan showing what each unit needs and how often.',
        icon: 'bx-search-alt'
      },
      {
        id: 'schedule',
        label: 'Step two',
        title: 'We build the schedule',
        description:
          'Replacement intervals are set per unit, based on its filter type and how hard it works. Clean filters cut the load on a system and keep it running closer to the efficiency it was specified at.',
        icon: 'bx-calendar-check'
      },
      {
        id: 'swap',
        label: 'Step three',
        title: 'We show up and swap them',
        description:
          'You get a reminder before each visit with your technician’s name. They arrive with the right filters already sized, swap them, clear up, and send you a dated photo report of every unit they touched.',
        icon: 'bx-wind'
      }
    ] satisfies ProcessStep[]
  },

  /** Credential strip directly under the hero — the things a buyer checks first. */
  trust: [
    { id: 'insured', label: 'Licensed & insured', icon: 'bx-shield-quarter' },
    { id: 'contract', label: 'No contract required', icon: 'bx-file-blank' },
    { id: 'response', label: '48-hour survey booking', icon: 'bx-time-five' },
    { id: 'report', label: 'Photo report every visit', icon: 'bx-camera' }
  ],

  services: {
    eyebrow: 'What we do',
    title: 'Our services',
    subtitle: 'One trade, covered properly — from the first survey to the compliance record your file needs.',
    items: [
      {
        id: 'programme',
        title: 'Scheduled replacement',
        description:
          'A standing interval per unit, set from its filter type and duty cycle. Visits are confirmed ahead and kept.',
        icon: 'bx-refresh'
      },
      {
        id: 'survey',
        title: 'Survey & filter audit',
        description:
          'Every unit logged with sizes, counts, access notes and a recommended interval. Yours to keep either way.',
        icon: 'bx-clipboard'
      },
      {
        id: 'rooftop',
        title: 'Rooftop units',
        description:
          'Roof-access RTUs are most of what we do. Technicians carry their own access equipment and fall protection.',
        icon: 'bx-buildings'
      },
      {
        id: 'iaq',
        title: 'Air quality upgrades',
        description:
          'MERV rating reviewed against what the unit can take, so you gain filtration without starving it of airflow.',
        icon: 'bx-wind'
      },
      {
        id: 'compliance',
        title: 'Compliance records',
        description:
          'Dated, unit-by-unit photo reports, retained and exportable. The evidence a landlord or auditor asks for.',
        icon: 'bx-file'
      },
      {
        id: 'multisite',
        title: 'Multi-site programmes',
        description: 'One schedule, one invoice and one point of contact across a portfolio or a chain of locations.',
        icon: 'bx-map-alt'
      }
    ] satisfies ValueProp[]
  },

  why: {
    eyebrow: 'Why CoolCraft',
    title: 'Maintenance that stays out of your way',
    subtitle: 'Four reasons facilities teams hand us the roof and stop thinking about filters.',
    items: [
      {
        id: 'transparent',
        title: 'Transparent pricing',
        description:
          'You pay for filters and labour, quoted up front. No call-out charge, no contract, no minimum term, and no line items you have to ring up to understand.',
        icon: 'bx-dollar-circle'
      },
      {
        id: 'dependable',
        title: 'Dependable',
        description:
          'Visits are scheduled, confirmed in advance and kept. We arrive with the right sizes already on the van, so a visit is never rescheduled for stock.',
        icon: 'bx-check-shield'
      },
      {
        id: 'documented',
        title: 'Documented',
        description:
          'Every visit closes with a dated photo report, unit by unit. It is the paperwork your compliance file wants and the evidence your landlord asks for.',
        icon: 'bx-file'
      },
      {
        id: 'unobtrusive',
        title: 'Unobtrusive',
        description:
          'Uniformed technicians, ten minutes a unit, no access to your floor needed in most buildings. You do not have to be there and your day does not have to stop.',
        icon: 'bx-badge-check'
      }
    ] satisfies ValueProp[]
  },

  // TODO: replace with CoolCraft's own verified figures
  stats: [
    { value: 0, suffix: '', label: 'filters replaced', note: 'TODO: real figure' },
    { value: 0, suffix: '', label: 'sites serviced', note: 'TODO: real figure' },
    { value: 0, suffix: '%', label: 'visits on schedule', note: 'TODO: real figure' },
    { value: 10, suffix: ' min', label: 'per filter', note: 'typical swap time' }
  ],

  cta: {
    title: 'Ready for cleaner air?',
    highlight: 'Let’s talk',
    subtitle: 'Tell us about your building and we’ll come out, survey the units and send you a plan.',
    primaryCta: { label: 'Book an assessment', href: '/contact' },
    secondaryCta: { label: 'Read the FAQs', href: '/faqs' }
  }
} as const

/*
 * TODO: replace wholesale with CoolCraft's own customers, with their written
 * permission. Do not publish a quote, a name or a business that has not agreed
 * to appear here.
 */
export const testimonials: Testimonial[] = [
  {
    id: 'placeholder-1',
    quote: 'Placeholder quote — replace with a real customer’s words once you have their sign-off.',
    name: 'Customer name',
    business: 'Their business'
  },
  {
    id: 'placeholder-2',
    quote: 'Placeholder quote — replace with a real customer’s words once you have their sign-off.',
    name: 'Customer name',
    business: 'Their business'
  },
  {
    id: 'placeholder-3',
    quote: 'Placeholder quote — replace with a real customer’s words once you have their sign-off.',
    name: 'Customer name',
    business: 'Their business'
  }
]

export const about = {
  hero: {
    eyebrow: 'About us',
    titleLines: ['Filter service,', 'done properly'],
    body: 'CoolCraft exists because filter maintenance is the easiest part of a building to neglect and one of the more expensive things to neglect. We do one job, we do it on a schedule, and we leave a record behind.',
    cta: { label: 'Work with us', href: '/contact' }
  },

  mission: {
    eyebrow: 'Mission',
    title: 'One job, done on time',
    paragraphs: [
      'A clogged filter makes a system work harder for less air. It shortens equipment life, drives up energy use, and degrades the air in the room — all quietly, over months, until something fails or someone complains.',
      'CoolCraft is built around removing that from your list entirely. Units are surveyed once, put on an interval that suits how hard they actually work, and serviced on that interval without you chasing anyone.'
    ]
  },

  values: {
    eyebrow: 'How we work',
    title: 'Four things we hold to',
    subtitle: 'Not slogans — the standards we measure ourselves against on every visit.',
    items: [
      {
        id: 'punctual',
        title: 'Punctual',
        description: 'A booked visit is a kept visit. If a date has to move, you hear it from us first.',
        icon: 'bx-time-five'
      },
      {
        id: 'tidy',
        title: 'Tidy',
        description: 'Old filters leave with us. A site looks exactly as it did before we arrived.',
        icon: 'bx-brush'
      },
      {
        id: 'accountable',
        title: 'Accountable',
        description: 'Dated photographs of every unit, every visit. Nothing rests on our word alone.',
        icon: 'bx-camera'
      },
      {
        id: 'straightforward',
        title: 'Straightforward',
        description: 'Prices quoted up front, no contract to exit, no surprise on the invoice.',
        icon: 'bx-receipt'
      }
    ] satisfies ValueProp[]
  },

  story: {
    eyebrow: 'Our approach',
    title: 'Narrow on purpose',
    paragraphs: [
      'We are not an HVAC contractor and we do not want to be. Filters are a small, repeatable job that general contractors fit around larger work, which is exactly why they slip. Doing only this means we can schedule it tightly and price it honestly.',
      'If we find something on a unit that needs a real HVAC technician, we photograph it and tell you. We will not quote for work outside our scope, and we have no reason to find problems that are not there.'
    ]
  }
} as const

export const faqs = {
  hero: {
    eyebrow: 'FAQs',
    titleLines: ['Questions,', 'answered'],
    subtitle: 'What a visit involves, how pricing works, and what happens when we find something unexpected.'
  },

  benefits: {
    eyebrow: 'Worth knowing',
    title: 'What regular replacement actually buys you',
    items: [
      {
        id: 'consistent',
        title: 'A schedule that holds',
        description:
          'Intervals are set per unit and visits are confirmed in advance. No contract to sign and nothing to remember — the date simply arrives and the work gets done.',
        icon: 'bx-calendar-check'
      },
      {
        id: 'efficiency',
        title: 'Less load on the system',
        description:
          'A loaded filter forces a blower to work harder for less airflow. Replacing on interval keeps static pressure where the unit was specified and takes strain off the equipment.',
        icon: 'bx-trending-up'
      },
      {
        id: 'cleaner-air',
        title: 'Better air in the room',
        description:
          'Filters only capture what they have capacity left to capture. Fresh media means less dust and fewer airborne particles reaching the people in the building.',
        icon: 'bx-leaf'
      }
    ] satisfies ValueProp[]
  },

  categories: [
    {
      id: 'general',
      label: 'General',
      icon: 'bx-info-circle',
      items: [
        {
          question: 'What does a CoolCraft service include?',
          answer:
            'It starts with a free on-site survey. We log every unit, record filter sizes and counts, note access, and send you a written plan with an interval and a price per visit. From then on each visit is a confirmed appointment, a filter swap on every listed unit, removal of the old media, and a dated photo report.'
        },
        {
          question: 'How is it priced?',
          answer:
            'On filter count, filter size and how often each unit needs doing — quoted before you commit to anything. There is no call-out fee, no contract and no minimum term. If your building changes, the quote changes with it.'
        },
        {
          question: 'Do you work on homes?',
          answer:
            'No. We service commercial properties — restaurants, retail, offices, gyms, clinics and similar buildings, typically with rooftop or accessible mechanical-room units.'
        },
        {
          question: 'Which areas do you cover?',
          answer:
            'Coverage is expanding. Send us the address and we will tell you plainly whether we are already serving it or when we expect to be.'
        }
      ]
    },
    {
      id: 'scheduling',
      label: 'Scheduling',
      icon: 'bx-calendar',
      items: [
        {
          question: 'How do I get started?',
          answer:
            'Book the free survey. Once we have seen the units we can give you an interval and a price, and set the first service date from there.'
        },
        {
          question: 'Do I need to be on site?',
          answer:
            'Usually not. As long as our technician can reach the roof or the mechanical room, your day carries on as normal. The photo report tells you what happened without you having to watch it happen.'
        },
        {
          question: 'How long does a visit take?',
          answer:
            'Roughly ten minutes per filter once the technician is at the unit. Most single-site visits are done inside an hour.'
        },
        {
          question: 'What if you spot a problem with a unit?',
          answer:
            'We photograph it, flag it in the report and call you if it looks urgent. We will tell you it needs an HVAC technician — we will not quote to fix it ourselves, because that is not what we do.'
        }
      ]
    },
    {
      id: 'practical',
      label: 'Practical',
      icon: 'bx-wrench',
      items: [
        {
          question: 'What happens to the old filters?',
          answer:
            'They leave with the technician and are disposed of as part of the visit. Nothing is left on your site.'
        },
        {
          question: 'Can you work outside business hours?',
          answer:
            'Often, yes — particularly for restaurants and retail where a daytime visit is awkward. Tell us your constraints when you book the survey and we will build the schedule around them.'
        },
        {
          question: 'Do you supply the filters, or do we?',
          answer:
            'We do, sized from the survey, and the cost is in the quoted price. If your building standardises on a particular grade or brand, tell us and we will match it.'
        }
      ]
    }
  ] satisfies FaqCategory[],

  stillStuck: {
    title: 'Still have a question?',
    subtitle: 'Ask us directly — a real person will get back to you.',
    cta: { label: 'Contact us', href: '/contact' }
  }
} as const

export const contact = {
  hero: {
    eyebrow: 'Appointments',
    titleLines: ['Book your', 'free assessment'],
    subtitle: 'One short form and we will call to arrange a survey of your units. No obligation and nothing to sign.'
  },

  /*
   * The booking form, split into three named steps. Grouping a twelve-field
   * form is what keeps it from reading as a wall of inputs — each fieldset is a
   * separate, obvious decision.
   */
  form: {
    sections: [
      { id: 'essentials', title: 'The essentials', description: 'Who we should talk to.' },
      { id: 'appointment', title: 'Appointment details', description: 'Where and when suits you.' },
      { id: 'specifics', title: 'Service specifics', description: 'So we arrive with the right filters.' }
    ],
    submitLabel: 'Book my assessment'
  },

  /** `Type of business` — the commercial categories CoolCraft services. */
  businessTypes: [
    'Restaurant or café',
    'Retail store',
    'Gym or fitness studio',
    'Office',
    'Medical or dental practice',
    'Salon or spa',
    'Warehouse or industrial',
    'Hotel or hospitality',
    'School or community space',
    'Something else'
  ],

  /** Half-hour slots across a normal service day. */
  timeSlots: [
    '8:00 AM',
    '8:30 AM',
    '9:00 AM',
    '9:30 AM',
    '10:00 AM',
    '10:30 AM',
    '11:00 AM',
    '11:30 AM',
    '12:00 PM',
    '12:30 PM',
    '1:00 PM',
    '1:30 PM',
    '2:00 PM',
    '2:30 PM',
    '3:00 PM',
    '3:30 PM',
    '4:00 PM',
    '4:30 PM'
  ]
} as const

export const footerNav = {
  company: [
    { label: 'About', href: '/about' },
    { label: 'FAQs', href: '/faqs' },
    { label: 'Contact', href: '/contact' }
  ],
  legal: [
    { label: 'Privacy Policy', href: '/privacy-policy' },
    { label: 'Terms of use', href: '/terms-of-use' }
  ]
} as const
