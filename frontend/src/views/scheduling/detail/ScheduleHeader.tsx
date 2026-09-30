'use client'

// React Imports
import { useState } from 'react'

// Next Imports
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { Schedule } from '@/types/scheduleTypes'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'
import { ConfirmDialog } from '@views/contracts/detail/ActionDialogs'

// Lib Imports
import { useDeleteSchedule, useScheduleTransition, useStaffOptions } from '@/libs/api/queries/scheduling'

import { toastSchedulingError } from '../notify'
import { scheduleActions } from '../logic/lifecycle'
import type { ScheduleAction, ScheduleActionName } from '../logic/lifecycle'
import { todayKey } from '../logic/zoned'
import { SCHEDULE_STATUS_META, ScheduleStatusChip, formatPeriod } from '../shared'

const ACTION_META: Record<ScheduleActionName, { label: string; icon: string; done: string }> = {
  publish: { label: 'Publish', icon: 'bx-broadcast', done: 'Schedule published' },
  unpublish: { label: 'Unpublish', icon: 'bx-undo', done: 'Schedule is a draft again' },
  lock: { label: 'Lock', icon: 'bx-lock-alt', done: 'Schedule locked' },
  close: { label: 'Close', icon: 'bx-archive', done: 'Schedule closed' },
  regenerate: { label: 'Regenerate', icon: 'bx-refresh', done: 'Schedule regenerated' },
  delete: { label: 'Delete', icon: 'bx-trash', done: 'Schedule deleted' }
}

const STAMPS: Array<{ key: 'publishedAt' | 'lockedAt' | 'closedAt'; label: string }> = [
  { key: 'publishedAt', label: 'Published' },
  { key: 'lockedAt', label: 'Locked' },
  { key: 'closedAt', label: 'Closed' }
]

const ActionButton = ({ item, busy, onClick }: { item: ScheduleAction; busy: boolean; onClick: () => void }) => {
  const meta = ACTION_META[item.action]

  const button = (
    <Button
      variant={item.primary ? 'contained' : 'tonal'}
      color={item.destructive ? 'error' : item.primary ? 'primary' : 'secondary'}
      startIcon={<i className={meta.icon} />}
      disabled={!item.enabled || busy}
      onClick={onClick}
    >
      {meta.label}
    </Button>
  )

  // A disabled button fires no events, so the tooltip needs a wrapper
  return item.enabled || !item.reason ? (
    button
  ) : (
    <Tooltip title={item.reason}>
      <span>{button}</span>
    </Tooltip>
  )
}

/** The schedule's identity, timestamps and lifecycle buttons (exactly those `scheduleActions` allows). */
const ScheduleHeader = ({ schedule }: { schedule: Schedule }) => {
  const router = useRouter()
  const transition = useScheduleTransition(schedule.id)
  const remove = useDeleteSchedule()
  const staff = useStaffOptions()
  const [confirm, setConfirm] = useState<ScheduleAction | null>(null)

  const busy = transition.isPending || remove.isPending

  // Primary action last, like the other detail pages
  const actions = [...scheduleActions(schedule, todayKey())].sort((a, b) => Number(!!a.primary) - Number(!!b.primary))

  const supervisor = schedule.supervisorId
    ? staff.data?.find(user => user.id === schedule.supervisorId)?.name
    : undefined

  const run = async (name: ScheduleActionName) => {
    try {
      if (name === 'delete') {
        await remove.mutateAsync(schedule.id)
        toast.success(ACTION_META.delete.done)
        router.push('/schedules/list')

        return
      }

      const result = await transition.mutateAsync(name)

      toast.success(
        name === 'regenerate' && result.shiftCount !== undefined
          ? `Schedule regenerated with ${result.shiftCount} shift${result.shiftCount === 1 ? '' : 's'}`
          : ACTION_META[name].done
      )
    } catch (error) {
      toastSchedulingError(error)
    } finally {
      setConfirm(null)
    }
  }

  return (
    <Card>
      <CardContent className='flex flex-wrap items-start justify-between gap-4'>
        <div className='flex items-center gap-4'>
          <CustomAvatar skin='light' color={SCHEDULE_STATUS_META[schedule.status].color} size={56} variant='rounded'>
            <i className='bx-calendar text-3xl' />
          </CustomAvatar>
          <div className='flex flex-col gap-1'>
            <div className='flex flex-wrap items-center gap-2'>
              <Typography
                variant='h4'
                component={Link}
                href={`/contracts/${schedule.contractId}`}
                className='hover:text-primary'
              >
                {schedule.contractNumber}
              </Typography>
              <Chip size='small' variant='outlined' label={`v${schedule.contractVersion}`} />
              <ScheduleStatusChip status={schedule.status} size='medium' />
            </div>
            <Typography color='text.secondary'>
              {schedule.site.name} · {formatPeriod(schedule.periodStart, schedule.periodEnd)}
            </Typography>
            <div className='flex flex-wrap gap-x-4 gap-y-1'>
              <Typography variant='body2' color='text.secondary'>
                Supervisor: <span className='text-textPrimary'>{supervisor ?? '—'}</span>
              </Typography>
              {STAMPS.filter(stamp => schedule[stamp.key]).map(stamp => (
                <Typography key={stamp.key} variant='body2' color='text.secondary'>
                  {stamp.label} {new Date(schedule[stamp.key] as string).toLocaleString()}
                </Typography>
              ))}
            </div>
          </div>
        </div>

        {actions.length > 0 && (
          <div className='flex flex-wrap items-center gap-3'>
            {actions.map(item => (
              <ActionButton
                key={item.action}
                item={item}
                busy={busy}
                onClick={() => (item.confirm ? setConfirm(item) : void run(item.action))}
              />
            ))}
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={!!confirm}
        title={confirm ? `${ACTION_META[confirm.action].label} schedule?` : ''}
        confirmLabel={confirm ? ACTION_META[confirm.action].label : ''}
        color={confirm?.destructive ? 'error' : 'primary'}
        busy={busy}
        onConfirm={() => confirm && void run(confirm.action)}
        onClose={() => setConfirm(null)}
      >
        {confirm?.confirm}
      </ConfirmDialog>
    </Card>
  )
}

export default ScheduleHeader
