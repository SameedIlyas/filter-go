// Next Imports
import Link from 'next/link'

// Third-party Imports
import classnames from 'classnames'

type DefaultSuggestionsType = {
  sectionLabel: string
  items: {
    label: string
    href: string
    icon?: string
  }[]
}

const defaultSuggestions: DefaultSuggestionsType[] = [
  {
    sectionLabel: 'Popular Searches',
    items: [
      {
        label: 'Analytics',
        href: '/dashboards/analytics',
        icon: 'bx-bar-chart-alt-2'
      },
      {
        label: 'CRM',
        href: '/dashboards/crm',
        icon: 'bx-doughnut-chart'
      },
      {
        label: 'eCommerce',
        href: '/dashboards/ecommerce',
        icon: 'bx-cart'
      },
      {
        label: 'Logistics',
        href: '/apps/logistics/dashboard',
        icon: 'bx-car'
      }
    ]
  },
  {
    sectionLabel: 'Apps',
    items: [
      {
        label: 'Calendar',
        href: '/apps/calendar',
        icon: 'bx-calendar'
      },
      {
        label: 'Invoice List',
        href: '/apps/invoice/list',
        icon: 'bx-receipt'
      },
      {
        label: 'User List',
        href: '/apps/user/list',
        icon: 'bx-group'
      },
      {
        label: 'Roles & Permissions',
        href: '/apps/roles',
        icon: 'bx-lock-alt'
      }
    ]
  },
  {
    sectionLabel: 'Pages',
    items: [
      {
        label: 'User Profile',
        href: '/pages/user-profile',
        icon: 'bx-user'
      },
      {
        label: 'Account Settings',
        href: '/pages/account-settings',
        icon: 'bx-cog'
      },
      {
        label: 'Pricing',
        href: '/pages/pricing',
        icon: 'bx-dollar'
      },
      {
        label: 'FAQ',
        href: '/pages/faq',
        icon: 'bx-help-circle'
      }
    ]
  },
  {
    sectionLabel: 'Forms & Charts',
    items: [
      {
        label: 'Form Layouts',
        href: '/forms/form-layouts',
        icon: 'bx-layout'
      },
      {
        label: 'Form Validation',
        href: '/forms/form-validation',
        icon: 'bx-task'
      },
      {
        label: 'Form Wizard',
        href: '/forms/form-wizard',
        icon: 'bx-git-merge'
      },
      {
        label: 'Apex Charts',
        href: '/charts/apex-charts',
        icon: 'bx-line-chart'
      }
    ]
  }
]

const DefaultSuggestions = ({ setOpen }: { setOpen: (value: boolean) => void }) => {
  // Hooks

  return (
    <div className='flex grow flex-wrap gap-x-12 gap-y-8 plb-14 pli-16 overflow-y-auto overflow-x-hidden bs-full'>
      {defaultSuggestions.map((section, index) => (
        <div
          key={index}
          className='flex flex-col justify-center overflow-x-hidden gap-4 basis-full sm:basis-[calc((100%-3rem)/2)]'
        >
          <p className='text-xs leading-[1.16667] uppercase text-textDisabled tracking-[0.8px]'>
            {section.sectionLabel}
          </p>
          <ul className='flex flex-col gap-4'>
            {section.items.map((item, i) => (
              <li key={i} className='flex'>
                <Link
                  href={item.href}
                  className='flex items-center overflow-x-hidden cursor-pointer gap-2 hover:text-primary focus-visible:text-primary focus-visible:outline-0'
                  onClick={() => setOpen(false)}
                >
                  {item.icon && <i className={classnames(item.icon, 'flex text-xl shrink-0')} />}
                  <p className='text-[15px] leading-[1.4667] truncate'>{item.label}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export default DefaultSuggestions
