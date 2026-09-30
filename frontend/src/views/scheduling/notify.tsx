// Next Imports
import Link from 'next/link'

// Third-party Imports
import { toast } from 'react-toastify'

import { schedulingError } from './logic/assignmentFlow'
import type { FriendlyError } from './logic/assignmentFlow'

/** An error toast with the server's message and, when there is one, a link to the thing it clashed with. */
export const toastFriendly = ({ message, link }: FriendlyError) =>
  toast.error(
    link ? (
      <span>
        {message}{' '}
        <Link href={link.href} className='font-medium underline'>
          {link.label}
        </Link>
      </span>
    ) : (
      message
    )
  )

export const toastSchedulingError = (error: unknown) => toastFriendly(schedulingError(error))
