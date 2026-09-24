// MUI Imports
import { useTheme } from '@mui/material/styles'

// Type Imports
import type { VerticalMenuContextProps } from '@menu/components/vertical-menu/Menu'

// Component Imports
import HorizontalNav, { Menu, SubMenu, MenuItem } from '@menu/horizontal-menu'
import VerticalNavContent from './VerticalNavContent'
import CustomChip from '@core/components/mui/Chip'

// import { GenerateHorizontalMenu } from '@components/GenerateMenu'

// Hook Imports
import useVerticalNav from '@menu/hooks/useVerticalNav'

// Styled Component Imports
import StyledHorizontalNavExpandIcon from '@menu/styles/horizontal/StyledHorizontalNavExpandIcon'
import StyledVerticalNavExpandIcon from '@menu/styles/vertical/StyledVerticalNavExpandIcon'

// Style Imports
import menuItemStyles from '@core/styles/horizontal/menuItemStyles'
import menuRootStyles from '@core/styles/horizontal/menuRootStyles'
import verticalMenuItemStyles from '@core/styles/vertical/menuItemStyles'
import verticalNavigationCustomStyles from '@core/styles/vertical/navigationCustomStyles'
import verticalMenuSectionStyles from '@core/styles/vertical/menuSectionStyles'

// Menu Data Imports
// import menuData from '@/data/navigation/horizontalMenuData'

type RenderExpandIconProps = {
  level?: number
}

type RenderVerticalExpandIconProps = {
  open?: boolean
  transitionDuration?: VerticalMenuContextProps['transitionDuration']
}

const RenderExpandIcon = ({ level }: RenderExpandIconProps) => (
  <StyledHorizontalNavExpandIcon level={level}>
    <i className='bx-chevron-right' />
  </StyledHorizontalNavExpandIcon>
)

const RenderVerticalExpandIcon = ({ open, transitionDuration }: RenderVerticalExpandIconProps) => (
  <StyledVerticalNavExpandIcon open={open} transitionDuration={transitionDuration}>
    <i className='bx-chevron-right' />
  </StyledVerticalNavExpandIcon>
)

const HorizontalMenu = () => {
  // Hooks
  const verticalNavOptions = useVerticalNav()
  const theme = useTheme()

  // Vars
  const { transitionDuration } = verticalNavOptions

  return (
    <HorizontalNav
      switchToVertical
      verticalNavContent={VerticalNavContent}
      verticalNavProps={{
        customStyles: verticalNavigationCustomStyles(verticalNavOptions, theme),
        backgroundColor: 'var(--mui-palette-background-paper)'
      }}
    >
      <Menu
        rootStyles={menuRootStyles(theme)}
        renderExpandIcon={({ level }) => <RenderExpandIcon level={level} />}
        menuItemStyles={menuItemStyles(theme, 'bx-bxs-circle')}
        renderExpandedMenuItemIcon={{ icon: <i className='bx-bxs-circle' /> }}
        popoutMenuOffset={{
          mainAxis: ({ level }) => (level && level > 0 ? 6 : 10),
          alignmentAxis: 0
        }}
        verticalMenuProps={{
          menuItemStyles: verticalMenuItemStyles(verticalNavOptions, theme),
          renderExpandIcon: ({ open }) => (
            <RenderVerticalExpandIcon open={open} transitionDuration={transitionDuration} />
          ),
          renderExpandedMenuItemIcon: { icon: <i className='bx-bxs-circle' /> },
          menuSectionStyles: verticalMenuSectionStyles(verticalNavOptions, theme)
        }}
      >
        <SubMenu label='dashboards' icon={<i className='bx-home-smile' />}>
          <MenuItem href='/dashboards/crm' icon={<i className='bx-doughnut-chart' />}>
            crm
          </MenuItem>
          <MenuItem href='/dashboards/analytics' icon={<i className='bx-bar-chart-alt-2' />}>
            analytics
          </MenuItem>
          <MenuItem href='/dashboards/ecommerce' icon={<i className='bx-cart-alt' />}>
            eCommerce
          </MenuItem>
          <MenuItem href='/dashboards/academy' icon={<i className='bx-book-open' />}>
            academy
          </MenuItem>
          <MenuItem href='/dashboards/logistics' icon={<i className='bx-car' />}>
            logistics
          </MenuItem>
        </SubMenu>
        <SubMenu label='apps' icon={<i className='bx-envelope' />}>
          <SubMenu label='eCommerce' icon={<i className='bx-cart-alt' />}>
            <MenuItem href='/apps/ecommerce/dashboard'>dashboard</MenuItem>
            <SubMenu label='products'>
              <MenuItem href='/apps/ecommerce/products/list'>list</MenuItem>
              <MenuItem href='/apps/ecommerce/products/add'>add</MenuItem>
              <MenuItem href='/apps/ecommerce/products/category'>category</MenuItem>
            </SubMenu>
            <SubMenu label='orders'>
              <MenuItem href='/apps/ecommerce/orders/list'>list</MenuItem>
              <MenuItem
                href='/apps/ecommerce/orders/details/5434'
                exactMatch={false}
                activeUrl='/apps/ecommerce/orders/details'
              >
                details
              </MenuItem>
            </SubMenu>
            <SubMenu label='customers'>
              <MenuItem href='/apps/ecommerce/customers/list'>list</MenuItem>
              <MenuItem
                href='/apps/ecommerce/customers/details/879861'
                exactMatch={false}
                activeUrl='/apps/ecommerce/customers/details'
              >
                details
              </MenuItem>
            </SubMenu>
            <MenuItem href='/apps/ecommerce/manage-reviews'>manageReviews</MenuItem>
            <MenuItem href='/apps/ecommerce/referrals'>referrals</MenuItem>
            <MenuItem href='/apps/ecommerce/settings'>settings</MenuItem>
          </SubMenu>
          <SubMenu label='academy' icon={<i className='bx-book-open' />}>
            <MenuItem href='/apps/academy/dashboard'>dashboard</MenuItem>
            <MenuItem href='/apps/academy/my-courses'>myCourses</MenuItem>
            <MenuItem href='/apps/academy/course-details'>courseDetails</MenuItem>
          </SubMenu>
          <SubMenu label='logistics' icon={<i className='bx-car' />}>
            <MenuItem href='/apps/logistics/dashboard'>dashboard</MenuItem>
            <MenuItem href='/apps/logistics/fleet'>fleet</MenuItem>
          </SubMenu>
          <MenuItem href='/apps/email' icon={<i className='bx-envelope' />} exactMatch={false} activeUrl='/apps/email'>
            email
          </MenuItem>
          <MenuItem href='/apps/chat' icon={<i className='bx-chat' />}>
            chat
          </MenuItem>
          <MenuItem href='/apps/calendar' icon={<i className='bx-calendar' />}>
            calendar
          </MenuItem>
          <MenuItem href='/apps/kanban' icon={<i className='bx-grid' />}>
            kanban
          </MenuItem>
          <SubMenu label='invoice' icon={<i className='bx-food-menu' />}>
            <MenuItem href='/apps/invoice/list'>list</MenuItem>
            <MenuItem href='/apps/invoice/preview/4987' exactMatch={false} activeUrl='/apps/invoice/preview'>
              preview
            </MenuItem>
            <MenuItem href='/apps/invoice/edit/4987' exactMatch={false} activeUrl='/apps/invoice/edit'>
              edit
            </MenuItem>
            <MenuItem href='/apps/invoice/add'>add</MenuItem>
          </SubMenu>
          <SubMenu label='user' icon={<i className='bx-user' />}>
            <MenuItem href='/apps/user/list'>list</MenuItem>
            <MenuItem href='/apps/user/view'>view</MenuItem>
          </SubMenu>
          <SubMenu label='rolesPermissions' icon={<i className='bx-check-shield' />}>
            <MenuItem href='/apps/roles'>roles</MenuItem>
            <MenuItem href='/apps/permissions'>permissions</MenuItem>
          </SubMenu>
        </SubMenu>
        <SubMenu label='pages' icon={<i className='bx-file-blank' />}>
          <MenuItem href='/pages/user-profile' icon={<i className='bx-user-circle' />}>
            userProfile
          </MenuItem>
          <MenuItem href='/pages/account-settings' icon={<i className='bx-cog' />}>
            accountSettings
          </MenuItem>
          <MenuItem href='/pages/faq' icon={<i className='bx-help-circle' />}>
            faq
          </MenuItem>
          <MenuItem href='/pages/pricing' icon={<i className='bx-dollar' />}>
            pricing
          </MenuItem>
          <SubMenu label='miscellaneous' icon={<i className='bx-info-circle' />}>
            <MenuItem href='/pages/misc/coming-soon' target='_blank'>
              comingSoon
            </MenuItem>
            <MenuItem href='/pages/misc/under-maintenance' target='_blank'>
              underMaintenance
            </MenuItem>
            <MenuItem href='/pages/misc/404-not-found' target='_blank'>
              pageNotFound404
            </MenuItem>
            <MenuItem href='/pages/misc/401-not-authorized' target='_blank'>
              notAuthorized401
            </MenuItem>
          </SubMenu>
          <SubMenu label='authPages' icon={<i className='bx-lock-open-alt' />}>
            <SubMenu label='login'>
              <MenuItem href='/pages/auth/login-v1' target='_blank'>
                loginV1
              </MenuItem>
              <MenuItem href='/pages/auth/login-v2' target='_blank'>
                loginV2
              </MenuItem>
            </SubMenu>
            <SubMenu label='register'>
              <MenuItem href='/pages/auth/register-v1' target='_blank'>
                registerV1
              </MenuItem>
              <MenuItem href='/pages/auth/register-v2' target='_blank'>
                registerV2
              </MenuItem>
              <MenuItem href='/pages/auth/register-multi-steps' target='_blank'>
                registerMultiSteps
              </MenuItem>
            </SubMenu>
            <SubMenu label='verifyEmail'>
              <MenuItem href='/pages/auth/verify-email-v1' target='_blank'>
                verifyEmailV1
              </MenuItem>
              <MenuItem href='/pages/auth/verify-email-v2' target='_blank'>
                verifyEmailV2
              </MenuItem>
            </SubMenu>
            <SubMenu label='forgotPassword'>
              <MenuItem href='/pages/auth/forgot-password-v1' target='_blank'>
                forgotPasswordV1
              </MenuItem>
              <MenuItem href='/pages/auth/forgot-password-v2' target='_blank'>
                forgotPasswordV2
              </MenuItem>
            </SubMenu>
            <SubMenu label='resetPassword'>
              <MenuItem href='/pages/auth/reset-password-v1' target='_blank'>
                resetPasswordV1
              </MenuItem>
              <MenuItem href='/pages/auth/reset-password-v2' target='_blank'>
                resetPasswordV2
              </MenuItem>
            </SubMenu>
            <SubMenu label='twoSteps'>
              <MenuItem href='/pages/auth/two-steps-v1' target='_blank'>
                twoStepsV1
              </MenuItem>
              <MenuItem href='/pages/auth/two-steps-v2' target='_blank'>
                twoStepsV2
              </MenuItem>
            </SubMenu>
          </SubMenu>
          <SubMenu label='wizardExamples' icon={<i className='bx-spreadsheet' />}>
            <MenuItem href='/pages/wizard-examples/checkout'>checkout</MenuItem>
            <MenuItem href='/pages/wizard-examples/property-listing'>propertyListing</MenuItem>
            <MenuItem href='/pages/wizard-examples/create-deal'>createDeal</MenuItem>
          </SubMenu>
          <MenuItem href='/pages/dialog-examples' icon={<i className='bx-copy' />}>
            dialogExamples
          </MenuItem>
          <SubMenu label='widgetExamples' icon={<i className='bx-card' />}>
            <MenuItem href='/pages/widget-examples/basic'>basic</MenuItem>
            <MenuItem href='/pages/widget-examples/advanced'>advanced</MenuItem>
            <MenuItem href='/pages/widget-examples/statistics'>statistics</MenuItem>
            <MenuItem href='/pages/widget-examples/charts'>charts</MenuItem>
            <MenuItem href='/pages/widget-examples/gamification'>gamification</MenuItem>
            <MenuItem href='/pages/widget-examples/actions'>actions</MenuItem>
          </SubMenu>
          <SubMenu label='frontPages' icon={<i className='bx-file' />}>
            <MenuItem href='/front-pages/landing-page' target='_blank'>
              landing
            </MenuItem>
            <MenuItem href='/front-pages/pricing' target='_blank'>
              pricing
            </MenuItem>
            <MenuItem href='/front-pages/payment' target='_blank'>
              payment
            </MenuItem>
            <MenuItem href='/front-pages/checkout' target='_blank'>
              checkout
            </MenuItem>
            <MenuItem href='/front-pages/help-center' target='_blank'>
              helpCenter
            </MenuItem>
          </SubMenu>
        </SubMenu>
        <SubMenu label='formsAndTables' icon={<i className='bx-rename' />}>
          <MenuItem href='/forms/form-layouts' icon={<i className='bx-layout' />}>
            formLayouts
          </MenuItem>
          <MenuItem href='/forms/form-validation' icon={<i className='bx-check-square' />}>
            formValidation
          </MenuItem>
          <MenuItem href='/forms/form-wizard' icon={<i className='bx-git-merge' />}>
            formWizard
          </MenuItem>
          <MenuItem href='/react-table' icon={<i className='bx-table' />}>
            reactTable
          </MenuItem>
          <MenuItem
            icon={<i className='bx-rename' />}
            href={`${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/form-elements`}
            suffix={<i className='bx-link-external text-xl' />}
            target='_blank'
          >
            formELements
          </MenuItem>
          <MenuItem
            icon={<i className='bx-columns' />}
            href={`${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/mui-table`}
            suffix={<i className='bx-link-external text-xl' />}
            target='_blank'
          >
            muiTables
          </MenuItem>
        </SubMenu>
        <SubMenu label='charts' icon={<i className='bx-bar-chart-square' />}>
          <MenuItem href='/charts/apex-charts' icon={<i className='bx-line-chart' />}>
            apex
          </MenuItem>
          <MenuItem href='/charts/recharts' icon={<i className='bx-network-chart' />}>
            recharts
          </MenuItem>
        </SubMenu>
        <SubMenu label='others' icon={<i className='bx-dots-horizontal-rounded' />}>
          <MenuItem
            icon={<i className='bx-text' />}
            href={`${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/foundation`}
            suffix={<i className='bx-link-external text-xl' />}
            target='_blank'
          >
            foundation
          </MenuItem>
          <MenuItem
            icon={<i className='bx-atom' />}
            href={`${process.env.NEXT_PUBLIC_DOCS_URL}/docs/user-interface/components`}
            suffix={<i className='bx-link-external text-xl' />}
            target='_blank'
          >
            components
          </MenuItem>
          <MenuItem
            icon={<i className='bx-menu' />}
            href={`${process.env.NEXT_PUBLIC_DOCS_URL}/docs/menu-examples/overview`}
            suffix={<i className='bx-link-external text-xl' />}
            target='_blank'
          >
            menuExamples
          </MenuItem>
          <MenuItem
            icon={<i className='bx-bxs-buoy' />}
            href='/contact'
            suffix={<i className='bx-link-external text-xl' />}
            target='_blank'
          >
            raiseSupport
          </MenuItem>
          <MenuItem
            icon={<i className='bx-book' />}
            href={`${process.env.NEXT_PUBLIC_DOCS_URL}`}
            suffix={<i className='bx-link-external text-xl' />}
            target='_blank'
          >
            documentation
          </MenuItem>
          <MenuItem
            suffix={<CustomChip label='New' size='small' color='info' round='true' />}
            icon={<i className='bx-notification' />}
          >
            itemWithBadge
          </MenuItem>
          <MenuItem
            icon={<i className='bx-link' />}
            href='/'
            target='_blank'
            suffix={<i className='bx-link-external text-xl' />}
          >
            externalLink
          </MenuItem>
          <SubMenu label='menuLevels' icon={<i className='bx-align-left' />}>
            <MenuItem>menuLevel2</MenuItem>
            <SubMenu label='menuLevel2'>
              <MenuItem>menuLevel3</MenuItem>
              <MenuItem>menuLevel3</MenuItem>
            </SubMenu>
          </SubMenu>
          <MenuItem disabled>disabledMenu</MenuItem>
        </SubMenu>
      </Menu>
      {/* <Menu
        rootStyles={menuRootStyles(theme)}
        renderExpandIcon={({ level }) => <RenderExpandIcon level={level} />}
        menuItemStyles={menuItemStyles(theme, 'bx-bxs-circle')}
        renderExpandedMenuItemIcon={{ icon: <i className='bx-bxs-circle' /> }}
        popoutMenuOffset={{
          mainAxis: ({ level }) => (level && level > 0 ? 6 : 10),
          alignmentAxis: 0
        }}
        verticalMenuProps={{
          menuItemStyles: verticalMenuItemStyles(verticalNavOptions, theme),
          renderExpandIcon: ({ open }) => (
            <RenderVerticalExpandIcon open={open} transitionDuration={transitionDuration} />
          ),
          renderExpandedMenuItemIcon: { icon: <i className='bx-bxs-circle' /> },
          menuSectionStyles: verticalMenuSectionStyles(verticalNavOptions, theme)
        }}
      >
        <GenerateHorizontalMenu menuData={menuData()} />
      </Menu> */}
    </HorizontalNav>
  )
}

export default HorizontalMenu
