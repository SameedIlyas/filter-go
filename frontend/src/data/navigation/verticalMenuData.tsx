// Type Imports
import type { VerticalMenuDataType } from '@/types/menuTypes'

const verticalMenuData = (): VerticalMenuDataType[] => [
  // This is how you will normally render submenu
  {
    label: 'dashboards',
    suffix: {
      label: '5',
      color: 'error'
    },
    icon: 'bx-home-smile',
    children: [
      // This is how you will normally render menu item
      {
        label: 'crm',
        href: '/dashboards/crm'
      },
      {
        label: 'analytics',
        href: '/dashboards/analytics'
      },
      {
        label: 'eCommerce',
        href: '/dashboards/ecommerce'
      },
      {
        label: 'academy',
        href: '/dashboards/academy'
      },
      {
        label: 'logistics',
        href: '/dashboards/logistics'
      }
    ]
  },
  {
    label: 'frontPages',
    icon: 'bx-file',
    children: [
      {
        label: 'landing',
        href: '/front-pages/landing-page',
        target: '_blank'
      },
      {
        label: 'pricing',
        href: '/front-pages/pricing',
        target: '_blank'
      },
      {
        label: 'payment',
        href: '/front-pages/payment',
        target: '_blank'
      },
      {
        label: 'checkout',
        href: '/front-pages/checkout',
        target: '_blank'
      },
      {
        label: 'helpCenter',
        href: '/front-pages/help-center',
        target: '_blank'
      }
    ]
  },

  // This is how you will normally render menu section
  {
    label: 'appsPages',
    isSection: true,
    children: [
      {
        label: 'eCommerce',
        icon: 'bx-cart-alt',
        children: [
          {
            label: 'dashboard',
            href: '/apps/ecommerce/dashboard'
          },
          {
            label: 'products',
            children: [
              {
                label: 'list',
                href: '/apps/ecommerce/products/list'
              },
              {
                label: 'add',
                href: '/apps/ecommerce/products/add'
              },
              {
                label: 'category',
                href: '/apps/ecommerce/products/category'
              }
            ]
          },
          {
            label: 'orders',
            children: [
              {
                label: 'list',
                href: '/apps/ecommerce/orders/list'
              },
              {
                label: 'details',
                href: '/apps/ecommerce/orders/details/5434',
                exactMatch: false,
                activeUrl: '/apps/ecommerce/orders/details'
              }
            ]
          },
          {
            label: 'customers',
            children: [
              {
                label: 'list',
                href: '/apps/ecommerce/customers/list'
              },
              {
                label: 'details',
                href: '/apps/ecommerce/customers/details/879861',
                exactMatch: false,
                activeUrl: '/apps/ecommerce/customers/details'
              }
            ]
          },
          {
            label: 'manageReviews',
            href: '/apps/ecommerce/manage-reviews'
          },
          {
            label: 'referrals',
            href: '/apps/ecommerce/referrals'
          },
          {
            label: 'settings',
            href: '/apps/ecommerce/settings'
          }
        ]
      },
      {
        label: 'academy',
        icon: 'bx-book-open',
        children: [
          {
            label: 'dashboard',
            href: '/apps/academy/dashboard'
          },
          {
            label: 'myCourses',
            href: '/apps/academy/my-courses'
          },
          {
            label: 'courseDetails',
            href: '/apps/academy/course-details'
          }
        ]
      },
      {
        label: 'logistics',
        icon: 'bx-car',
        children: [
          {
            label: 'dashboard',
            href: '/apps/logistics/dashboard'
          },
          {
            label: 'fleet',
            href: '/apps/logistics/fleet'
          }
        ]
      },
      {
        label: 'email',
        icon: 'bx-envelope',
        href: '/apps/email',
        exactMatch: false,
        activeUrl: '/apps/email'
      },
      {
        label: 'chat',
        icon: 'bx-chat',
        href: '/apps/chat'
      },
      {
        label: 'calendar',
        icon: 'bx-calendar',
        href: '/apps/calendar'
      },
      {
        label: 'kanban',
        icon: 'bx-grid',
        href: '/apps/kanban'
      },
      {
        label: 'invoice',
        icon: 'bx-food-menu',
        children: [
          {
            label: 'list',
            href: '/apps/invoice/list'
          },
          {
            label: 'preview',
            href: '/apps/invoice/preview/4987',
            exactMatch: false,
            activeUrl: '/apps/invoice/preview'
          },
          {
            label: 'edit',
            href: '/apps/invoice/edit/4987',
            exactMatch: false,
            activeUrl: '/apps/invoice/edit'
          },
          {
            label: 'add',
            href: '/apps/invoice/add'
          }
        ]
      },
      {
        label: 'user',
        icon: 'bx-user',
        children: [
          {
            label: 'list',
            href: '/apps/user/list'
          },
          {
            label: 'view',
            href: '/apps/user/view'
          }
        ]
      },
      {
        label: 'rolesPermissions',
        icon: 'bx-check-shield',
        children: [
          {
            label: 'roles',
            href: '/apps/roles'
          },
          {
            label: 'permissions',
            href: '/apps/permissions'
          }
        ]
      },
      {
        label: 'pages',
        icon: 'bx-dock-top',
        children: [
          {
            label: 'userProfile',
            href: '/pages/user-profile'
          },
          {
            label: 'accountSettings',
            href: '/pages/account-settings'
          },
          {
            label: 'faq',
            href: '/pages/faq'
          },
          {
            label: 'pricing',
            href: '/pages/pricing'
          },
          {
            label: 'miscellaneous',
            children: [
              {
                label: 'comingSoon',
                href: '/pages/misc/coming-soon',
                target: '_blank'
              },
              {
                label: 'underMaintenance',
                href: '/pages/misc/under-maintenance',
                target: '_blank'
              },
              {
                label: 'pageNotFound404',
                href: '/pages/misc/404-not-found',
                target: '_blank'
              },
              {
                label: 'notAuthorized401',
                href: '/pages/misc/401-not-authorized',
                target: '_blank'
              }
            ]
          }
        ]
      },
      {
        label: 'authPages',
        icon: 'bx-lock-open-alt',
        children: [
          {
            label: 'login',
            children: [
              {
                label: 'loginV1',
                href: '/pages/auth/login-v1',
                target: '_blank'
              },
              {
                label: 'loginV2',
                href: '/pages/auth/login-v2',
                target: '_blank'
              }
            ]
          },
          {
            label: 'register',
            children: [
              {
                label: 'registerV1',
                href: '/pages/auth/register-v1',
                target: '_blank'
              },
              {
                label: 'registerV2',
                href: '/pages/auth/register-v2',
                target: '_blank'
              },
              {
                label: 'registerMultiSteps',
                href: '/pages/auth/register-multi-steps',
                target: '_blank'
              }
            ]
          },
          {
            label: 'verifyEmail',
            children: [
              {
                label: 'verifyEmailV1',
                href: '/pages/auth/verify-email-v1',
                target: '_blank'
              },
              {
                label: 'verifyEmailV2',
                href: '/pages/auth/verify-email-v2',
                target: '_blank'
              }
            ]
          },
          {
            label: 'forgotPassword',
            children: [
              {
                label: 'forgotPasswordV1',
                href: '/pages/auth/forgot-password-v1',
                target: '_blank'
              },
              {
                label: 'forgotPasswordV2',
                href: '/pages/auth/forgot-password-v2',
                target: '_blank'
              }
            ]
          },
          {
            label: 'resetPassword',
            children: [
              {
                label: 'resetPasswordV1',
                href: '/pages/auth/reset-password-v1',
                target: '_blank'
              },
              {
                label: 'resetPasswordV2',
                href: '/pages/auth/reset-password-v2',
                target: '_blank'
              }
            ]
          },
          {
            label: 'twoSteps',
            children: [
              {
                label: 'twoStepsV1',
                href: '/pages/auth/two-steps-v1',
                target: '_blank'
              },
              {
                label: 'twoStepsV2',
                href: '/pages/auth/two-steps-v2',
                target: '_blank'
              }
            ]
          }
        ]
      },
      {
        label: 'wizardExamples',
        icon: 'bx-spreadsheet',
        children: [
          {
            label: 'checkout',
            href: '/pages/wizard-examples/checkout'
          },
          {
            label: 'propertyListing',
            href: '/pages/wizard-examples/property-listing'
          },
          {
            label: 'createDeal',
            href: '/pages/wizard-examples/create-deal'
          }
        ]
      },
      {
        label: 'dialogExamples',
        icon: 'bx-copy',
        href: '/pages/dialog-examples'
      },
      {
        label: 'widgetExamples',
        icon: 'bx-card',
        children: [
          {
            label: 'basic',
            href: '/pages/widget-examples/basic'
          },
          {
            label: 'advanced',
            href: '/pages/widget-examples/advanced'
          },
          {
            label: 'statistics',
            href: '/pages/widget-examples/statistics'
          },
          {
            label: 'charts',
            href: '/pages/widget-examples/charts'
          },
          {
            label: 'gamification',
            href: '/pages/widget-examples/gamification'
          },
          {
            label: 'actions',
            href: '/pages/widget-examples/actions'
          }
        ]
      }
    ]
  },
  {
    label: 'formsAndTables',
    isSection: true,
    children: [
      {
        label: 'formLayouts',
        icon: 'bx-layout',
        href: '/forms/form-layouts'
      },
      {
        label: 'formValidation',
        icon: 'bx-check-square',
        href: '/forms/form-validation'
      },
      {
        label: 'formWizard',
        icon: 'bx-git-merge',
        href: '/forms/form-wizard'
      },
      {
        label: 'reactTable',
        icon: 'bx-table',
        href: '/react-table'
      },
      {
        label: 'formELements',
        icon: 'bx-rename',
        suffix: <i className='bx-link-external text-xl' />,
        href: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/form-elements`,
        target: '_blank'
      },
      {
        label: 'muiTables',
        icon: 'bx-columns',
        href: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/mui-table`,
        suffix: <i className='bx-link-external text-xl' />,
        target: '_blank'
      }
    ]
  },
  {
    label: 'chartsMisc',
    isSection: true,
    children: [
      {
        label: 'charts',
        icon: 'bx-bar-chart-square',
        children: [
          {
            label: 'apex',
            href: '/charts/apex-charts'
          },
          {
            label: 'recharts',
            href: '/charts/recharts'
          }
        ]
      },

      {
        label: 'foundation',
        icon: 'bx-text',
        href: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/foundation`,
        suffix: <i className='bx-link-external text-xl' />,
        target: '_blank'
      },
      {
        label: 'components',
        icon: 'bx-atom',
        href: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/components`,
        suffix: <i className='bx-link-external text-xl' />,
        target: '_blank'
      },
      {
        label: 'menuExamples',
        icon: 'bx-menu',
        href: `${process.env.NEXT_PUBLIC_DOCS_URL}/docs/menu-examples/overview`,
        suffix: <i className='bx-link-external text-xl' />,
        target: '_blank'
      },
      {
        label: 'raiseSupport',
        icon: 'bx-bxs-buoy',
        href: 'https://www.filter-go.com/contact/',
        suffix: <i className='bx-link-external text-xl' />,
        target: '_blank'
      },
      {
        label: 'documentation',
        icon: 'bx-book',
        href: `${process.env.NEXT_PUBLIC_DOCS_URL}`,
        suffix: <i className='bx-link-external text-xl' />,
        target: '_blank'
      },
      {
        label: 'others',
        icon: 'bx-dots-vertical-rounded',
        children: [
          {
            suffix: {
              label: 'New',
              color: 'info'
            },
            label: 'itemWithBadge'
          },
          {
            label: 'externalLink',
            href: 'https://www.filter-go.com/',
            target: '_blank',
            suffix: <i className='bx-link-external text-xl' />
          },
          {
            label: 'menuLevels',
            children: [
              {
                label: 'menuLevel2'
              },
              {
                label: 'menuLevel2',
                children: [
                  {
                    label: 'menuLevel3'
                  },
                  {
                    label: 'menuLevel3'
                  }
                ]
              }
            ]
          },
          {
            label: 'disabledMenu',
            disabled: true
          }
        ]
      }
    ]
  }
]

export default verticalMenuData
