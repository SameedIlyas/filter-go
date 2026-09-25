import type { User } from '@/types/api'

/** The signed-in user, as returned by `GET /v1/auth/me`. Safe for client components. */
export type SessionUser = User
