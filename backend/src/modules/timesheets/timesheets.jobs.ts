import type { OutboxHandler } from '../../jobs/outbox.js'
import type { JobDefinition } from '../../jobs/scheduler.js'
import { sweepTimesheets } from './sweep.js'

/** Closes entries nobody clocked out of and records no-shows. Idempotent (see `sweepTimesheets`). */
export const timesheetsSweepJob: JobDefinition = {
  name: 'timesheets.sweep',
  everySeconds: 60,
  run: async ctx => {
    const result = await sweepTimesheets(ctx)

    if (result.autoClosed > 0 || result.noShows > 0 || result.failed > 0) {
      ctx.log.info(result, 'timesheets.sweep finished')
    }
  }
}

/** Scheduled jobs owned by this module. Each one must be safe to run twice and safe to run on several servers. */
export const jobs: JobDefinition[] = [timesheetsSweepJob]

/** Handlers for outbox job types owned by this module, keyed by job type. */
export const outboxHandlers: Record<string, OutboxHandler> = {}
