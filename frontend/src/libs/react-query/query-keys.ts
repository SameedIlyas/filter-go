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

  /** `GET /apps/user-list` — reference feature, see `src/libs/api/queries/users.ts`. */
  users: {
    all: () => [...queryKeys.root, 'users'] as const,
    lists: () => [...queryKeys.root, 'users', 'list'] as const,
    list: (params: { role?: string; status?: string } = {}) => [...queryKeys.root, 'users', 'list', params] as const,
    details: () => [...queryKeys.root, 'users', 'detail'] as const,
    detail: (userId: number) => [...queryKeys.root, 'users', 'detail', userId] as const
  }
} as const
