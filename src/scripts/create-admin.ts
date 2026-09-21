import 'dotenv/config'

import { randomBytes } from 'node:crypto'
import { parseArgs } from 'node:util'

import { loadConfig } from '../config/env.js'
import { AppError } from '../lib/errors.js'
import { createPrisma } from '../lib/prisma.js'
import type { PrismaClient } from '../lib/prisma.js'
import { emailField, nameField, parse } from '../lib/validation.js'
import { z } from 'zod'
import { createInvite, inviteLink } from '../modules/users/users.service.js'
import { createPasswordHasher } from '../lib/password.js'
import { createBackgroundTasks } from '../lib/background.js'
import type { AppContext, Logger } from '../context.js'

/*
 * Bootstraps the first admin: pnpm admin:create --email you@filter-go.com --name "Your Name"
 *
 * It never handles a password. It creates the account in INVITED state and prints a one-time
 * link; the admin opens it and chooses their own password. Run it again to get a fresh link.
 */

const out = (line: string) => process.stdout.write(`${line}\n`)

const logger: Logger = {
  info: obj => out(String(obj)),
  warn: obj => process.stderr.write(`${JSON.stringify(obj)}\n`),
  error: obj => process.stderr.write(`${JSON.stringify(obj)}\n`)
}

/**
 * --org "Name" finds that organization or creates it. Without --org the single existing organization is used;
 * with none (first run) or several the operator must say which.
 */
const resolveOrg = async (prisma: PrismaClient, name: string | undefined): Promise<string> => {
  if (name) {
    const existing = await prisma.organization.findFirst({ where: { name } })

    if (existing) return existing.id

    const created = await prisma.organization.create({ data: { name, leadIntakeKey: randomBytes(24).toString('base64url') } })

    out(`Created organization "${name}".`)

    return created.id
  }

  const orgs = await prisma.organization.findMany({ select: { id: true } })
  const [only] = orgs

  if (orgs.length === 1 && only) return only.id

  throw new Error(orgs.length === 0 ? 'No organization exists yet. Pass --org "Your Company" to create the first one.' : 'Several organizations exist. Pass --org "Name" to choose one.')
}

const main = async () => {
  const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' }, org: { type: 'string' }, force: { type: 'boolean' } } })
  const input = parse(z.strictObject({ email: emailField, name: nameField }), { email: values.email, name: values.name })

  const config = loadConfig()
  const prisma = createPrisma(config.databaseUrl)
  const ctx: AppContext = {
    config,
    prisma,
    // Deliberately no mailer: the link is printed for the operator instead of emailed
    mailer: { send: async () => undefined },
    hasher: createPasswordHasher(config.passwordHash),
    background: createBackgroundTasks(logger),
    log: logger
  }

  try {
    const orgId = await resolveOrg(prisma, values.org)
    const { user, token } = await createInvite(ctx, null, { ...input, orgId, role: 'ADMIN' })

    out(`\nAdmin ready: ${user.email} (${user.role}, status ${user.status})`)
    out(`\nOpen this link to set the password (single use, valid ${Math.round(config.inviteTtlSeconds / 3600)}h):\n`)
    out(inviteLink(ctx, token))
    out('')
  } catch (error) {
    if (error instanceof AppError && error.code === 'EMAIL_TAKEN' && values.force) {
      // Break-glass recovery when every admin is locked out. Their password is left alone.
      await prisma.user.update({ where: { email: input.email }, data: { role: 'ADMIN', status: 'ACTIVE' } })
      out(`\n${input.email} is now an active ADMIN. Their password was not changed (use "Forgot password" if needed).`)
    } else if (error instanceof AppError && error.code === 'EMAIL_TAKEN') {
      out(`\n${input.email} already has a password.`)
      out('  - to make them an active admin again:  pnpm admin:create --email <email> --name "<name>" --force')
      out('  - to reset their password: use "Forgot password" on the portal')
      process.exitCode = 1
    } else {
      throw error
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(error => {
  process.stderr.write(`create-admin failed: ${error instanceof Error ? error.message : String(error)}\n`)

  if (error instanceof AppError && error.details?.issues) {
    for (const issue of error.details.issues) process.stderr.write(`  - ${issue.field}: ${issue.message}\n`)
  }

  process.exit(1)
})
