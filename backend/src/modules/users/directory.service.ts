import type { AppContext } from '../../context.js'
import type { Prisma, Role, User, UserStatus } from '../../generated/prisma/client.js'
import { assertSiteAccess } from '../../lib/access.js'
import type { Actor } from '../../lib/access.js'
import { pageArgs, pageMeta } from '../../lib/pagination.js'
import type { PageQuery } from '../../lib/pagination.js'
import type { PageMeta } from '../../lib/response.js'
import { visibleUsersWhere } from './user-scope.js'

export interface DirectoryQuery extends PageQuery {
  q?: string
  role?: Role
  status?: UserStatus
  siteId?: string
}

/**
 * The people directory for ADMIN and SUPERVISOR. A supervisor only ever sees people who share a site with them
 * (and themselves); filtering by a site outside their scope is a 404 for the same reason.
 */
export const listDirectory = async (ctx: AppContext, actor: Actor, query: DirectoryQuery): Promise<{ items: User[]; meta: PageMeta }> => {
  if (query.siteId) await assertSiteAccess(ctx, actor, query.siteId)

  const filters: Prisma.UserWhereInput[] = [
    await visibleUsersWhere(ctx, actor),
    ...(query.role ? [{ role: query.role }] : []),
    ...(query.status ? [{ status: query.status }] : []),
    ...(query.siteId ? [{ siteAccess: { some: { siteId: query.siteId } } }] : []),
    ...(query.q
      ? [{ OR: [{ email: { contains: query.q, mode: 'insensitive' as const } }, { name: { contains: query.q, mode: 'insensitive' as const } }] }]
      : [])
  ]
  const where: Prisma.UserWhereInput = { AND: filters }

  const [total, items] = await Promise.all([
    ctx.prisma.user.count({ where }),
    ctx.prisma.user.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], ...pageArgs(query) })
  ])

  return { items, meta: pageMeta(query, total) }
}
