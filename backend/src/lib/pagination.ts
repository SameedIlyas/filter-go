import { z } from 'zod'

import type { PageMeta } from './response.js'

/** Spread into a `z.strictObject({...})` query schema. */
export const pageQueryShape = {
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
}

export interface PageQuery {
  page: number
  limit: number
}

export const pageArgs = ({ page, limit }: PageQuery) => ({ skip: (page - 1) * limit, take: limit })

export const pageMeta = ({ page, limit }: PageQuery, total: number): PageMeta => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit))
})
