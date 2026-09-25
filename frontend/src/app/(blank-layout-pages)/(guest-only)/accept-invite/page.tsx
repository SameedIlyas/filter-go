// Next Imports
import type { Metadata } from 'next'

// Component Imports
import AcceptInvite from '@views/AcceptInvite'

export const metadata: Metadata = {
  title: 'Accept Invitation',
  description: 'Choose a password to activate your account'
}

const AcceptInvitePage = () => {
  return <AcceptInvite />
}

export default AcceptInvitePage
