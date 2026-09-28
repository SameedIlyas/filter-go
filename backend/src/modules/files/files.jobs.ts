import type { OutboxHandler } from '../../jobs/outbox.js'
import type { JobDefinition } from '../../jobs/scheduler.js'
import { sweepOrphanFiles } from './files.sweep.js'

/** Scheduled jobs owned by this module. Each one must be safe to run twice and safe to run on several servers. */
export const jobs: JobDefinition[] = [
  {
    name: 'files.sweep-orphans',
    everySeconds: 24 * 3600,
    run: async ctx => {
      const deleted = await sweepOrphanFiles(ctx)

      if (deleted > 0) ctx.log.info({ deleted }, 'deleted orphan files')
    }
  }
]

/** Handlers for outbox job types owned by this module, keyed by job type. */
export const outboxHandlers: Record<string, OutboxHandler> = {}
