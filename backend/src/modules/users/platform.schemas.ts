import { z } from 'zod'

import { pageQueryShape } from '../../lib/pagination.js'
import { dateOnlyField, timeOfDayField } from '../../lib/time.js'
import { roleField } from './admin.routes.js'

export const MAX_WINDOWS = 70
export const MAX_SITES_PER_USER = 500

export const directoryQuery = z.strictObject({
  ...pageQueryShape,
  q: z.string().trim().max(100).optional(),
  role: roleField.optional(),
  status: z.enum(['INVITED', 'ACTIVE', 'DISABLED']).optional(),
  siteId: z.uuid().optional()
})

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

const windowSchema = z.strictObject({
  weekday: z.number().int().min(1).max(7),
  startTime: timeOfDayField,
  endTime: timeOfDayField
})

export type AvailabilityWindow = z.output<typeof windowSchema>

export const compareWindows = (a: AvailabilityWindow, b: AvailabilityWindow): number =>
  a.weekday - b.weekday || a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime)

export const availabilityBody = z
  .strictObject({ windows: z.array(windowSchema).max(MAX_WINDOWS) })
  .superRefine((value, ctx) => {
    const sorted = value.windows.map((window, index) => ({ window, index })).sort((a, b) => compareWindows(a.window, b.window))

    for (const { window, index } of sorted) {
      if (window.startTime >= window.endTime) {
        ctx.addIssue({ code: 'custom', path: ['windows', index, 'endTime'], message: 'The end time must be after the start time.' })
      }
    }

    sorted.forEach((current, position) => {
      const previous = sorted[position - 1]

      // Windows that only touch (12:00 end, 12:00 start) are fine; sharing any minute is not
      if (previous && previous.window.weekday === current.window.weekday && current.window.startTime < previous.window.endTime) {
        ctx.addIssue({ code: 'custom', path: ['windows', current.index, 'startTime'], message: 'This window overlaps another window on the same weekday.' })
      }
    })
  })

// ---------------------------------------------------------------------------
// Site access
// ---------------------------------------------------------------------------

export const siteAccessBody = z.strictObject({ siteIds: z.array(z.uuid()).max(MAX_SITES_PER_USER) })

// ---------------------------------------------------------------------------
// Documents and compliance
// ---------------------------------------------------------------------------

const documentType = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Type is required.')
  .max(60, 'Type must be at most 60 characters.')
  .refine(value => !/\p{C}/u.test(value), 'Type contains invalid characters.')

const notes = z.string().trim().max(1000)

export const createDocumentBody = z.strictObject({
  type: documentType,
  fileId: z.uuid().nullable().optional(),
  expiresAt: dateOnlyField.nullable().optional(),
  notes: notes.nullable().optional()
})

export const updateDocumentBody = z
  .strictObject({
    type: documentType.optional(),
    fileId: z.uuid().nullable().optional(),
    expiresAt: dateOnlyField.nullable().optional(),
    notes: notes.nullable().optional()
  })
  .refine(value => Object.keys(value).length > 0, 'Provide at least one field to update.')

export const documentParams = z.strictObject({ id: z.uuid('Invalid id.'), documentId: z.uuid('Invalid id.') })

export const expiringQuery = z.strictObject({
  ...pageQueryShape,
  days: z.coerce.number().int().min(0).max(3650).default(30)
})

export type CreateDocumentInput = z.output<typeof createDocumentBody>
export type UpdateDocumentInput = z.output<typeof updateDocumentBody>
