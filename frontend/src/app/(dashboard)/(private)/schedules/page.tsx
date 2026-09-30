// React Imports
import { Suspense } from 'react'

// Component Imports
import ShiftBoard from '@views/scheduling/board/ShiftBoard'

export const metadata = { title: 'Schedules' }

// The board keeps its state in the URL (useSearchParams), which needs a Suspense boundary
const SchedulesPage = () => (
  <Suspense>
    <ShiftBoard />
  </Suspense>
)

export default SchedulesPage
