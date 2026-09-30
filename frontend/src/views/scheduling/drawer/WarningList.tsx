// Next Imports
import Link from 'next/link'

// MUI Imports
import Alert from '@mui/material/Alert'

// Type Imports
import type { AssignmentWarning, BlockingIssue } from '@/types/scheduleTypes'

import { WARNING_META } from '../shared'

const detail = (warning: AssignmentWarning) => {
  const data = warning.data ?? {}

  if (warning.code === 'OVERTIME' && typeof data.weeklyMinutes === 'number') {
    return ` (${Math.round((data.weeklyMinutes / 60) * 10) / 10}h this week)`
  }

  if ((warning.code === 'DOCUMENT_EXPIRED' || warning.code === 'DOCUMENT_EXPIRING') && typeof data.expiresAt === 'string') {
    return ` (${String(data.type ?? 'document')}, ${data.expiresAt})`
  }

  return ''
}

/** Overridable problems with an assignment, one line each. */
export const WarningList = ({ warnings }: { warnings: AssignmentWarning[] }) => (
  <div className='flex flex-col gap-2'>
    {warnings.map(warning => (
      <Alert key={warning.code} severity='warning' icon={<i className={WARNING_META[warning.code]?.icon ?? 'bx-error'} />}>
        <strong>{WARNING_META[warning.code]?.label ?? warning.code}</strong>
        {detail(warning)}: {warning.message}
      </Alert>
    ))}
  </div>
)

/** Problems that always stop an assignment. */
export const BlockingList = ({ issues }: { issues: BlockingIssue[] }) => (
  <div className='flex flex-col gap-2'>
    {issues.map(issue => (
      <Alert key={issue.code} severity='error'>
        {issue.message}
        {issue.code === 'SHIFT_OVERLAP' && typeof issue.data?.shiftId === 'string' ? (
          <>
            {' '}
            <Link href={`/schedules?shift=${issue.data.shiftId}`} className='font-medium underline'>
              View the other shift
            </Link>
          </>
        ) : null}
      </Alert>
    ))}
  </div>
)
