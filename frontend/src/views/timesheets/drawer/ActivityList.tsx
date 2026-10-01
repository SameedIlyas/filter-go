'use client'

// MUI Imports
import Typography from '@mui/material/Typography'

// Type Imports
import type { TimesheetActivity } from '@/types/timesheetTypes'

import { formatStamp, useTimesheetRole } from '../shared'

/** Labels per audit action: the timesheet's own events, then the shift's scheduling events. */
export const ACTIVITY_META: Record<string, { label: string; icon: string }> = {
  clocked_in: { label: 'Clocked in', icon: 'bx-log-in' },
  clocked_out: { label: 'Clocked out', icon: 'bx-log-out' },
  adjusted: { label: 'Adjusted the times', icon: 'bx-edit' },
  rejected: { label: 'Rejected', icon: 'bx-x-circle' },
  corrected: { label: 'Corrected by the worker', icon: 'bx-revision' },
  resubmitted: { label: 'Resubmitted', icon: 'bx-send' },
  approved: { label: 'Approved', icon: 'bx-check-circle' },
  auto_closed: { label: 'Closed automatically at the scheduled end', icon: 'bx-stopwatch' },
  no_show: { label: 'Marked as a no-show', icon: 'bx-user-x' },
  exception_resolved: { label: 'Resolved an exception', icon: 'bx-check-shield' },
  created: { label: 'Added the shift', icon: 'bx-plus' },
  updated: { label: 'Changed the shift', icon: 'bx-calendar-edit' },
  assigned: { label: 'Assigned the shift', icon: 'bx-user-check' },
  assign_override: { label: 'Assigned despite warnings', icon: 'bx-error' },
  unassigned: { label: 'Unassigned the shift', icon: 'bx-user-minus' },
  confirmed: { label: 'Confirmed the shift', icon: 'bx-check-double' },
  offered: { label: 'Offered the shift', icon: 'bx-send' },
  extra_added: { label: 'Logged as extra work', icon: 'bx-time' }
}


/** The trail behind the entry (UAT "Activity Logs"), oldest first. A null actor is the system sweep. */
const ActivityList = ({ activity, zone }: { activity: TimesheetActivity[]; zone: string }) => {
  const { session } = useTimesheetRole()

  if (activity.length === 0) return <Typography color='text.secondary'>No activity yet.</Typography>

  const actorName = (item: TimesheetActivity) => {
    if (!item.actor) return 'System'

    return item.actor.id === session?.id ? 'You' : item.actor.name
  }

  return (
    <div className='flex flex-col gap-4'>
      {activity.map(item => {
        const meta = ACTIVITY_META[item.action] ?? { label: item.action.replace(/_/g, ' '), icon: 'bx-info-circle' }

        return (
          <div key={item.id} className='flex gap-3'>
            <i className={`${meta.icon} text-xl`} />
            <div className='flex flex-col'>
              <Typography color='text.primary'>{meta.label}</Typography>
              {item.reason && (
                <Typography variant='body2' color='text.secondary'>
                  “{item.reason}”
                </Typography>
              )}
              <Typography variant='caption' color='text.disabled'>
                {formatStamp(item.at, zone)} · {actorName(item)}
              </Typography>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ActivityList
