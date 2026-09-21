import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { moneyField } from '../../lib/money.js'
import { pageQueryShape } from '../../lib/pagination.js'
import { ok } from '../../lib/response.js'
import { dateOnlyField } from '../../lib/time.js'
import { emailField, nameField, parse, uuidParams } from '../../lib/validation.js'
import { actorFromReq, clientMeta, requireAdmin } from '../../plugins/auth.js'
import { serializeUser } from './serializers.js'
import { createInvite, getUser, listUsers, revokeUserSessions, sendInviteEmail, updateUserAsAdmin } from './users.service.js'

export const roleField = z.enum(['ADMIN', 'SUPERVISOR', 'FIELD_USER', 'CLIENT_USER'])
const employmentField = z.enum(['EMPLOYEE', 'CONTRACTOR'])
const phoneField = z.string().trim().min(3).max(40)

const inviteBody = z.strictObject({
  email: emailField,
  name: nameField,
  role: roleField.default('FIELD_USER'),
  /** Required for CLIENT_USER, forbidden otherwise. */
  clientId: z.uuid().optional(),
  phone: phoneField.optional(),
  employmentType: employmentField.optional(),
  defaultPayRate: moneyField.optional(),
  hiredAt: dateOnlyField.optional()
})

const listQuery = z.strictObject({
  ...pageQueryShape,
  q: z.string().trim().max(100).optional(),
  role: roleField.optional(),
  status: z.enum(['INVITED', 'ACTIVE', 'DISABLED']).optional(),
  clientId: z.uuid().optional()
})

const updateBody = z
  .strictObject({
    name: nameField.optional(),
    role: roleField.optional(),
    clientId: z.uuid().nullable().optional(),
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
    phone: phoneField.nullable().optional(),
    employmentType: employmentField.optional(),
    defaultPayRate: moneyField.nullable().optional(),
    hiredAt: dateOnlyField.nullable().optional()
  })
  .refine(value => Object.keys(value).length > 0, 'Provide at least one field to update.')

/** Every route here requires a signed-in ADMIN and only ever touches users of that admin's organization. */
export const adminUserRoutes: FastifyPluginAsync = async app => {
  const ctx = app.ctx

  app.addHook('preHandler', requireAdmin)

  app.post('/invite', async (req, reply) => {
    const body = parse(inviteBody, req.body)
    const actor = actorFromReq(req)
    const { user, token } = await createInvite(ctx, actor.id, { ...body, orgId: actor.orgId }, clientMeta(req))
    const emailSent = await sendInviteEmail(ctx, user, token)

    return reply.status(201).send(ok({ user: serializeUser(user, actor), emailSent }))
  })

  app.get('/', async (req, reply) => {
    const query = parse(listQuery, req.query)
    const actor = actorFromReq(req)
    const { items, meta } = await listUsers(ctx, actor.orgId, query)

    return reply.send(ok({ users: items.map(user => serializeUser(user, actor)) }, meta))
  })

  app.get('/:id', async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const actor = actorFromReq(req)
    const user = await getUser(ctx, actor.orgId, id)

    return reply.send(ok({ user: serializeUser(user, actor) }))
  })

  app.patch('/:id', async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const body = parse(updateBody, req.body)
    const actor = actorFromReq(req)
    const user = await updateUserAsAdmin(ctx, actor, id, body, clientMeta(req))

    return reply.send(ok({ user: serializeUser(user, actor) }))
  })

  app.post('/:id/revoke-sessions', async (req, reply) => {
    const { id } = parse(uuidParams, req.params)
    const revoked = await revokeUserSessions(ctx, actorFromReq(req), id, clientMeta(req))

    return reply.send(ok({ revoked }))
  })
}
