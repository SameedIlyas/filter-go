import { z } from 'zod'

import { moneyField, quantityField } from '../../lib/money.js'
import { pageQueryShape } from '../../lib/pagination.js'
import { dateOnlyField, instantField } from '../../lib/time.js'

const DAY_MS = 24 * 60 * 60 * 1000

export const INVOICE_STATUSES = ['DRAFT', 'APPROVED', 'SYNCED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'VOID'] as const

export const runBody = z.strictObject({
  contractId: z.uuid(),
  periodStart: dateOnlyField,
  periodEnd: dateOnlyField
})

export const listQuery = z.strictObject({
  ...pageQueryShape,
  status: z.enum(INVOICE_STATUSES).optional(),
  clientId: z.uuid().optional(),
  contractId: z.uuid().optional(),
  from: dateOnlyField.optional(),
  to: dateOnlyField.optional(),
  q: z.string().trim().min(1).max(50).optional()
})

export const patchBody = z
  .strictObject({
    dueDate: dateOnlyField.optional(),
    notes: z.string().trim().max(2000).nullable().optional()
  })
  .refine(value => Object.keys(value).length > 0, 'Provide at least one field to update.')

export const lineBody = z.strictObject({
  description: z.string().trim().min(1).max(500),
  qty: quantityField.refine(value => value.gt(0), 'Quantity must be greater than zero.'),
  unitRate: moneyField.refine(value => value.gt(0), 'Rate must be greater than zero.'),
  siteId: z.uuid().optional(),
  taxCode: z.string().trim().min(1).max(40).optional()
})

export const voidBody = z.strictObject({ reason: z.string().trim().min(1).max(500) })

export const paymentBody = z.strictObject({
  amount: moneyField.refine(value => value.gt(0), 'Amount must be greater than zero.'),
  // "stripe" is reserved for payments that arrive through the webhook
  method: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .refine(value => value.toLowerCase() !== 'stripe', 'The "stripe" method is recorded automatically.'),
  receivedAt: instantField.refine(value => value.getTime() <= Date.now() + DAY_MS, 'A payment cannot be received in the future.').optional(),
  externalRef: z.string().trim().min(1).max(100).optional()
})

export const emptyBody = z.strictObject({})

export const lineParams = z.strictObject({ id: z.uuid('Invalid id.'), lineId: z.uuid('Invalid id.') })
