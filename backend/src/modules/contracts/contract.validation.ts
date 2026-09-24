import type { Contract, ContractCoverage, ContractLine } from '../../generated/prisma/client.js'
import type { FieldIssue } from '../../lib/errors.js'
import { fromDateOnly } from '../../lib/time.js'

/** Everything the submit step needs to judge a draft, loaded by the caller (rows already in request order). */
export interface CompletenessInput {
  contract: Pick<Contract, 'startDate' | 'endDate' | 'billingType' | 'billingCycle'>
  lines: ContractLine[]
  coverage: ContractCoverage[]
  /** Ids of the sites that belong to the contract's client. */
  clientSiteIds: Set<string>
  /** Codes present in the organization's tax_rates. */
  taxCodes: Set<string>
}

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/

const issue = (field: string, code: string, message: string): FieldIssue => ({ field, code, message })

const lineIssues = (input: CompletenessInput): FieldIssue[] => {
  const { lines, clientSiteIds, taxCodes } = input
  const issues: FieldIssue[] = lines.length === 0 ? [issue('lines', 'required', 'Add at least one line before submitting.')] : []

  lines.forEach((line, index) => {
    if (!clientSiteIds.has(line.siteId)) {
      issues.push(issue(`lines[${index}].siteId`, 'site_not_in_client', "This site does not belong to the contract's client."))
    }

    if (!line.billRate.gt(0)) issues.push(issue(`lines[${index}].billRate`, 'must_be_positive', 'The bill rate must be greater than 0.'))

    if (!line.qty.gt(0)) issues.push(issue(`lines[${index}].qty`, 'must_be_positive', 'The quantity must be greater than 0.'))

    if (line.taxCode && !taxCodes.has(line.taxCode)) {
      issues.push(issue(`lines[${index}].taxCode`, 'tax_code_not_found', `Tax code ${line.taxCode} does not exist.`))
    }
  })

  return issues
}

/** An hourly shift needs one unambiguous rate: the second and later lines of a site are the offenders. */
const hourlyIssues = ({ contract, lines }: CompletenessInput): FieldIssue[] => {
  if (contract.billingType !== 'HOURLY') return []

  const seen = new Set<string>()

  return lines.flatMap((line, index): FieldIssue[] => {
    if (!seen.has(line.siteId)) {
      seen.add(line.siteId)

      return []
    }

    return [issue(`lines[${index}].siteId`, 'one_line_per_site', 'An hourly contract can have only one line per site.')]
  })
}

const billingIssues = ({ contract }: CompletenessInput): FieldIssue[] => {
  const issues: FieldIssue[] = []

  if (contract.billingType === 'MONTHLY_FIXED' && contract.billingCycle === 'PER_VISIT') {
    issues.push(issue('billingCycle', 'invalid_combination', 'A monthly fixed contract cannot be billed per visit.'))
  }

  if (contract.endDate && fromDateOnly(contract.endDate) < fromDateOnly(contract.startDate)) {
    issues.push(issue('endDate', 'before_start', 'The end date must be on or after the start date.'))
  }

  return issues
}

const weeklyIssues = (row: ContractCoverage, path: string): FieldIssue[] => {
  const issues: FieldIssue[] = []
  const invalidDay = row.weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7)

  if (row.weekdays.length === 0) issues.push(issue(`${path}.weekdays`, 'required', 'Pick at least one weekday.'))
  else if (invalidDay) issues.push(issue(`${path}.weekdays`, 'invalid_weekday', 'Weekdays must be 1 (Monday) to 7 (Sunday).'))
  else if (new Set(row.weekdays).size !== row.weekdays.length) issues.push(issue(`${path}.weekdays`, 'duplicate_weekday', 'Each weekday can appear only once.'))

  for (const [key, value] of [['timeStart', row.timeStart], ['timeEnd', row.timeEnd]] as const) {
    if (!value) issues.push(issue(`${path}.${key}`, 'required', 'A weekly pattern needs a start and an end time.'))
    else if (!TIME_OF_DAY.test(value)) issues.push(issue(`${path}.${key}`, 'invalid_time', 'Use 24-hour HH:mm.'))
  }

  if (row.timeStart && row.timeStart === row.timeEnd) {
    issues.push(issue(`${path}.timeEnd`, 'must_differ', 'The end time must differ from the start time.'))
  }

  return issues
}

const coverageRowIssues = (row: ContractCoverage, index: number): FieldIssue[] => {
  const path = `coverage[${index}]`

  if (row.patternType === 'WEEKLY') return weeklyIssues(row, path)

  if (row.patternType === 'INTERVAL' && !(row.intervalDays !== null && row.intervalDays >= 1)) {
    return [issue(`${path}.intervalDays`, 'must_be_positive', 'An interval pattern needs intervalDays of at least 1.')]
  }

  if (row.patternType === 'AD_HOC' && !(row.visitsPerPeriod !== null && row.visitsPerPeriod >= 1)) {
    return [issue(`${path}.visitsPerPeriod`, 'must_be_positive', 'An ad-hoc pattern needs visitsPerPeriod of at least 1.')]
  }

  return []
}

/** Every site that has lines needs at least one coverage row (an AD_HOC row counts: shifts are then added by hand). */
const coverageIssues = ({ lines, coverage, clientSiteIds }: CompletenessInput): FieldIssue[] => {
  const covered = new Set(coverage.map(row => row.siteId))
  const uncovered = [...new Set(lines.map(line => line.siteId))].filter(siteId => !covered.has(siteId))

  return [
    ...uncovered.map(siteId => issue('coverage', 'site_without_coverage', `Site ${siteId} has lines but no coverage.`)),
    ...coverage.flatMap((row, index): FieldIssue[] =>
      clientSiteIds.has(row.siteId) ? [] : [issue(`coverage[${index}].siteId`, 'site_not_in_client', "This site does not belong to the contract's client.")]
    ),
    ...coverage.flatMap(coverageRowIssues)
  ]
}

/** ARCHITECTURE 4.3. Returns every problem at once, in a stable order. Empty = the draft may be submitted. */
export const completenessIssues = (input: CompletenessInput): FieldIssue[] => [
  ...lineIssues(input),
  ...hourlyIssues(input),
  ...billingIssues(input),
  ...coverageIssues(input)
]
