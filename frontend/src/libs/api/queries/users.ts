// Third-party Imports
import { keepPreviousData, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// Type Imports
import type { Site } from '@/types/contractTypes'
import type {
  Availability,
  AvailabilityWindow,
  DocumentInput,
  InviteUserInput,
  Role,
  UpdateUserInput,
  User,
  UserCompliance,
  UserDocument,
  UserFilters,
  UserList,
  UserSites,
  UserStatus
} from '@/types/userTypes'

// Lib Imports
import { queryKeys } from '@/libs/react-query/query-keys'

import { bff } from '../bff'

export const USER_ROLES: Role[] = ['ADMIN', 'SUPERVISOR', 'FIELD_USER', 'CLIENT_USER']
export const USER_STATUSES: UserStatus[] = ['ACTIVE', 'INVITED', 'DISABLED']

// ---- queries --------------------------------------------------------------------

/** The people directory (`GET /users`): ADMIN sees the whole organization, SUPERVISOR only people sharing a site. */
export const userListQueryOptions = (filters: UserFilters) =>
  queryOptions({
    queryKey: queryKeys.users.list(filters),
    queryFn: async ({ signal }): Promise<UserList> => {
      const { data, meta } = await bff<{ users: User[] }>('users', { query: filters, signal })

      return {
        users: data.users,
        meta: meta ?? { page: 1, limit: data.users.length, total: data.users.length, totalPages: 1 }
      }
    },
    placeholderData: keepPreviousData
  })

export const useUsersQuery = (filters: UserFilters) => useQuery(userListQueryOptions(filters))

/** Totals per role and per status, for the stat cards. One `limit: 1` request each; only `meta.total` is read. */
export const useUserCounts = (filters: Pick<UserFilters, 'q'> = {}) =>
  useQuery({
    queryKey: queryKeys.users.counts(filters),
    queryFn: async ({ signal }) => {
      const total = async (query: Partial<UserFilters>) =>
        (await bff<{ users: User[] }>('users', { query: { ...filters, ...query, limit: 1 }, signal })).meta?.total ?? 0

      const [all, roles, statuses] = await Promise.all([
        total({}),
        Promise.all(USER_ROLES.map(async role => [role, await total({ role })] as const)),
        Promise.all(USER_STATUSES.map(async status => [status, await total({ status })] as const))
      ])

      return {
        total: all,
        byRole: Object.fromEntries(roles) as Record<Role, number>,
        byStatus: Object.fromEntries(statuses) as Record<UserStatus, number>
      }
    },
    placeholderData: keepPreviousData
  })

export const useUserQuery = (id: string) =>
  useQuery({
    queryKey: queryKeys.users.detail(id),
    queryFn: async ({ signal }) => (await bff<{ user: User }>(`users/${id}`, { signal })).data.user
  })

export const useUserAvailability = (id: string) =>
  useQuery({
    queryKey: queryKeys.users.availability(id),
    queryFn: async ({ signal }) => (await bff<Availability>(`users/${id}/availability`, { signal })).data
  })

export const useUserSites = (id: string) =>
  useQuery({
    queryKey: queryKeys.users.sites(id),
    queryFn: async ({ signal }) => (await bff<UserSites>(`users/${id}/sites`, { signal })).data
  })

export const useUserCompliance = (id: string) =>
  useQuery({
    queryKey: queryKeys.users.compliance(id),
    queryFn: async ({ signal }) => (await bff<UserCompliance>(`users/${id}/compliance`, { signal })).data
  })

/** Every active site in the organization, for the site-access picker (admins only). */
export const useSiteOptions = (enabled = true) =>
  useQuery({
    queryKey: queryKeys.users.allSites(),
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) =>
      (await bff<{ sites: Site[] }>('sites', { query: { active: 'true', limit: 100 }, signal })).data.sites
  })

// ---- mutations ------------------------------------------------------------------

const useUserInvalidation = () => {
  const queryClient = useQueryClient()

  return (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.users.lists() })
    void queryClient.invalidateQueries({ queryKey: queryKeys.users.allCounts() })
    if (id) void queryClient.invalidateQueries({ queryKey: queryKeys.users.one(id) })
  }
}

/** `POST /admin/users/invite`. Re-inviting someone who never set a password re-sends the link. */
export const useInviteUser = () => {
  const invalidate = useUserInvalidation()

  return useMutation({
    mutationFn: async (input: InviteUserInput) =>
      (await bff<{ user: User; emailSent: boolean }>('admin/users/invite', { method: 'POST', body: input })).data,
    onSuccess: ({ user }) => invalidate(user.id)
  })
}

export const useUpdateUser = (id: string) => {
  const invalidate = useUserInvalidation()

  return useMutation({
    mutationFn: async (input: UpdateUserInput) =>
      (await bff<{ user: User }>(`admin/users/${id}`, { method: 'PATCH', body: input })).data.user,
    onSuccess: () => invalidate(id)
  })
}

export const useRevokeUserSessions = (id: string) =>
  useMutation({
    mutationFn: async () =>
      (await bff<{ revoked: number }>(`admin/users/${id}/revoke-sessions`, { method: 'POST' })).data.revoked
  })

export const useSaveAvailability = (id: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (windows: AvailabilityWindow[]) =>
      (
        await bff<Availability>(`users/${id}/availability`, {
          method: 'PUT',
          body: { windows: windows.map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime })) }
        })
      ).data,
    onSuccess: data => queryClient.setQueryData(queryKeys.users.availability(id), data)
  })
}

export const useSaveUserSites = (id: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (siteIds: string[]) =>
      (await bff<UserSites>(`users/${id}/sites`, { method: 'PUT', body: { siteIds } })).data,
    onSuccess: data => queryClient.setQueryData(queryKeys.users.sites(id), data)
  })
}

const useDocumentInvalidation = (userId: string) => {
  const queryClient = useQueryClient()

  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.users.documents(userId) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.users.compliance(userId) })
  }
}

export const useSaveDocument = (userId: string) => {
  const invalidate = useDocumentInvalidation(userId)

  return useMutation({
    mutationFn: async ({ documentId, input }: { documentId?: string; input: DocumentInput }) =>
      (
        await bff<{ document: UserDocument }>(
          documentId ? `users/${userId}/documents/${documentId}` : `users/${userId}/documents`,
          { method: documentId ? 'PATCH' : 'POST', body: input }
        )
      ).data.document,
    onSuccess: () => invalidate()
  })
}

export const useDeleteDocument = (userId: string) => {
  const invalidate = useDocumentInvalidation(userId)

  return useMutation({
    mutationFn: async (documentId: string) => bff(`users/${userId}/documents/${documentId}`, { method: 'DELETE' }),
    onSuccess: () => invalidate()
  })
}
