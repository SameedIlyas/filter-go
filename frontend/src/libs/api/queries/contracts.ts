// Third-party Imports
import { keepPreviousData, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// Type Imports
import type { PageMeta } from '@/types/api'
import type {
  AuditEvent,
  Client,
  ContractDetail,
  ContractFilters,
  ContractHeaderInput,
  ContractList,
  ContractStatus,
  ContractSummary,
  CoverageInput,
  CreateClientInput,
  CreateContractInput,
  LineInput,
  Service,
  SignContractInput,
  Site,
  SiteInput,
  TaxRate,
  UpdateClientInput,
  UpdateSiteInput
} from '@/types/contractTypes'

// Lib Imports
import { queryKeys } from '@/libs/react-query/query-keys'

import { bff } from '../bff'

export const CONTRACT_STATUSES: ContractStatus[] = [
  'DRAFT',
  'PENDING_SIGNATURE',
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
  'CANCELLED'
]

const LOOKUP_STALE = 5 * 60 * 1000

// ---- queries --------------------------------------------------------------------

export const contractListQueryOptions = (filters: ContractFilters) =>
  queryOptions({
    queryKey: queryKeys.contracts.list(filters),
    queryFn: async ({ signal }): Promise<ContractList> => {
      const { data, meta } = await bff<{ contracts: ContractSummary[] }>('contracts', { query: filters, signal })

      return {
        contracts: data.contracts,
        meta: meta ?? { page: 1, limit: data.contracts.length, total: data.contracts.length, totalPages: 1 }
      }
    },
    placeholderData: keepPreviousData
  })

export const useContractsQuery = (filters: ContractFilters) => useQuery(contractListQueryOptions(filters))

/** Totals per status for the stat cards and tab badges (latest version of each contract only). */
export const useContractStatusCounts = (filters: Pick<ContractFilters, 'q' | 'clientId'>) =>
  useQuery({
    queryKey: queryKeys.contracts.counts(filters),
    queryFn: async ({ signal }) => {
      const totals = await Promise.all(
        CONTRACT_STATUSES.map(async status => {
          const { meta } = await bff<{ contracts: ContractSummary[] }>('contracts', {
            query: { ...filters, status, latestOnly: 'true', limit: 1 },
            signal
          })

          return [status, meta?.total ?? 0] as const
        })
      )

      return Object.fromEntries(totals) as Record<ContractStatus, number>
    }
  })

export const useContractQuery = (id: string) =>
  useQuery({
    queryKey: queryKeys.contracts.detail(id),
    queryFn: async ({ signal }) =>
      (await bff<{ contract: ContractDetail }>(`contracts/${id}`, { signal })).data.contract
  })

export const useClientsQuery = (params: { q?: string; active?: 'true' | 'false' } = {}) =>
  useQuery({
    queryKey: queryKeys.contracts.clients(params),
    staleTime: LOOKUP_STALE,
    queryFn: async ({ signal }) =>
      (await bff<{ clients: Client[] }>('clients', { query: { ...params, limit: 100 }, signal })).data.clients,
    placeholderData: keepPreviousData
  })

export const useClientQuery = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.contracts.client(id ?? ''),
    enabled: !!id,
    staleTime: LOOKUP_STALE,
    queryFn: async ({ signal }) => (await bff<{ client: Client }>(`clients/${id}`, { signal })).data.client
  })

/** Every site of one client (active and inactive, so old contract lines still resolve their site name). */
export const useClientSites = (clientId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.contracts.sites(clientId ?? ''),
    enabled: !!clientId,
    staleTime: LOOKUP_STALE,
    queryFn: async ({ signal }) =>
      (await bff<{ sites: Site[] }>('sites', { query: { clientId, limit: 100 }, signal })).data.sites
  })

export const useServicesQuery = () =>
  useQuery({
    queryKey: queryKeys.contracts.services(),
    staleTime: LOOKUP_STALE,
    queryFn: async ({ signal }) =>
      (await bff<{ services: Service[] }>('services', { query: { limit: 100 }, signal })).data.services
  })

/** ADMIN only on the server; pass `enabled: false` for everyone else. */
export const useTaxRatesQuery = (enabled = true) =>
  useQuery({
    queryKey: queryKeys.contracts.taxRates(),
    enabled,
    staleTime: LOOKUP_STALE,
    queryFn: async ({ signal }) => (await bff<{ taxRates: TaxRate[] }>('tax-rates', { signal })).data.taxRates
  })

// ---- mutations ------------------------------------------------------------------

const useContractInvalidation = () => {
  const queryClient = useQueryClient()

  return (contract?: ContractDetail) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.contracts.lists() })
    void queryClient.invalidateQueries({ queryKey: queryKeys.contracts.allCounts() })

    if (contract) {
      queryClient.setQueryData(queryKeys.contracts.detail(contract.id), contract)
      void queryClient.invalidateQueries({ queryKey: queryKeys.contracts.audit('contract', contract.id) })

      // Lifecycle actions can touch the other versions (sign expires the predecessor)
      contract.versions
        .filter(version => version.id !== contract.id)
        .forEach(version => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.contracts.detail(version.id) })
          void queryClient.invalidateQueries({ queryKey: queryKeys.contracts.audit('contract', version.id) })
        })
    }
  }
}

type ContractResponse = { contract: ContractDetail }

const useContractMutation = <Input>(request: (input: Input) => Promise<ContractDetail>) => {
  const invalidate = useContractInvalidation()

  return useMutation({ mutationFn: request, onSuccess: contract => invalidate(contract) })
}

export const useCreateContract = () =>
  useContractMutation(
    async (input: CreateContractInput) =>
      (await bff<ContractResponse>('contracts', { method: 'POST', body: input })).data.contract
  )

export const useUpdateContractHeader = (id: string) =>
  useContractMutation(
    async (input: Partial<ContractHeaderInput>) =>
      (await bff<ContractResponse>(`contracts/${id}`, { method: 'PATCH', body: input })).data.contract
  )

export const useReplaceLines = (id: string) =>
  useContractMutation(
    async (lines: LineInput[]) =>
      (await bff<ContractResponse>(`contracts/${id}/lines`, { method: 'PUT', body: { lines } })).data.contract
  )

export const useReplaceCoverage = (id: string) =>
  useContractMutation(
    async (coverage: CoverageInput[]) =>
      (await bff<ContractResponse>(`contracts/${id}/coverage`, { method: 'PUT', body: { coverage } })).data.contract
  )

export type LifecycleAction =
  | { action: 'submit' }
  | { action: 'sign'; body: SignContractInput }
  | { action: 'suspend' }
  | { action: 'resume' }
  | { action: 'cancel'; body: { reason: string } }
  | { action: 'new-version' }

/** submit / sign / suspend / resume / cancel / new-version. Returns the resulting contract (the new draft for new-version). */
export const useContractAction = (id: string) =>
  useContractMutation(
    async (input: LifecycleAction) =>
      (
        await bff<ContractResponse>(`contracts/${id}/${input.action}`, {
          method: 'POST',
          body: 'body' in input ? input.body : {}
        })
      ).data.contract
  )

export const useCreateClient = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateClientInput) =>
      (await bff<{ client: Client }>('clients', { method: 'POST', body: input })).data.client,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.contracts.allClients() })
  })
}

export const useCreateSite = (clientId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: SiteInput) =>
      (await bff<{ site: Site }>(`clients/${clientId}/sites`, { method: 'POST', body: input })).data.site,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.contracts.sites(clientId) })
  })
}

export const useCreateService = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { name: string; description?: string | null }) =>
      (await bff<{ service: Service }>('services', { method: 'POST', body: input })).data.service,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.contracts.services() })
  })
}

/** Paged client list for the Clients page. */
export const useClientListQuery = (filters: { q?: string; active?: 'true' | 'false'; page: number; limit: number }) =>
  useQuery({
    queryKey: queryKeys.contracts.clientPage(filters),
    queryFn: async ({ signal }): Promise<{ clients: Client[]; meta: PageMeta }> => {
      const { data, meta } = await bff<{ clients: Client[] }>('clients', { query: filters, signal })

      return {
        clients: data.clients,
        meta: meta ?? { page: 1, limit: data.clients.length, total: data.clients.length, totalPages: 1 }
      }
    },
    placeholderData: keepPreviousData
  })

export const useUpdateClient = (id: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateClientInput) =>
      (await bff<{ client: Client }>(`clients/${id}`, { method: 'PATCH', body: input })).data.client,
    onSuccess: client => {
      queryClient.setQueryData(queryKeys.contracts.client(client.id), client)
      void queryClient.invalidateQueries({ queryKey: queryKeys.contracts.allClients() })

      // Contract rows embed the client's legal name
      void queryClient.invalidateQueries({ queryKey: queryKeys.contracts.lists() })
    }
  })
}

export const useUpdateSite = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateSiteInput }) =>
      (await bff<{ site: Site }>(`sites/${id}`, { method: 'PATCH', body: input })).data.site,
    onSuccess: site => void queryClient.invalidateQueries({ queryKey: queryKeys.contracts.sites(site.clientId) })
  })
}

export const useUpdateService = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      input
    }: {
      id: string
      input: { name?: string; description?: string | null; active?: boolean }
    }) => (await bff<{ service: Service }>(`services/${id}`, { method: 'PATCH', body: input })).data.service,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.contracts.services() })
  })
}

export const usePutTaxRate = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ code, ratePercent }: { code: string; ratePercent: string }) =>
      (
        await bff<{ taxRate: TaxRate }>(`tax-rates/${encodeURIComponent(code)}`, {
          method: 'PUT',
          body: { ratePercent }
        })
      ).data.taxRate,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.contracts.taxRates() })
  })
}

export const useDeleteTaxRate = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (code: string) => bff(`tax-rates/${encodeURIComponent(code)}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.contracts.taxRates() })
  })
}

/** Audit trail of one record (ADMIN only on the server). */
export const useAuditTrail = (entity: string, entityId: string, enabled = true) =>
  useQuery({
    queryKey: queryKeys.contracts.audit(entity, entityId),
    enabled,
    queryFn: async ({ signal }) =>
      (await bff<{ events: AuditEvent[] }>('audit-events', { query: { entity, entityId, limit: 100 }, signal })).data
        .events
  })
