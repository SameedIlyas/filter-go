import { z } from 'zod'

import { AppError } from '../../lib/errors.js'
import { D, moneyField, quantityField } from '../../lib/money.js'
import { pageQueryShape } from '../../lib/pagination.js'
import { dateOnlyField, instantField, timeOfDayField } from '../../lib/time.js'
import { parse } from '../../lib/validation.js'

const MAX_ROWS = 200

export const billingTypeField = z.enum(['PER_VISIT', 'HOURLY', 'MONTHLY_FIXED'])
export const billingCycleField = z.enum(['PER_VISIT', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'])
export const contractStatusField = z.enum(['DRAFT', 'PENDING_SIGNATURE', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED'])

/** Tax codes are case-insensitive on the way in and stored upper-case ("GST", "VAT-20"). */
export const taxCodeField = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_.-]{0,31}$/, 'Use 1-32 letters, digits, "_", "." or "-".')

/** The stored quantity has 2 decimals (the column), even though quantity inputs elsewhere allow 4. */
const lineQtyField = quantityField.refine(value => value.decimalPlaces() <= 2, 'Use at most 2 decimals for a contract quantity.')

export const lineSchema = z.strictObject({
  siteId: z.uuid('Invalid id.'),
  serviceId: z.uuid('Invalid id.').nullable().optional(),
  description: z.string().trim().min(1, 'Description is required.').max(500),
  qty: lineQtyField.optional(),
  billRate: moneyField,
  payRate: moneyField.nullable().optional(),
  estMinutes: z.number().int().min(1).max(10_080).nullable().optional(),
  taxCode: taxCodeField.nullable().optional()
})

export const coverageSchema = z.strictObject({
  siteId: z.uuid('Invalid id.'),
  patternType: z.enum(['WEEKLY', 'INTERVAL', 'AD_HOC']),
  weekdays: z.array(z.number().int().min(1).max(7)).max(14).optional(),
  timeStart: timeOfDayField.nullable().optional(),
  timeEnd: timeOfDayField.nullable().optional(),
  intervalDays: z.number().int().min(1).max(3650).nullable().optional(),
  visitsPerPeriod: z.number().int().min(1).max(1000).nullable().optional()
})

export const linesBody = z.strictObject({ lines: z.array(lineSchema).max(MAX_ROWS) })
export const coverageBody = z.strictObject({ coverage: z.array(coverageSchema).max(MAX_ROWS) })

export const createContractBody = z.strictObject({
  clientId: z.uuid('Invalid id.'),
  startDate: dateOnlyField,
  endDate: dateOnlyField.nullable().optional(),
  autoRenew: z.boolean().optional(),
  billingType: billingTypeField,
  billingCycle: billingCycleField,
  lines: z.array(lineSchema).max(MAX_ROWS).default([]),
  coverage: z.array(coverageSchema).max(MAX_ROWS).default([])
})

export const patchContractBody = z
  .strictObject({
    startDate: dateOnlyField.optional(),
    endDate: dateOnlyField.nullable().optional(),
    autoRenew: z.boolean().optional(),
    billingType: billingTypeField.optional(),
    billingCycle: billingCycleField.optional()
  })
  .refine(value => Object.keys(value).length > 0, 'Provide at least one field to update.')

export const signBody = z.strictObject({
  signedBy: z.string().trim().min(1, 'Signer name is required.').max(200),
  signedAt: instantField.optional(),
  documentFileId: z.uuid('Invalid id.').nullable().optional()
})

export const cancelBody = z.strictObject({ reason: z.string().trim().min(1, 'A reason is required.').max(500) })

export const emptyBody = z.strictObject({})

export const listContractsQuery = z.strictObject({
  ...pageQueryShape,
  status: contractStatusField.optional(),
  clientId: z.uuid('Invalid id.').optional(),
  q: z.string().trim().min(1).max(100).optional(),
  latestOnly: z.enum(['true', 'false']).default('false').transform(value => value === 'true')
})

export type CreateContractInput = z.output<typeof createContractBody>
export type PatchContractInput = z.output<typeof patchContractBody>
export type SignInput = z.output<typeof signBody>
export type ListContractsQuery = z.output<typeof listContractsQuery>
export type LineBodyInput = z.output<typeof lineSchema>

export const lineQty = (line: LineBodyInput) => line.qty ?? D(1)

/**
 * Like `parse`, but reports paths of nested rows as `lines[2].billRate` (the same shape the submit validation
 * uses) instead of Zod's `lines.2.billRate`, so the frontend maps every error the same way.
 */
export const parseBody = <S extends z.ZodType>(schema: S, data: unknown): z.output<S> => {
  try {
    return parse(schema, data)
  } catch (error) {
    if (error instanceof AppError && error.details?.issues) {
      const issues = error.details.issues.map(issue => ({ ...issue, field: issue.field.replace(/\.(\d+)(?=\.|$)/g, '[$1]') }))

      throw new AppError(error.statusCode, error.code, error.message, { details: { ...error.details, issues } })
    }

    throw error
  }
}
