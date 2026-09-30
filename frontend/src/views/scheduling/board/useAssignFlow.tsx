'use client'

// React Imports
import { useState } from 'react'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { AssignmentWarning } from '@/types/scheduleTypes'

// Lib Imports
import { useAssignShift, useUnassignShift } from '@/libs/api/queries/scheduling'
import type { AssignVariables } from '@/libs/api/queries/scheduling'

import WarningsConfirmDialog from '../drawer/WarningsConfirmDialog'
import { assignOutcome } from '../logic/assignmentFlow'
import { toastFriendly, toastSchedulingError } from '../notify'

type Target = Omit<AssignVariables, 'overrideWarnings' | 'reason'>

/**
 * The single assignment flow used by drag-and-drop and the drawer (docs/ARCHITECTURE.md 5.4): try; on
 * ASSIGNMENT_WARNINGS show them and ask; on "Assign anyway" resend with `overrideWarnings` and the reason.
 * The card moves optimistically and snaps back if the server refuses.
 */
export const useAssignFlow = () => {
  const assign = useAssignShift()
  const unassign = useUnassignShift()
  const [pending, setPending] = useState<{ target: Target; warnings: AssignmentWarning[] } | null>(null)

  const run = async (target: Target, override?: { reason?: string }) => {
    try {
      await assign.mutateAsync({ ...target, ...(override ? { overrideWarnings: true, reason: override.reason } : {}) })
      toast.success(`Assigned to ${target.userName}`)
      setPending(null)

      return true
    } catch (error) {
      const outcome = assignOutcome(error)

      if (outcome.kind === 'warnings' && !override) setPending({ target, warnings: outcome.warnings })
      else if (outcome.kind === 'error') toastFriendly(outcome)
      else toastSchedulingError(error)

      return false
    }
  }

  const release = async (shiftId: string) => {
    try {
      await unassign.mutateAsync(shiftId)
      toast.success('Shift is open again')

      return true
    } catch (error) {
      toastSchedulingError(error)

      return false
    }
  }

  const dialog = (
    <WarningsConfirmDialog
      open={pending !== null}
      userName={pending?.target.userName ?? ''}
      warnings={pending?.warnings ?? []}
      busy={assign.isPending}
      onConfirm={reason => pending && void run(pending.target, { reason })}
      onClose={() => setPending(null)}
    />
  )

  return { assign: (target: Target) => run(target), unassign: release, dialog, busy: assign.isPending || unassign.isPending }
}
