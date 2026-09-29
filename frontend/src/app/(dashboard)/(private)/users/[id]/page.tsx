// Component Imports
import UserDetail from '@views/users/detail'

export const metadata = { title: 'User' }

const UserPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params

  return <UserDetail id={id} />
}

export default UserPage
