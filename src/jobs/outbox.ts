import type { AppContext } from '../context.js'
import type { OutboxJob, Prisma } from '../generated/prisma/client.js'
import type { Db } from '../lib/prisma.js'

/*
 * Durable outbound work. Anything that talks to an external system (accounting, payments) is enqueued here
 * inside the SAME transaction as the change that requires it, then delivered by the worker with retries.
 * A failed sync can therefore never lose an invoice: the job stays in the table until it succeeds or is
 * marked DEAD for a human to look at.
 */

export type OutboxHandler = (ctx: AppContext, job: OutboxJob) => Promise<void>

export interface EnqueueInput {
  orgId?: string
  /** e.g. "accounting.sync_invoice". Must have a registered handler. */
  type: string
  payload: Prisma.InputJsonValue
  /** Enqueuing the same key twice is a no-op, which makes "enqueue on every retry" safe. */
  dedupeKey?: string
  runAt?: Date
  maxAttempts?: number
}

export const enqueue = async (db: Db, input: EnqueueInput): Promise<void> => {
  const data = {
    orgId: input.orgId,
    type: input.type,
    payload: input.payload,
    dedupeKey: input.dedupeKey,
    runAt: input.runAt,
    maxAttempts: input.maxAttempts
  }

  if (!input.dedupeKey) {
    await db.outboxJob.create({ data })

    return
  }

  await db.outboxJob.upsert({ where: { dedupeKey: input.dedupeKey }, create: data, update: {} })
}

const LOCK_SECONDS = 300

/** 30s, 1m, 2m, 4m ... capped at 1 hour. */
export const backoffSeconds = (attempts: number): number => Math.min(3600, 30 * 2 ** Math.max(0, attempts - 1))

/**
 * Claims up to `limit` due jobs (safe with several instances: SKIP LOCKED) and runs their handlers.
 * Returns how many jobs were attempted.
 */
export const processOutbox = async (ctx: AppContext, handlers: Record<string, OutboxHandler>, limit = 20): Promise<number> => {
  const claimed = await ctx.prisma.$queryRaw<OutboxJob[]>`
    UPDATE outbox_jobs SET "lockedUntil" = now() + make_interval(secs => ${LOCK_SECONDS}), "attempts" = "attempts" + 1
    WHERE id IN (
      SELECT id FROM outbox_jobs
      WHERE "status" = 'PENDING' AND "runAt" <= now() AND ("lockedUntil" IS NULL OR "lockedUntil" < now())
      ORDER BY "runAt" ASC LIMIT ${limit} FOR UPDATE SKIP LOCKED)
    RETURNING *`

  for (const job of claimed) {
    const handler = handlers[job.type]

    try {
      if (!handler) throw new Error(`No handler registered for outbox job type "${job.type}"`)

      await handler(ctx, job)
      await ctx.prisma.outboxJob.update({ where: { id: job.id }, data: { status: 'DONE', completedAt: new Date(), lockedUntil: null, lastError: null } })
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000)
      const exhausted = !handler || job.attempts >= job.maxAttempts

      ctx.log.error({ err: error, jobId: job.id, type: job.type, attempts: job.attempts }, 'outbox job failed')
      await ctx.prisma.outboxJob.update({
        where: { id: job.id },
        data: {
          status: exhausted ? 'DEAD' : 'PENDING',
          lastError: message,
          lockedUntil: null,
          runAt: new Date(Date.now() + backoffSeconds(job.attempts) * 1000)
        }
      })
    }
  }

  return claimed.length
}
