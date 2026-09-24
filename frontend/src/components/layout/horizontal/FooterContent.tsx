'use client'

// Next Imports
import Link from 'next/link'

// Third-party Imports
import classnames from 'classnames'

// Hook Imports
import useHorizontalNav from '@menu/hooks/useHorizontalNav'

// Util Imports
import { horizontalLayoutClasses } from '@layouts/utils/layoutClasses'

const FooterContent = () => {
  // Hooks
  const { isBreakpointReached } = useHorizontalNav()

  return (
    <div
      className={classnames(horizontalLayoutClasses.footerContent, 'flex items-center justify-between flex-wrap gap-4')}
    >
      <p className='text-textSecondary'>{`© ${new Date().getFullYear()} FilterGO · Fresh Air Delivered`}</p>
      {!isBreakpointReached && (
        <div className='flex items-center gap-4'>
          <Link href='https://www.filter-go.com/schedule-appointment/' target='_blank' className='text-primary'>
            Book a Visit
          </Link>
          <Link href='https://www.filter-go.com/faqs/' target='_blank' className='text-primary'>
            FAQs
          </Link>
          <Link href='https://www.filter-go.com/franchise-opportunity/' target='_blank' className='text-primary'>
            Franchise
          </Link>
          <Link href='https://www.filter-go.com/contact/' target='_blank' className='text-primary'>
            Support
          </Link>
        </div>
      )}
    </div>
  )
}

export default FooterContent
