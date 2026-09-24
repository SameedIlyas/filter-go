import { z } from 'zod'

import { D } from '../../lib/money.js'
import { pageQueryShape } from '../../lib/pagination.js'
import { dateOnlyField, instantField } from '../../lib/time.js'

const SHIFT_STATUSES = ['OPEN', 'ASSIGNED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED'] as const
const SCHEDULE_STATUSES = ['DRAFT', 'PUBLISHED', 'LOCKED', 'CLOSED'] as const

const notesField = z.string().trim().max(1000)
const reasonField = z.string().trim().min(1, 'A reason is required.').max(500)

/** Visit quantity: up to 2 decimals (the column is numeric(12,2)). */
const billableQtyField = z
  .union([z.string().trim(), z.number()])
  .transform(value => String(value))
  .refine(value => /^\d{1,8}(\.\d{1,2})?$/.test(value), 'Enter a quantity with at most 2 decimals, e.g. "1" or "2.50".')
  .transform(value => D(value))

const booleanQuery = z.enum(['true', 'false']).transform(value => value === 'true')

export const emptyBody = z.strictObject({})

export const generateBody = z.strictObject({
  contractId: z.uuid(),
  siteId: z.uuid(),
  periodStart: dateOnlyField,
  periodEnd: dateOnlyField,
  supervisorId: z.uuid().optional()
})

export const scheduleListQuery = z.strictObject({
  ...pageQueryShape,
  status: z.enum(SCHEDULE_STATUSES).optional(),
  contractId: z.uuid().optional(),
  siteId: z.uuid().optional(),
  from: dateOnlyField.optional(),
  to: dateOnlyField.optional()
})

export const shiftListQuery = z.strictObject({
  ...pageQueryShape,
  scheduleId: z.uuid().optional(),
  siteId: z.uuid().optional(),
  userId: z.uuid().optional(),
  status: z.enum(SHIFT_STATUSES).optional(),
  from: instantField.optional(),
  to: instantField.optional(),
  isExtra: booleanQuery.optional(),
  unassigned: booleanQuery.optional()
})

export const myShiftsQuery = z.strictObject({
  ...pageQueryShape,
  status: z.enum(SHIFT_STATUSES).optional(),
  from: instantField.optional(),
  to: instantField.optional()
})

export const pageOnlyQuery = z.strictObject(pageQueryShape)

const overrideFields = {
  overrideWarnings: z.boolean().optional(),
  reason: reasonField.optional()
}

export const addShiftBody = z.strictObject({
  start: instantField,
  end: instantField,
  notes: notesField.optional(),
  assignedUserId: z.uuid().optional(),
  isExtra: z.boolean().optional(),
  billableQty: billableQtyField.optional(),
  ...overrideFields
})

export const patchShiftBody = z
  .strictObject({
    start: instantField.optional(),
    end: instantField.optional(),
    notes: notesField.nullable().optional(),
    billableQty: billableQtyField.nullable().optional()
  })
  .refine(value => Object.keys(value).length > 0, 'Provide at least one field to update.')

export const validateAssignmentBody = z.strictObject({ userId: z.uuid() })

export const assignBody = z.strictObject({ userId: z.uuid(), ...overrideFields })

export const cancelBody = z.strictObject({ reason: reasonField })

export const offersBody = z.strictObject({
  userIds: z
    .array(z.uuid())
    .min(1)
    .max(50)
    .refine(ids => new Set(ids).size === ids.length, 'Each person can only be listed once.')
})

export const extraShiftBody = z.strictObject({
  scheduleId: z.uuid(),
  start: instantField,
  end: instantField,
  notes: notesField.optional()
})

export const coverageQuery = z.strictObject({
  from: dateOnlyField.optional(),
  to: dateOnlyField.optional(),
  siteId: z.uuid().optional(),
  unfilledLimit: z.coerce.number().int().min(1).max(100).default(20)
})

export type GenerateInput = z.output<typeof generateBody>
export type ScheduleListQuery = z.output<typeof scheduleListQuery>
export type ShiftListQuery = z.output<typeof shiftListQuery>
export type AddShiftInput = z.output<typeof addShiftBody>
export type PatchShiftInput = z.output<typeof patchShiftBody>
export type AssignInput = z.output<typeof assignBody>
export type ExtraShiftInput = z.output<typeof extraShiftBody>
export type CoverageQuery = z.output<typeof coverageQuery>
