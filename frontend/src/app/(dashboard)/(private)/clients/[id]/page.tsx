// Component Imports
import ClientDetail from '@views/clients/detail'

export const metadata = { title: 'Client' }

const ClientPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params

  return <ClientDetail id={id} />
}

export default ClientPage
