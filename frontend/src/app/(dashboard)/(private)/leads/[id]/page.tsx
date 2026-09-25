// Component Imports
import LeadDetail from '@views/leads/detail'

export const metadata = { title: 'Lead' }

const LeadPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params

  return <LeadDetail id={id} />
}

export default LeadPage
