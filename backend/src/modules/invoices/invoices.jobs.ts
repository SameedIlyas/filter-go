import type { OutboxHandler } from '../../jobs/outbox.js'
import type { JobDefinition } from '../../jobs/scheduler.js'
import { invoiceOutboxHandlers } from './sync.handlers.js'

/** Scheduled jobs owned by this module. Each one must be safe to run twice and safe to run on several servers. */
export const jobs: JobDefinition[] = []

/**
 * Handlers for outbox job types owned by this module, keyed by job type:
 * accounting.sync_invoice, accounting.void_invoice, accounting.post_payment, payments.create_invoice, payments.void_invoice.
 */
export const outboxHandlers: Record<string, OutboxHandler> = invoiceOutboxHandlers
