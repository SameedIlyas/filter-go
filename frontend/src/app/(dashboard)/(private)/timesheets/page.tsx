// React Imports
import { Suspense } from 'react'

// Component Imports
import Timesheets from '@views/timesheets'

export const metadata = { title: 'Timesheets' }

// The review keeps its tab and filters in the URL (useSearchParams), which needs a Suspense boundary
const TimesheetsPage = () => (
  <Suspense>
    <Timesheets />
  </Suspense>
)

export default TimesheetsPage
