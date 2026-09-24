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
      <p className='text-textSecondary'>{`© ${new Date().getFullYear()} CoolCraft · Cleaner air, on schedule`}</p>
      {!isBreakpointReached && (
        <div className='flex items-center gap-4'>
          <Link href='/contact' className='text-primary'>
            Book a Visit
          </Link>
          <Link href='/faqs' className='text-primary'>
            FAQs
          </Link>
          <Link href='/about' className='text-primary'>
            Franchise
          </Link>
          <Link href='/contact' className='text-primary'>
            Support
          </Link>
        </div>
      )}
    </div>
  )
}

export default FooterContent
