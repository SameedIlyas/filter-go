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
  },

  /** `/api/backend/{schedules,shifts,shift-offers,me/*}` — see `src/libs/api/queries/scheduling.ts`. */
  scheduling: {
    all: () => [...queryKeys.root, 'scheduling'] as const,
    boards: () => [...queryKeys.root, 'scheduling', 'board'] as const,
    board: (params: object) => [...queryKeys.root, 'scheduling', 'board', params] as const,
    scheduleLists: () => [...queryKeys.root, 'scheduling', 'schedules', 'list'] as const,
    scheduleList: (filters: object) => [...queryKeys.root, 'scheduling', 'schedules', 'list', filters] as const,
    schedule: (id: string) => [...queryKeys.root, 'scheduling', 'schedules', 'one', id] as const,
    shifts: () => [...queryKeys.root, 'scheduling', 'shifts'] as const,
    shift: (id: string) => [...queryKeys.root, 'scheduling', 'shifts', id] as const,
    staff: () => [...queryKeys.root, 'scheduling', 'staff'] as const,
    sites: () => [...queryKeys.root, 'scheduling', 'sites'] as const,
    me: () => [...queryKeys.root, 'scheduling', 'me'] as const,
    myShifts: (range: object) => [...queryKeys.root, 'scheduling', 'me', 'shifts', range] as const,
    myOffers: () => [...queryKeys.root, 'scheduling', 'me', 'offers'] as const,
    mySchedules: () => [...queryKeys.root, 'scheduling', 'me', 'schedules'] as const
  },

  /** `/api/backend/{timesheets,timesheet-exceptions,me/timesheets,shifts/:id/(clock-in|work-logs)}` — see `src/libs/api/queries/timesheets.ts`. */
  timesheets: {
    all: () => [...queryKeys.root, 'timesheets'] as const,
    lists: () => [...queryKeys.root, 'timesheets', 'list'] as const,
    list: (filters: object) => [...queryKeys.root, 'timesheets', 'list', filters] as const,
    exceptionLists: () => [...queryKeys.root, 'timesheets', 'exceptions'] as const,
    exceptions: (filters: object) => [...queryKeys.root, 'timesheets', 'exceptions', filters] as const,
    hoursAll: () => [...queryKeys.root, 'timesheets', 'hours'] as const,
    hours: (params: object) => [...queryKeys.root, 'timesheets', 'hours', params] as const,
    detail: (id: string) => [...queryKeys.root, 'timesheets', 'one', id] as const,
    workLogs: (shiftId: string) => [...queryKeys.root, 'timesheets', 'work-logs', shiftId] as const,
    me: () => [...queryKeys.root, 'timesheets', 'me'] as const,
    mine: (filters: object) => [...queryKeys.root, 'timesheets', 'me', 'list', filters] as const,
    myOpen: () => [...queryKeys.root, 'timesheets', 'me', 'open'] as const
  }
} as const
