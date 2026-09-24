import { z } from 'zod'

import { pageQueryShape } from '../../lib/pagination.js'
import { instantField } from '../../lib/time.js'
import { latField, lngField } from './geo.js'

const MAX_BREAK_MINUTES = 24 * 60
const MAX_TEXT = 1000

const breakField = z.number().int('Break must be whole minutes.').min(0).max(MAX_BREAK_MINUTES)
const reasonField = z.string().trim().min(1, 'A reason is required.').max(MAX_TEXT)
const noteField = z.string().trim().min(1).max(MAX_TEXT)

const timesheetStatus = z.enum(['OPEN', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ADJUSTED', 'CORRECTED', 'INVOICED'])
const exceptionType = z.enum(['LATE_IN', 'EARLY_OUT', 'OVERTIME', 'GEOFENCE_MISS', 'MISSING_CLOCK_OUT', 'NO_SHOW'])
const queryBoolean = z.enum(['true', 'false']).transform(value => value === 'true')

/** GPS is optional (a phone may have it switched off) but a point is always a pair. */
const gpsShape = { lat: latField.optional(), lng: lngField.optional() }
const gpsIsPair = (value: { lat?: number; lng?: number }) => (value.lat === undefined) === (value.lng === undefined)
const gpsPairIssue = { message: 'Send lat and lng together, or neither.', path: ['lng'] }

export const clockInBody = z.strictObject(gpsShape).refine(gpsIsPair, gpsPairIssue)

export const clockOutBody = z.strictObject({ ...gpsShape, breakMinutes: breakField.optional() }).refine(gpsIsPair, gpsPairIssue)

export const adjustBody = z
  .strictObject({
    clockInAt: instantField.optional(),
    clockOutAt: instantField.optional(),
    breakMinutes: breakField.optional(),
    billable: z.boolean().optional(),
    payable: z.boolean().optional(),
    reason: reasonField
  })
  .refine(value => Object.entries(value).some(([key, field]) => key !== 'reason' && field !== undefined), 'Provide at least one change.')

export const correctBody = z
  .strictObject({
    clockInAt: instantField.optional(),
    clockOutAt: instantField.optional(),
    breakMinutes: breakField.optional(),
    note: noteField.optional()
  })
  .refine(value => Object.values(value).some(field => field !== undefined), 'Provide at least one change.')

export const rejectBody = z.strictObject({ reason: reasonField })

export const emptyBody = z.strictObject({})

export const resolveBody = z.strictObject({ note: noteField.optional() })

export const approveBatchBody = z.strictObject({ ids: z.array(z.uuid('Invalid id.')).min(1).max(100) })

const rangeIsOrdered = (value: { from?: Date; to?: Date }) => !value.from || !value.to || value.from < value.to
const rangeIssue = { message: '`from` must be before `to`.', path: ['to'] }

export const mineQuery = z
  .strictObject({ ...pageQueryShape, status: timesheetStatus.optional(), from: instantField.optional(), to: instantField.optional() })
  .refine(rangeIsOrdered, rangeIssue)

export const listQuery = z
  .strictObject({
    ...pageQueryShape,
    status: timesheetStatus.optional(),
    siteId: z.uuid().optional(),
    userId: z.uuid().optional(),
    hasOpenExceptions: queryBoolean.optional(),
    from: instantField.optional(),
    to: instantField.optional()
  })
  .refine(rangeIsOrdered, rangeIssue)

export const queueQuery = z.strictObject({
  ...pageQueryShape,
  type: exceptionType.optional(),
  siteId: z.uuid().optional(),
  userId: z.uuid().optional()
})

const items = z
  .array(z.strictObject({ label: z.string().trim().min(1).max(200), done: z.boolean() }))
  .min(1, 'A checklist needs at least one item.')
  .max(100)

export const workLogBody = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('PHOTO'), fileId: z.uuid('Invalid file id.'), body: z.string().trim().min(1).max(4000).optional() }),
  z.strictObject({ kind: z.literal('NOTE'), body: z.string().trim().min(1, 'Write something.').max(4000) }),
  z.strictObject({ kind: z.literal('ISSUE'), body: z.string().trim().min(1, 'Describe the issue.').max(4000) }),
  z.strictObject({ kind: z.literal('CHECKLIST'), data: z.strictObject({ items }) })
])

export const workLogListQuery = z.strictObject({ ...pageQueryShape })

export type ClockInBody = z.output<typeof clockInBody>
export type ClockOutBody = z.output<typeof clockOutBody>
export type AdjustBody = z.output<typeof adjustBody>
export type CorrectBody = z.output<typeof correctBody>
export type WorkLogBody = z.output<typeof workLogBody>
export type ListQuery = z.output<typeof listQuery>
export type MineQuery = z.output<typeof mineQuery>
export type QueueQuery = z.output<typeof queueQuery>
