// React Imports
import { Suspense } from 'react'

// Component Imports
import Invoices from '@views/invoices'

export const metadata = { title: 'Invoices' }

// Filters, paging and the open invoice live in the URL (useSearchParams), which needs a Suspense boundary
const InvoicesPage = () => (
  <Suspense>
    <Invoices />
  </Suspense>
)

export default InvoicesPage
