import type { WorkLogInput, WorkLogKind } from '@/types/timesheetTypes'

/*
 * The work log form (docs/ARCHITECTURE.md 6.2): PHOTO needs an uploaded file, NOTE and ISSUE need text, CHECKLIST
 * needs 1..100 labelled items. These mirror the backend limits so the worker sees the problem before sending.
 */

export const MAX_BODY = 4000
export const MAX_LABEL = 200
export const MAX_ITEMS = 100

export type ChecklistItem = { label: string; done: boolean }

export type WorkLogForm = {
  kind: WorkLogKind
  body: string
  items: ChecklistItem[]

  /** Set once the photo has been uploaded. */
  fileId: string | null
}

export const emptyWorkLogForm = (kind: WorkLogKind = 'NOTE'): WorkLogForm => ({ kind, body: '', items: [{ label: '', done: false }], fileId: null })

export type WorkLogResult = { ok: true; input: WorkLogInput } | { ok: false; error: string }

const checklist = (items: ChecklistItem[]): WorkLogResult => {
  const filled = items.map(item => ({ label: item.label.trim(), done: item.done })).filter(item => item.label)

  if (filled.length === 0) return { ok: false, error: 'Add at least one checklist item.' }
  if (filled.length > MAX_ITEMS) return { ok: false, error: `A checklist can have at most ${MAX_ITEMS} items.` }
  if (filled.some(item => item.label.length > MAX_LABEL)) return { ok: false, error: `Keep each item under ${MAX_LABEL} characters.` }

  return { ok: true, input: { kind: 'CHECKLIST', data: { items: filled } } }
}

/** The request body for the form, or why it cannot be sent yet. Blank checklist rows are dropped. */
export const buildWorkLog = (form: WorkLogForm): WorkLogResult => {
  const body = form.body.trim()

  if (body.length > MAX_BODY) return { ok: false, error: `Keep it under ${MAX_BODY} characters.` }

  switch (form.kind) {
    case 'NOTE':
      return body ? { ok: true, input: { kind: 'NOTE', body } } : { ok: false, error: 'Write something first.' }
    case 'ISSUE':
      return body ? { ok: true, input: { kind: 'ISSUE', body } } : { ok: false, error: 'Describe the issue first.' }
    case 'PHOTO':
      return form.fileId ? { ok: true, input: { kind: 'PHOTO', fileId: form.fileId, ...(body ? { body } : {}) } } : { ok: false, error: 'Choose a photo first.' }
    case 'CHECKLIST':
      return checklist(form.items)
    default:
      return { ok: false, error: 'Pick what to log.' }
  }
}
