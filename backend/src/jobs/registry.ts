import type { AppContext } from '../context.js'
import { jobs as usersJobs, outboxHandlers as usersHandlers } from '../modules/users/users.jobs.js'
import { jobs as filesJobs, outboxHandlers as filesHandlers } from '../modules/files/files.jobs.js'
import { jobs as orgJobs, outboxHandlers as orgHandlers } from '../modules/org/org.jobs.js'
import { jobs as notificationsJobs, outboxHandlers as notificationsHandlers } from '../modules/notifications/notifications.jobs.js'
import { jobs as contractsJobs, outboxHandlers as contractsHandlers } from '../modules/contracts/contracts.jobs.js'
import { jobs as schedulingJobs, outboxHandlers as schedulingHandlers } from '../modules/scheduling/scheduling.jobs.js'
import { jobs as timesheetsJobs, outboxHandlers as timesheetsHandlers } from '../modules/timesheets/timesheets.jobs.js'
import { jobs as invoicesJobs, outboxHandlers as invoicesHandlers } from '../modules/invoices/invoices.jobs.js'
import { jobs as leadsJobs, outboxHandlers as leadsHandlers } from '../modules/leads/leads.jobs.js'
import { processOutbox } from './outbox.js'
import type { OutboxHandler } from './outbox.js'
import type { JobDefinition } from './scheduler.js'

/** Every outbox job type -> handler, merged from all modules. A duplicate type is a programming error. */
export const outboxHandlers: Record<string, OutboxHandler> = (() => {
  const merged: Record<string, OutboxHandler> = {}

  for (const set of [usersHandlers, filesHandlers, orgHandlers, notificationsHandlers, contractsHandlers, schedulingHandlers, timesheetsHandlers, invoicesHandlers, leadsHandlers]) {
    for (const [type, handler] of Object.entries(set)) {
      if (merged[type]) throw new Error(`Duplicate outbox handler for "${type}"`)

      merged[type] = handler
    }
  }

  return merged
})()

const outboxJob: JobDefinition = {
  name: 'outbox.process',
  everySeconds: 15,
  run: async (ctx: AppContext) => {
    await processOutbox(ctx, outboxHandlers)
  }
}

/** Every scheduled job in the system. */
export const allJobs: JobDefinition[] = [
  outboxJob,
  ...usersJobs,
  ...filesJobs,
  ...orgJobs,
  ...notificationsJobs,
  ...contractsJobs,
  ...schedulingJobs,
  ...timesheetsJobs,
  ...invoicesJobs,
  ...leadsJobs
]
