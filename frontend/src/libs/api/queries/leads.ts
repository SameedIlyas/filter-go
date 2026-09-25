// Third-party Imports
import { keepPreviousData, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// Type Imports
import type { User } from '@/types/api'
import type {
  ConvertLeadInput,
  ConvertLeadResult,
  CreateLeadInput,
  Lead,
  LeadActivity,
  LeadActivityType,
  LeadDetail,
  LeadFilters,
  LeadList,
  LeadStatus,
  LeadSurvey,
  OwnerOption,
  SurveyInput,
  UpdateLeadInput
} from '@/types/leadTypes'

// Lib Imports
import { queryKeys } from '@/libs/react-query/query-keys'

import { bff } from '../bff'

export const LEAD_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST']

// ---- queries --------------------------------------------------------------------

export const leadListQueryOptions = (filters: LeadFilters) =>
  queryOptions({
    queryKey: queryKeys.leads.list(filters),
    queryFn: async ({ signal }): Promise<LeadList> => {
      const { data, meta } = await bff<{ leads: Lead[] }>('leads', { query: filters, signal })

      return { leads: data.leads, meta: meta ?? { page: 1, limit: data.leads.length, total: data.leads.length, totalPages: 1 } }
    },
    placeholderData: keepPreviousData
  })

export const useLeadsQuery = (filters: LeadFilters) => useQuery(leadListQueryOptions(filters))

/** Totals per status, for the stat cards and tab badges. One tiny request per status. */
export const useLeadStatusCounts = (filters: Omit<LeadFilters, 'status' | 'page' | 'limit'>) =>
  useQuery({
    queryKey: queryKeys.leads.counts(filters),
    queryFn: async ({ signal }) => {
      const totals = await Promise.all(
        LEAD_STATUSES.map(async status => {
          const { meta } = await bff<{ leads: Lead[] }>('leads', { query: { ...filters, status, limit: 1 }, signal })

          return [status, meta?.total ?? 0] as const
        })
      )

      return Object.fromEntries(totals) as Record<LeadStatus, number>
    }
  })

export const useLeadQuery = (id: string) =>
  useQuery({
    queryKey: queryKeys.leads.detail(id),
    queryFn: async ({ signal }) => (await bff<LeadDetail>(`leads/${id}`, { signal })).data
  })

export const useLeadActivities = (id: string, limit: number) =>
  useQuery({
    queryKey: queryKeys.leads.activities(id, limit),
    queryFn: async ({ signal }) => {
      const { data, meta } = await bff<{ activities: LeadActivity[] }>(`leads/${id}/activities`, { query: { limit }, signal })

      return { activities: data.activities, total: meta?.total ?? data.activities.length }
    },
    placeholderData: keepPreviousData
  })

/** Active admins and supervisors: the people a lead can be assigned to. */
export const useLeadOwners = () =>
  useQuery({
    queryKey: queryKeys.leads.owners(),
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }): Promise<OwnerOption[]> => {
      const fetchRole = async (role: string) =>
        (await bff<{ users: User[] }>('users', { query: { role, status: 'ACTIVE', limit: 100 }, signal })).data.users

      const users = (await Promise.all([fetchRole('ADMIN'), fetchRole('SUPERVISOR')])).flat()

      return users
        .map(user => ({ id: user.id, name: user.name, email: user.email, role: user.role }))
        .sort((a, b) => a.name.localeCompare(b.name))
    }
  })

// ---- mutations ------------------------------------------------------------------

const useLeadInvalidation = () => {
  const queryClient = useQueryClient()

  return (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.leads.lists() })
    void queryClient.invalidateQueries({ queryKey: queryKeys.leads.allCounts() })
    if (id) void queryClient.invalidateQueries({ queryKey: queryKeys.leads.one(id) })
  }
}

export const useCreateLead = () => {
  const invalidate = useLeadInvalidation()

  return useMutation({
    mutationFn: async (input: CreateLeadInput) => (await bff<{ lead: Lead }>('leads', { method: 'POST', body: input })).data.lead,
    onSuccess: () => invalidate()
  })
}

export const useUpdateLead = (id: string) => {
  const invalidate = useLeadInvalidation()

  return useMutation({
    mutationFn: async (input: UpdateLeadInput) =>
      (await bff<{ lead: Lead }>(`leads/${id}`, { method: 'PATCH', body: input })).data.lead,
    onSuccess: () => invalidate(id)
  })
}

export const useChangeLeadStatus = () => {
  const invalidate = useLeadInvalidation()

  return useMutation({
    mutationFn: async ({ id, status, lostReason }: { id: string; status: LeadStatus; lostReason?: string }) =>
      (await bff<{ lead: Lead }>(`leads/${id}/status`, { method: 'POST', body: { status, ...(lostReason ? { lostReason } : {}) } }))
        .data.lead,
    onSuccess: lead => invalidate(lead.id)
  })
}

export const useAddLeadActivity = (id: string) => {
  const invalidate = useLeadInvalidation()

  return useMutation({
    mutationFn: async (input: { type: LeadActivityType; body: string }) =>
      (await bff<{ activity: LeadActivity; lead: Lead }>(`leads/${id}/activities`, { method: 'POST', body: input })).data,
    onSuccess: () => invalidate(id)
  })
}

export const useSaveSurvey = (leadId: string) => {
  const invalidate = useLeadInvalidation()

  return useMutation({
    mutationFn: async ({ surveyId, input }: { surveyId?: string; input: SurveyInput }) =>
      (
        await bff<{ survey: LeadSurvey }>(surveyId ? `leads/${leadId}/surveys/${surveyId}` : `leads/${leadId}/surveys`, {
          method: surveyId ? 'PUT' : 'POST',
          body: input
        })
      ).data.survey,
    onSuccess: () => invalidate(leadId)
  })
}

export const useDeleteSurvey = (leadId: string) => {
  const invalidate = useLeadInvalidation()

  return useMutation({
    mutationFn: async (surveyId: string) => bff(`leads/${leadId}/surveys/${surveyId}`, { method: 'DELETE' }),
    onSuccess: () => invalidate(leadId)
  })
}

export const useConvertLead = (id: string) => {
  const invalidate = useLeadInvalidation()

  return useMutation({
    mutationFn: async (input: ConvertLeadInput) =>
      (await bff<ConvertLeadResult>(`leads/${id}/convert`, { method: 'POST', body: input })).data,
    onSuccess: () => invalidate(id)
  })
}
