// Component Imports
import ScheduleDetail from '@views/scheduling/detail'

export const metadata = { title: 'Schedule' }

const SchedulePage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params

  return <ScheduleDetail id={id} />
}

export default SchedulePage
