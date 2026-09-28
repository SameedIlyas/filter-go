// Component Imports
import ContractDetail from '@views/contracts/detail'

export const metadata = { title: 'Contract' }

const ContractPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params

  return <ContractDetail id={id} />
}

export default ContractPage
