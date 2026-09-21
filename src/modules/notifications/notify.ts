import type { AppContext } from '../../context.js'
import type { Prisma } from '../../generated/prisma/client.js'
import type { Db } from '../../lib/prisma.js'

export interface NotifyInput {
  orgId: string
  userIds: string[]
  /** Machine type, e.g. "shift.assigned", "schedule.published", "lead.new", "timesheet.no_show". */
  type: string
  title: string
  body: string
  data?: Prisma.InputJsonValue
  /** Also send an email (in the background). Use for things that must not wait for someone to open the app. */
  email?: boolean
}

/**
 * Creates in-app notifications and optionally emails them.
 * `db` lets you create the rows inside your transaction; the email is sent after, in the background,
 * and can never fail the caller.
 */
export const notify = async (ctx: AppContext, input: NotifyInput, db: Db = ctx.prisma): Promise<number> => {
  const userIds = [...new Set(input.userIds)]

  if (userIds.length === 0) return 0

  // Only real, active users of this organization can be notified: never trust a caller-supplied id blindly
  const users = await db.user.findMany({
    where: { id: { in: userIds }, orgId: input.orgId, status: 'ACTIVE' },
    select: { id: true, email: true, name: true }
  })

  if (users.length === 0) return 0

  await db.notification.createMany({
    data: users.map(user => ({
      orgId: input.orgId,
      userId: user.id,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data
    }))
  })

  if (input.email) {
    for (const user of users) {
      ctx.background.run(`notify-email:${input.type}`, () =>
        ctx.mailer.send({
          to: user.email,
          subject: input.title,
          text: `Hi ${user.name},\n\n${input.body}\n\n${ctx.config.frontendUrl}`,
          html: `<p>Hi ${escapeHtml(user.name)},</p><p>${escapeHtml(input.body)}</p><p><a href="${escapeHtml(ctx.config.frontendUrl)}">Open the portal</a></p>`
        })
      )
    }
  }

  return users.length
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
