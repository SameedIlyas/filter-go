// Type Imports
import type { LeadSurvey, SurveyInput } from '@/types/leadTypes'

/** Mirrors the survey schema of the API (`LIMITS` in `leads.schemas.ts`). */
export const SURVEY_LIMITS = {
  address: 500,
  units: 200,
  unitName: 200,
  unitNotes: 1000,
  accessNotes: 2000,
  photos: 20,
  estMinutes: 1440,
  qty: 100_000,
  photoBytes: 10 * 1024 * 1024
} as const

/** What the file API stores; HEIC from some browsers arrives without a type, so the extension is checked too. */
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

const QTY = /^\d{1,6}(\.\d{1,2})?$/
const CONTROL_CHARS = /[\p{C}]/u
const MULTILINE_CONTROL_CHARS = /[^\P{C}\n\r\t]/u
const UNIT_FIELD = /^units\.\d+\.(serviceId|name|qty|estMinutes|notes)$/

export type UnitRow = { key: string; serviceId: string; name: string; qty: string; estMinutes: string; notes: string }

/** Messages keyed by the API's issue path: `address`, `units`, `units.2.qty`, `photoFileIds`... */
export type SurveyErrors = Record<string, string>

let keySeq = 0
const nextKey = () => `unit-${++keySeq}`

export const emptyUnit = (): UnitRow => ({
  key: nextKey(),
  serviceId: '',
  name: '',
  qty: '1',
  estMinutes: '',
  notes: ''
})

export const toUnitRows = (survey: LeadSurvey | null): UnitRow[] =>
  survey?.units.length
    ? survey.units.map(unit => ({
        key: nextKey(),
        serviceId: unit.serviceId ?? '',
        name: unit.name,
        qty: unit.qty,
        estMinutes: unit.estMinutes ? String(unit.estMinutes) : '',
        notes: unit.notes ?? ''
      }))
    : [emptyUnit()]

export const isAcceptedPhoto = (file: File) =>
  (PHOTO_TYPES.includes(file.type) || /\.(heic|heif)$/i.test(file.name)) && file.size <= SURVEY_LIMITS.photoBytes

/** "units[0].qty" and "units.0.qty" both become "units.0.qty"; a photo's index is dropped ("photoFileIds"). */
export const issueKey = (field: string) =>
  field.replace(/\[(\d+)\]/g, '.$1').replace(/^photoFileIds\.\d+$/, 'photoFileIds')

/** Whether the dialog shows this key next to a field (anything else goes in the form-level alert). */
export const isFieldKey = (key: string) =>
  ['address', 'accessNotes', 'units', 'photoFileIds'].includes(key) || UNIT_FIELD.test(key)

const textError = (value: string, max: number, multiline = false) => {
  if (value.length > max) return `Must be at most ${max} characters.`

  return (multiline ? MULTILINE_CONTROL_CHARS : CONTROL_CHARS).test(value) ? 'Contains invalid characters.' : undefined
}

const unitErrors = (unit: UnitRow, index: number): SurveyErrors => {
  const errors: SurveyErrors = {}
  const qty = unit.qty.trim()
  const minutes = Number(unit.estMinutes)
  const name = unit.name.trim() ? textError(unit.name.trim(), SURVEY_LIMITS.unitName) : 'Required.'
  const notes = textError(unit.notes.trim(), SURVEY_LIMITS.unitNotes, true)

  if (name) errors[`units.${index}.name`] = name
  if (notes) errors[`units.${index}.notes`] = notes

  if (!QTY.test(qty) || Number(qty) <= 0 || Number(qty) > SURVEY_LIMITS.qty) {
    errors[`units.${index}.qty`] = `Above 0 and at most ${SURVEY_LIMITS.qty}, up to 2 decimals.`
  }

  if (unit.estMinutes && !(Number.isInteger(minutes) && minutes >= 1 && minutes <= SURVEY_LIMITS.estMinutes)) {
    errors[`units.${index}.estMinutes`] = `Whole minutes, 1 to ${SURVEY_LIMITS.estMinutes}.`
  }

  return errors
}

/** Client-side checks that mirror the API schema, so obvious mistakes never make a round trip. */
export const validateSurvey = (
  address: string,
  units: UnitRow[],
  accessNotes: string,
  photoCount: number
): SurveyErrors => {
  const errors: SurveyErrors = units.reduce<SurveyErrors>(
    (all, unit, index) => ({ ...all, ...unitErrors(unit, index) }),
    {}
  )

  const addressError = address.trim() ? textError(address.trim(), SURVEY_LIMITS.address) : 'Required.'
  const notesError = textError(accessNotes.trim(), SURVEY_LIMITS.accessNotes, true)

  if (addressError) errors.address = addressError
  if (notesError) errors.accessNotes = notesError
  if (units.length === 0) errors.units = 'Add at least one unit.'
  if (units.length > SURVEY_LIMITS.units) errors.units = `At most ${SURVEY_LIMITS.units} units per survey.`
  if (photoCount > SURVEY_LIMITS.photos) errors.photoFileIds = `At most ${SURVEY_LIMITS.photos} photos per survey.`

  return errors
}

export const toSurveyInput = (
  address: string,
  units: UnitRow[],
  accessNotes: string,
  photoFileIds: string[]
): SurveyInput => ({
  address: address.trim(),
  ...(accessNotes.trim() ? { accessNotes: accessNotes.trim() } : {}),
  units: units.map(unit => ({
    name: unit.name.trim(),
    ...(unit.serviceId ? { serviceId: unit.serviceId } : {}),
    qty: unit.qty.trim(),
    ...(unit.estMinutes ? { estMinutes: Number(unit.estMinutes) } : {}),
    ...(unit.notes.trim() ? { notes: unit.notes.trim() } : {})
  })),
  photoFileIds
})
