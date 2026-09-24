type SearchData = {
  id: string
  name: string
  url: string

  icon: string
  section: string
  shortcut?: string
}

const data: SearchData[] = [
  {
    id: '1',
    name: 'CRM Dashboard',
    url: '/dashboards/crm',
    icon: 'bx-doughnut-chart',
    section: 'Dashboards'
  },
  {
    id: '2',
    name: 'Analytics Dashboard',
    url: '/dashboards/analytics',
    icon: 'bx-bar-chart-alt-2',
    section: 'Dashboards'
  },
  {
    id: '3',
    name: 'eCommerce Dashboard',
    url: '/dashboards/ecommerce',
    icon: 'bx-cart',
    section: 'Dashboards'
  },
  {
    id: '4',
    name: 'Academy Dashboard',
    url: '/dashboards/academy',
    icon: 'bx-book-open',
    section: 'Dashboards'
  },
  {
    id: '5',
    name: 'Logistics Dashboard',
    url: '/dashboards/logistics',
    icon: 'bx-car',
    section: 'Dashboards'
  },
  {
    id: '6',
    name: 'Landing Front',
    url: '/front-pages/landing-page',

    icon: 'bx-file',
    section: 'Front Pages'
  },
  {
    id: '7',
    name: 'Pricing Front',
    url: '/front-pages/pricing',

    icon: 'bx-dollar-circle',
    section: 'Front Pages'
  },
  {
    id: '8',
    name: 'Payment Front',
    url: '/front-pages/payment',

    icon: 'bx-credit-card-front',
    section: 'Front Pages'
  },
  {
    id: '9',
    name: 'Checkout Front',
    url: '/front-pages/checkout',

    icon: 'bx-cart-alt',
    section: 'Front Pages'
  },
  {
    id: '10',
    name: 'Help Center Front',
    url: '/front-pages/help-center',

    icon: 'bx-help-circle',
    section: 'Front Pages'
  },
  {
    id: '11',
    name: 'eCommerce - Dashboard',
    url: '/apps/ecommerce/dashboard',
    icon: 'bx-cart',
    section: 'Apps'
  },
  {
    id: '12',
    name: 'eCommerce - Product List',
    url: '/apps/ecommerce/products/list',
    icon: 'bx-list-ul',
    section: 'Apps'
  },
  {
    id: '13',
    name: 'eCommerce - Add New Product',
    url: '/apps/ecommerce/products/add',
    icon: 'bx-plus-circle',
    section: 'Apps'
  },
  {
    id: '14',
    name: 'eCommerce - Product Category',
    url: '/apps/ecommerce/products/category',
    icon: 'bx-category-alt',
    section: 'Apps'
  },
  {
    id: '15',
    name: 'eCommerce - Order List',
    url: '/apps/ecommerce/orders/list',
    icon: 'bx-list-ul',
    section: 'Apps'
  },
  {
    id: '16',
    name: 'eCommerce - Order Details',
    url: '/apps/ecommerce/orders/details/5434',
    icon: 'bx-detail',
    section: 'Apps'
  },
  {
    id: '17',
    name: 'eCommerce - Customer List',
    url: '/apps/ecommerce/customers/list',
    icon: 'bx-user',
    section: 'Apps'
  },
  {
    id: '18',
    name: 'eCommerce - Customer Details',
    url: '/apps/ecommerce/customers/details/879861',
    icon: 'bx-spreadsheet',
    section: 'Apps'
  },
  {
    id: '19',
    name: 'eCommerce - Manage Reviews',
    url: '/apps/ecommerce/manage-reviews',
    icon: 'bx-bxs-quote-alt-right',
    section: 'Apps'
  },
  {
    id: '20',
    name: 'eCommerce - Referrals',
    url: '/apps/ecommerce/referrals',
    icon: 'bx-group',
    section: 'Apps'
  },
  {
    id: '21',
    name: 'eCommerce - Settings',
    url: '/apps/ecommerce/settings',
    icon: 'bx-cog',
    section: 'Apps'
  },
  {
    id: '22',
    name: 'Academy - Dashboard',
    url: '/apps/academy/dashboard',
    icon: 'bx-book-open',
    section: 'Apps'
  },
  {
    id: '23',
    name: 'Academy - My Courses',
    url: '/apps/academy/my-courses',
    icon: 'bx-list-ul',
    section: 'Apps'
  },
  {
    id: '24',
    name: 'Academy - Course Details',
    url: '/apps/academy/course-details',
    icon: 'bx-play-circle',
    section: 'Apps'
  },
  {
    id: '25',
    name: 'Logistics - Dashboard',
    url: '/apps/logistics/dashboard',
    icon: 'bx-car',
    section: 'Apps'
  },
  {
    id: '26',
    name: 'Logistics - Fleet',
    url: '/apps/logistics/fleet',
    icon: 'bx-taxi',
    section: 'Apps'
  },
  {
    id: '27',
    name: 'Email',
    url: '/apps/email',
    icon: 'bx-envelope',
    section: 'Apps'
  },
  {
    id: '28',
    name: 'Chat',
    url: '/apps/chat',
    icon: 'bx-chat',
    section: 'Apps'
  },
  {
    id: '29',
    name: 'Calendar',
    url: '/apps/calendar',
    icon: 'bx-calendar',
    section: 'Apps'
  },
  {
    id: '30',
    name: 'Kanban',
    url: '/apps/kanban',
    icon: 'bx-grid',
    section: 'Apps'
  },
  {
    id: '31',
    name: 'Invoice List',
    url: '/apps/invoice/list',
    icon: 'bx-receipt',
    section: 'Apps'
  },
  {
    id: '32',
    name: 'Invoice Preview',
    url: '/apps/invoice/preview/4987',
    icon: 'bx-file',
    section: 'Apps'
  },
  {
    id: '33',
    name: 'Invoice Edit',
    url: '/apps/invoice/edit/4987',
    icon: 'bx-edit',
    section: 'Apps'
  },
  {
    id: '34',
    name: 'Invoice Add',
    url: '/apps/invoice/add',
    icon: 'bx-bxs-file-plus',
    section: 'Apps'
  },
  {
    id: '35',
    name: 'User List',
    url: '/apps/user/list',
    icon: 'bx-group',
    section: 'Apps'
  },
  {
    id: '36',
    name: 'User View',
    url: '/apps/user/view',
    icon: 'bx-news',
    section: 'Apps'
  },
  {
    id: '37',
    name: 'Roles',
    url: '/apps/roles',
    icon: 'bx-check-shield',
    section: 'Apps'
  },
  {
    id: '38',
    name: 'Permissions',
    url: '/apps/permissions',
    icon: 'bx-check-shield',
    section: 'Apps'
  },
  {
    id: '39',
    name: 'User Profile',
    url: '/pages/user-profile',
    icon: 'bx-user-circle',
    section: 'Pages'
  },
  {
    id: '40',
    name: 'Account Settings',
    url: '/pages/account-settings',
    icon: 'bx-user-circle',
    section: 'Pages'
  },
  {
    id: '41',
    name: 'FAQ',
    url: '/pages/faq',
    icon: 'bx-help-circle',
    section: 'Pages'
  },
  {
    id: '42',
    name: 'Pricing',
    url: '/pages/pricing',
    icon: 'bx-dollar',
    section: 'Pages'
  },
  {
    id: '43',
    name: 'Coming Soon',
    url: '/pages/misc/coming-soon',
    icon: 'bx-time',
    section: 'Pages'
  },
  {
    id: '44',
    name: 'Under Maintenance',
    url: '/pages/misc/under-maintenance',
    icon: 'bx-first-aid',
    section: 'Pages'
  },
  {
    id: '45',
    name: 'Page Not Found - 404',
    url: '/pages/misc/404-not-found',
    icon: 'bx-error-circle',
    section: 'Pages'
  },
  {
    id: '46',
    name: 'Not Authorized - 401',
    url: '/pages/misc/401-not-authorized',
    icon: 'bx-user-x',
    section: 'Pages'
  },
  {
    id: '47',
    name: 'Login V1',
    url: '/pages/auth/login-v1',
    icon: 'bx-log-in',
    section: 'Pages'
  },
  {
    id: '48',
    name: 'Login V2',
    url: '/pages/auth/login-v2',
    icon: 'bx-log-in',
    section: 'Pages'
  },
  {
    id: '49',
    name: 'Register V1',
    url: '/pages/auth/register-v1',
    icon: 'bx-user-plus',
    section: 'Pages'
  },
  {
    id: '50',
    name: 'Register V2',
    url: '/pages/auth/register-v2',
    icon: 'bx-user-plus',
    section: 'Pages'
  },
  {
    id: '51',
    name: 'Register Multi-Steps',
    url: '/pages/auth/register-multi-steps',
    icon: 'bx-user-plus',
    section: 'Pages'
  },
  {
    id: '52',
    name: 'Forgot Password V1',
    url: '/pages/auth/forgot-password-v1',
    icon: 'bx-lock',
    section: 'Pages'
  },
  {
    id: '53',
    name: 'Forgot Password V2',
    url: '/pages/auth/forgot-password-v2',
    icon: 'bx-lock',
    section: 'Pages'
  },
  {
    id: '54',
    name: 'Reset Password V1',
    url: '/pages/auth/reset-password-v1',
    icon: 'bx-help-circle',
    section: 'Pages'
  },
  {
    id: '55',
    name: 'Reset Password V2',
    url: '/pages/auth/reset-password-v2',
    icon: 'bx-help-circle',
    section: 'Pages'
  },
  {
    id: '56',
    name: 'Verify Email V1',
    url: '/pages/auth/verify-email-v1',
    icon: 'bx-envelope',
    section: 'Pages'
  },
  {
    id: '57',
    name: 'Verify Email V2',
    url: '/pages/auth/verify-email-v2',
    icon: 'bx-envelope',
    section: 'Pages'
  },
  {
    id: '58',
    name: 'Two Steps V1',
    url: '/pages/auth/two-steps-v1',
    icon: 'bx-devices',
    section: 'Pages'
  },
  {
    id: '59',
    name: 'Two Steps V2',
    url: '/pages/auth/two-steps-v2',
    icon: 'bx-devices',
    section: 'Pages'
  },
  {
    id: '60',
    name: 'Wizard - Checkout',
    url: '/pages/wizard-examples/checkout',
    icon: 'bx-cart-alt',
    section: 'Pages'
  },
  {
    id: '61',
    name: 'Wizard - Property Listing',
    url: '/pages/wizard-examples/property-listing',
    icon: 'bx-building-house',
    section: 'Pages'
  },
  {
    id: '62',
    name: 'Wizard - Create Deal',
    url: '/pages/wizard-examples/create-deal',
    icon: 'bx-gift',
    section: 'Pages'
  },
  {
    id: '63',
    name: 'Dialog Examples',
    url: '/pages/dialog-examples',
    icon: 'bx-copy',
    section: 'Pages'
  },
  {
    id: '64',
    name: 'Widget - Basic',
    url: '/pages/widget-examples/basic',
    icon: 'bx-credit-card-front',
    section: 'Pages'
  },
  {
    id: '65',
    name: 'Widget - Advanced',
    url: '/pages/widget-examples/advanced',
    icon: 'bx-news',
    section: 'Pages'
  },
  {
    id: '66',
    name: 'Widget - Statistics',
    url: '/pages/widget-examples/statistics',
    icon: 'bx-bar-chart-square',
    section: 'Pages'
  },
  {
    id: '67',
    name: 'Widget - Charts',
    url: '/pages/widget-examples/charts',
    icon: 'bx-bar-chart-alt-2',
    section: 'Pages'
  },
  {
    id: '68',
    name: 'Widget - Gamification',
    url: '/pages/widget-examples/gamification',
    icon: 'bx-collection',
    section: 'Pages'
  },
  {
    id: '69',
    name: 'Widget - Actions',
    url: '/pages/widget-examples/actions',
    icon: 'bx-mouse',
    section: 'Pages'
  },
  {
    id: '70',
    name: 'Form Layouts',
    url: '/forms/form-layouts',
    icon: 'bx-layout',
    section: 'Forms & Tables'
  },
  {
    id: '71',
    name: 'Form Validation',
    url: '/forms/form-validation',
    icon: 'bx-task',
    section: 'Forms & Tables'
  },
  {
    id: '72',
    name: 'Form Wizard',
    url: '/forms/form-wizard',
    icon: 'bx-git-merge',
    section: 'Forms & Tables'
  },
  {
    id: '73',
    name: 'React Table',
    url: '/react-table',
    icon: 'bx-table',
    section: 'Forms & Tables'
  },
  {
    id: '74',
    name: 'Apex Charts',
    url: '/charts/apex-charts',
    icon: 'bx-line-chart',
    section: 'Charts'
  },
  {
    id: '75',
    name: 'Recharts',
    url: '/charts/recharts',
    icon: 'bx-network-chart',
    section: 'Charts'
  },
  {
    id: '76',
    name: 'Menu Examples',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/menu-examples/overview`,
    icon: 'bx-list-plus',
    section: 'Others'
  },
  {
    id: '77',
    name: 'Typography',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/foundation/typography`,
    icon: 'bx-font',
    section: 'Foundation'
  },
  {
    id: '78',
    name: 'Colors',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/foundation/colors`,
    icon: 'bx-palette',
    section: 'Foundation'
  },
  {
    id: '79',
    name: 'Shadows',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/foundation/shadows`,
    icon: 'bx-tone',
    section: 'Foundation'
  },
  {
    id: '80',
    name: 'Icons',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/foundation/icons`,
    icon: 'bx-category-alt',
    section: 'Foundation'
  },
  {
    id: '81',
    name: 'Accordion',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/components/accordion`,
    icon: 'bx-vertical-center',
    section: 'Components'
  },
  {
    id: '82',
    name: 'Alerts',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/components/alerts`,
    icon: 'bx-error',
    section: 'Components'
  },
  {
    id: '83',
    name: 'Avatars',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/components/avatars`,
    icon: 'bx-user-circle',
    section: 'Components'
  },
  {
    id: '84',
    name: 'Badges',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/components/badges`,
    icon: 'bx-badge',
    section: 'Components'
  },
  {
    id: '85',
    name: 'Buttons',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/components/buttons`,
    icon: 'bx-download',
    section: 'Components'
  },
  {
    id: '86',
    name: 'Button Group',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/components/button-group`,
    icon: 'bx-copy',
    section: 'Components'
  },
  {
    id: '87',
    name: 'Chips',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/components/chips`,
    icon: 'bx-square-rounded',
    section: 'Components'
  },
  {
    id: '88',
    name: 'Dialogs',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/components/dialogs`,
    icon: 'bx-card',
    section: 'Components'
  },
  {
    id: '89',
    name: 'List',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/components/list`,
    icon: 'bx-list-ul',
    section: 'Components'
  },
  {
    id: '90',
    name: 'Menu',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/components/menu`,
    icon: 'bx-menu',
    section: 'Components'
  },
  {
    id: '91',
    name: 'Pagination',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/components/pagination`,
    icon: 'bx-last-page',
    section: 'Components'
  },
  {
    id: '92',
    name: 'Progress',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/components/progress`,
    icon: 'bx-loader-alt',
    section: 'Components'
  },
  {
    id: '93',
    name: 'Ratings',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/components/ratings`,
    icon: 'bx-star',
    section: 'Components'
  },
  {
    id: '94',
    name: 'Snackbar',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/components/snackbar`,
    icon: 'bx-message-dots',
    section: 'Components'
  },
  {
    id: '95',
    name: 'Swiper',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/components/swiper`,
    icon: 'bx-image',
    section: 'Components'
  },
  {
    id: '96',
    name: 'Tabs',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/components/tabs`,
    icon: 'bx-window-alt',
    section: 'Components'
  },
  {
    id: '97',
    name: 'Timeline',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/components/timeline`,
    icon: 'bx-stats',
    section: 'Components'
  },
  {
    id: '98',
    name: 'Toasts',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/components/toasts`,
    icon: 'bx-bell',
    section: 'Components'
  },
  {
    id: '99',
    name: 'More Components',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/components/more`,
    icon: 'bx-border-all',
    section: 'Components'
  },
  {
    id: '100',
    name: 'Text Field',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/form-elements/text-field`,
    icon: 'bx-rename',
    section: 'Forms & Tables'
  },
  {
    id: '101',
    name: 'Select',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/form-elements/select`,
    icon: 'bx-list-check',
    section: 'Forms & Tables'
  },
  {
    id: '102',
    name: 'Checkbox',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/form-elements/checkbox`,
    icon: 'bx-check-square',
    section: 'Forms & Tables'
  },
  {
    id: '103',
    name: 'Radio',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/form-elements/radio`,
    icon: 'bx-radio-circle-marked',
    section: 'Forms & Tables'
  },
  {
    id: '104',
    name: 'Custom Inputs',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/form-elements/custom-inputs`,
    icon: 'bx-detail',
    section: 'Forms & Tables'
  },
  {
    id: '105',
    name: 'Textarea',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/form-elements/textarea`,
    icon: 'bx-note',
    section: 'Forms & Tables'
  },
  {
    id: '106',
    name: 'Autocomplete',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/form-elements/autocomplete`,
    icon: 'bx-align-left',
    section: 'Forms & Tables'
  },
  {
    id: '107',
    name: 'Date & Time Pickers',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/form-elements/pickers`,
    icon: 'bx-calendar',
    section: 'Forms & Tables'
  },
  {
    id: '108',
    name: 'Switch',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/form-elements/switch`,
    icon: 'bx-toggle-left',
    section: 'Forms & Tables'
  },
  {
    id: '109',
    name: 'File Uploader',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/form-elements/file-uploader`,
    icon: 'bx-upload',
    section: 'Forms & Tables'
  },
  {
    id: '110',
    name: 'Editor',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/form-elements/editor`,
    icon: 'bx-edit',
    section: 'Forms & Tables'
  },
  {
    id: '111',
    name: 'Slider',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/form-elements/slider`,
    icon: 'bx-slider',
    section: 'Forms & Tables'
  },
  {
    id: '112',
    name: 'MUI Tables',
    url: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/mui-table`,
    icon: 'bx-columns',
    section: 'Forms & Tables'
  }
]

export default data
