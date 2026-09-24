import { z } from 'zod'

import { D } from '../../lib/money.js'
import { pageQueryShape } from '../../lib/pagination.js'
import { dateOnlyField } from '../../lib/time.js'
import { emailField } from '../../lib/validation.js'

export const LIMITS = {
  name: 200,
  phone: 40,
  address: 500,
  serviceInterest: 200,
  message: 4000,
  activityBody: 4000,
  lostReason: 1000,
  sourceUrl: 2048,
  utmKeys: 20,
  utmValue: 200,
  units: 200,
  photos: 20,
  unitNotes: 1000,
  accessNotes: 2000
} as const

const CONTROL_CHARS = /[\p{C}]/u
const MULTILINE_CONTROL_CHARS = /[^\P{C}\n\r\t]/u

/** One-line text: trimmed, non-empty, no control characters (they would break email headers and logs). */
export const lineField = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'This field is required.')
    .max(max, `Must be at most ${max} characters.`)
    .refine(value => !CONTROL_CHARS.test(value), 'Contains invalid characters.')

/** Free text that may span lines (newlines and tabs are fine, other control characters are not). */
export const textField = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'This field is required.')
    .max(max, `Must be at most ${max} characters.`)
    .refine(value => !MULTILINE_CONTROL_CHARS.test(value), 'Contains invalid characters.')

/** Website forms send "" for untouched inputs: treat that as absent. */
const blankToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value)

export const optionalPublic = <S extends z.ZodType>(schema: S) => z.preprocess(blankToUndefined, schema.optional())

export const phoneField = lineField(LIMITS.phone)

export const httpUrlField = z
  .string()
  .trim()
  .max(LIMITS.sourceUrl, 'URL is too long.')
  .refine(value => {
    try {
      const { protocol } = new URL(value)

      return protocol === 'http:' || protocol === 'https:'
    } catch {
      return false
    }
  }, 'Must be a valid http(s) URL.')

export const utmField = z
  .record(z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_.-]+$/, 'Invalid key.'), z.string().max(LIMITS.utmValue))
  .refine(value => Object.keys(value).length <= LIMITS.utmKeys, `At most ${LIMITS.utmKeys} keys.`)
  .refine(value => Object.values(value).every(item => !CONTROL_CHARS.test(item)), 'Contains invalid characters.')

const uuid = z.uuid('Invalid id.')

// ---- public intake ------------------------------------------------------------

export const publicLeadBody = z.strictObject({
  orgKey: z.string().trim().min(1).max(128),
  companyName: lineField(LIMITS.name),
  contactName: lineField(LIMITS.name),
  email: emailField,
  phone: optionalPublic(phoneField),
  address: optionalPublic(lineField(LIMITS.address)),
  serviceInterest: optionalPublic(lineField(LIMITS.serviceInterest)),
  message: optionalPublic(textField(LIMITS.message)),
  sourceUrl: optionalPublic(httpUrlField),
  utm: z.preprocess(value => (value === null ? undefined : value), utmField.optional()),
  // Honeypot. A non-empty value is intercepted before validation; only "empty" values reach the schema.
  website: z.string().trim().max(0).nullish()
})

export type PublicLeadBody = z.output<typeof publicLeadBody>

// ---- authenticated pipeline ---------------------------------------------------

const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST'] as const
const MANUAL_SOURCES = ['PHONE', 'REFERRAL', 'FIELD', 'MANUAL'] as const
const ALL_SOURCES = ['WEBSITE', ...MANUAL_SOURCES] as const

export const listQuery = z
  .strictObject({
    ...pageQueryShape,
    status: z.enum(LEAD_STATUSES).optional(),
    source: z.enum(ALL_SOURCES).optional(),
    ownerId: uuid.optional(),
    q: z.string().trim().min(1).max(100).optional(),
    from: dateOnlyField.optional(),
    to: dateOnlyField.optional()
  })
  .refine(value => !value.from || !value.to || value.from <= value.to, { message: '"from" must not be after "to".', path: ['from'] })

export type ListQuery = z.output<typeof listQuery>

export const createBody = z.strictObject({
  companyName: lineField(LIMITS.name),
  contactName: lineField(LIMITS.name),
  email: emailField,
  phone: phoneField.optional(),
  address: lineField(LIMITS.address).optional(),
  serviceInterest: lineField(LIMITS.serviceInterest).optional(),
  message: textField(LIMITS.message).optional(),
  source: z.enum(MANUAL_SOURCES).default('MANUAL'),
  ownerId: uuid.optional()
})

export type CreateBody = z.output<typeof createBody>

export const patchBody = z
  .strictObject({
    companyName: lineField(LIMITS.name).optional(),
    contactName: lineField(LIMITS.name).optional(),
    email: emailField.optional(),
    phone: phoneField.nullable().optional(),
    address: lineField(LIMITS.address).nullable().optional(),
    serviceInterest: lineField(LIMITS.serviceInterest).nullable().optional(),
    ownerId: uuid.optional()
  })
  .refine(value => Object.keys(value).length > 0, 'Provide at least one field to update.')

export type PatchBody = z.output<typeof patchBody>

export const statusBody = z
  .strictObject({
    status: z.enum(LEAD_STATUSES),
    lostReason: textField(LIMITS.lostReason).optional()
  })
  .superRefine((value, ctx) => {
    if (value.status === 'LOST' && !value.lostReason) {
      ctx.addIssue({ code: 'custom', path: ['lostReason'], message: 'A reason is required when marking a lead as lost.' })
    }

    if (value.status !== 'LOST' && value.lostReason) {
      ctx.addIssue({ code: 'custom', path: ['lostReason'], message: 'Only send a reason when the status is LOST.' })
    }
  })

export type StatusBody = z.output<typeof statusBody>

export const activityBody = z.strictObject({
  type: z.enum(['CALL', 'EMAIL', 'SITE_VISIT', 'NOTE']),
  body: textField(LIMITS.activityBody)
})

export type ActivityBody = z.output<typeof activityBody>

export const activitiesQuery = z.strictObject({ ...pageQueryShape })

export const leadParams = z.strictObject({ id: uuid })
export const surveyParams = z.strictObject({ id: uuid, surveyId: uuid })

// ---- surveys ------------------------------------------------------------------

const QTY_PATTERN = /^\d{1,6}(\.\d{1,2})?$/

/** Only called on text that matches QTY_PATTERN, so `D()` cannot throw. */
const isPositiveWithinLimit = (value: string): boolean => D(value).gt(0) && D(value).lte(100_000)

/** Positive quantity, at most 2 decimals (contract lines store 2), at most 100000. Kept as a canonical string. */
const unitQtyField = z
  .union([z.string().trim(), z.number()])
  .transform(value => String(value))
  .refine(value => QTY_PATTERN.test(value) && isPositiveWithinLimit(value), 'Quantity must be greater than 0 and at most 100000, with at most 2 decimals.')
  .transform(value => D(value).toFixed())

const unit = z.strictObject({
  name: lineField(LIMITS.name),
  serviceId: uuid.optional(),
  qty: unitQtyField,
  estMinutes: z.number().int().min(1).max(1440).optional(),
  notes: textField(LIMITS.unitNotes).optional()
})

export const surveyBody = z.strictObject({
  address: lineField(LIMITS.address),
  units: z.array(unit).min(1, 'Add at least one unit.').max(LIMITS.units),
  accessNotes: textField(LIMITS.accessNotes).optional(),
  photoFileIds: z.array(uuid).max(LIMITS.photos).optional()
})

export type SurveyBody = z.output<typeof surveyBody>
export type SurveyUnit = SurveyBody['units'][number]

/** Shape of `units` as stored, re-validated on read so a malformed row can never crash a conversion. */
export const storedUnits = z.array(
  z.object({
    name: z.string(),
    serviceId: z.string().optional(),
    qty: z.string(),
    estMinutes: z.number().optional(),
    notes: z.string().optional()
  })
)

// ---- convert ------------------------------------------------------------------

export const convertBody = z
  .strictObject({
    clientLegalName: lineField(LIMITS.name).optional(),
    billingEmail: emailField.optional(),
    paymentTerms: z.enum(['NET15', 'NET30', 'DUE_ON_RECEIPT']).default('NET30'),
    billingType: z.enum(['PER_VISIT', 'HOURLY', 'MONTHLY_FIXED']),
    billingCycle: z.enum(['PER_VISIT', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']),
    startDate: dateOnlyField,
    endDate: dateOnlyField.optional()
  })
  .refine(value => !value.endDate || value.endDate >= value.startDate, { message: 'End date must not be before the start date.', path: ['endDate'] })

export type ConvertBody = z.output<typeof convertBody>
