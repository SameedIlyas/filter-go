/**
 * Hierarchical query keys for stable cache identity and targeted invalidation.
 * Add feature segments (e.g. `filters`, `dispatches`) as you introduce API hooks.
 *
 * Every key is a function returning an `as const` tuple built from `root`, so
 * invalidation can be aimed at any level: `queryKeys.users.all()` drops every
 * user query, `queryKeys.users.lists()` only the lists, `queryKeys.users.detail(3)`
 * exactly one entry.
 *
 * @see https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
 * @see https://tkdodo.eu/blog/effective-react-query-keys
 */
export const queryKeys = {
  root: ['coolcraft'] as const,

  /** `/api/backend/{users,admin/users}/*` — see `src/libs/api/queries/users.ts`. */
  users: {
    all: () => [...queryKeys.root, 'users'] as const,
    lists: () => [...queryKeys.root, 'users', 'list'] as const,
    list: (filters: object = {}) => [...queryKeys.root, 'users', 'list', filters] as const,
    allCounts: () => [...queryKeys.root, 'users', 'counts'] as const,
    counts: (filters: object) => [...queryKeys.root, 'users', 'counts', filters] as const,
    one: (id: string) => [...queryKeys.root, 'users', 'one', id] as const,
    detail: (id: string) => [...queryKeys.root, 'users', 'one', id, 'detail'] as const,
    availability: (id: string) => [...queryKeys.root, 'users', 'one', id, 'availability'] as const,
    sites: (id: string) => [...queryKeys.root, 'users', 'one', id, 'sites'] as const,
    documents: (id: string) => [...queryKeys.root, 'users', 'one', id, 'documents'] as const,
    compliance: (id: string) => [...queryKeys.root, 'users', 'one', id, 'compliance'] as const,
    allSites: () => [...queryKeys.root, 'users', 'site-options'] as const
  },

  /** `/api/backend/leads/*` — see `src/libs/api/queries/leads.ts`. */
  leads: {
    all: () => [...queryKeys.root, 'leads'] as const,
    lists: () => [...queryKeys.root, 'leads', 'list'] as const,
    list: (filters: object) => [...queryKeys.root, 'leads', 'list', filters] as const,
    allCounts: () => [...queryKeys.root, 'leads', 'counts'] as const,
    counts: (filters: object) => [...queryKeys.root, 'leads', 'counts', filters] as const,
    one: (id: string) => [...queryKeys.root, 'leads', 'one', id] as const,
    detail: (id: string) => [...queryKeys.root, 'leads', 'one', id, 'detail'] as const,
    activities: (id: string, limit: number) => [...queryKeys.root, 'leads', 'one', id, 'activities', limit] as const,
    owners: () => [...queryKeys.root, 'leads', 'owners'] as const
  },

  /** `/api/backend/{contracts,clients,sites,services,tax-rates}` — see `src/libs/api/queries/contracts.ts`. */
  contracts: {
    all: () => [...queryKeys.root, 'contracts'] as const,
    lists: () => [...queryKeys.root, 'contracts', 'list'] as const,
    list: (filters: object) => [...queryKeys.root, 'contracts', 'list', filters] as const,
    allCounts: () => [...queryKeys.root, 'contracts', 'counts'] as const,
    counts: (filters: object) => [...queryKeys.root, 'contracts', 'counts', filters] as const,
    detail: (id: string) => [...queryKeys.root, 'contracts', 'one', id] as const,
    allClients: () => [...queryKeys.root, 'contracts', 'clients'] as const,
    clients: (params: object) => [...queryKeys.root, 'contracts', 'clients', 'list', params] as const,
    client: (id: string) => [...queryKeys.root, 'contracts', 'clients', 'one', id] as const,
    clientPage: (filters: object) => [...queryKeys.root, 'contracts', 'clients', 'page', filters] as const,
    audit: (entity: string, id: string) => [...queryKeys.root, 'contracts', 'audit', entity, id] as const,
    sites: (clientId: string) => [...queryKeys.root, 'contracts', 'sites', clientId] as const,
    services: () => [...queryKeys.root, 'contracts', 'services'] as const,
    taxRates: () => [...queryKeys.root, 'contracts', 'tax-rates'] as const
  }
} as const
