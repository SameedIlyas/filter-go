'use client'

// React Imports
import { useEffect, useMemo, useState } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import LinearProgress from '@mui/material/LinearProgress'

// Third-party Imports
import { useQueryClient } from '@tanstack/react-query'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { prefetchBoard, useBoardQuery, useSchedulingSites, useStaffOptions } from '@/libs/api/queries/scheduling'
import type { BoardParams } from '@/libs/api/queries/scheduling'

import AddShiftDialog from '../drawer/AddShiftDialog'
import ShiftDrawer from '../drawer/ShiftDrawer'
import { StaffOnly } from '../list/feedback'
import GenerateScheduleDialog from '../list/GenerateScheduleDialog'
import { boardWindow, shiftAnchor } from '../logic/boardWindow'
import { shiftActions } from '../logic/lifecycle'
import { countVisible, placeShifts } from '../logic/placeShifts'
import { todayKey } from '../logic/zoned'
import SchedulingTabs from '../SchedulingTabs'
import { useSchedulingRole } from '../shared'
import BoardFilters from './BoardFilters'
import BoardFooter from './BoardFooter'
import BoardGrid from './BoardGrid'
import type { BoardRow } from './BoardGrid'
import BoardToolbar from './BoardToolbar'
import MonthGrid from './MonthGrid'
import { buildRows } from './rows'
import { useAssignFlow } from './useAssignFlow'
import { useBoardState } from './useBoardState'

type Props = {

  /** Embedded in a schedule's page: only that schedule's shifts, with local (not URL) state. */
  scheduleId?: string
  initialDate?: string
}

/**
 * The planning board (the reference app's Schedule screen): shifts on a staff x day (or site x day) grid for a
 * day, week or month. One `GET /shifts/board` per window; the neighbouring windows are prefetched.
 */
const ShiftBoard = ({ scheduleId, initialDate }: Props) => {
  const embedded = Boolean(scheduleId)
  const { isStaff } = useSchedulingRole()
  const { state, update, selectedShiftId, selectShift } = useBoardState(embedded, initialDate)
  const [dialog, setDialog] = useState<'generate' | 'addShift' | null>(null)
  const queryClient = useQueryClient()
  const today = todayKey()
  const flow = useAssignFlow()

  const window = useMemo(() => boardWindow(state.anchor, state.range), [state.anchor, state.range])

  const params: BoardParams = useMemo(
    () => ({
      from: window.from,
      to: window.to,
      siteIds: state.siteIds,
      userIds: state.userIds,
      statuses: state.statuses,
      scheduleId,
      includeDraft: embedded || state.includeDraft
    }),
    [window.from, window.to, state.siteIds, state.userIds, state.statuses, state.includeDraft, scheduleId, embedded]
  )

  const board = useBoardQuery(params, isStaff)
  const staff = useStaffOptions(isStaff)
  const sites = useSchedulingSites(isStaff && !embedded)

  // Warm the previous and next window so paging feels instant
  useEffect(() => {
    if (!isStaff || !board.isSuccess) return

    for (const direction of [-1, 1] as const) {
      const next = boardWindow(shiftAnchor(state.anchor, state.range, direction), state.range)

      void prefetchBoard(queryClient, { ...params, from: next.from, to: next.to })
    }
  }, [board.isSuccess, isStaff, params, queryClient, state.anchor, state.range])

  const shifts = useMemo(() => board.data?.shifts ?? [], [board.data])
  const placement = useMemo(() => placeShifts(shifts, window.days, state.view), [shifts, window.days, state.view])
  const counts = board.data ? (board.data.truncated ? board.data.counts : countVisible(shifts, window.days)) : null

  const rows = useMemo(
    () => buildRows({ view: state.view, range: state.range, shifts, staff: staff.data ?? [], sites: sites.data ?? [], filter: state, placement }),
    [state, shifts, staff.data, sites.data, placement]
  )

  if (!isStaff) return <StaffOnly />

  const drop = (shiftId: string, row: BoardRow) => {
    if (row.dropUserId === null) void flow.unassign(shiftId)
    else if (row.dropUserId) void flow.assign({ shiftId, userId: row.dropUserId, userName: row.title })
  }

  const canDrag = (shift: (typeof shifts)[number]) => state.view === 'staff' && shiftActions(shift).canDrag

  return (
    <Card>
      {!embedded && (
        <div className='border-be px-6'>
          <SchedulingTabs value={state.view} onSelect={tab => (tab === 'schedules' ? false : (update({ view: tab }), true))} />
        </div>
      )}
      <CardContent className='flex flex-col gap-4'>
        <BoardToolbar
          embedded={embedded}
          view={state.view}
          range={state.range}
          label={window.label}
          openCount={counts?.open ?? 0}
          canCreate
          onView={view => update({ view })}
          onRange={range => update({ range })}
          onStep={direction => update({ anchor: shiftAnchor(state.anchor, state.range, direction) })}
          onToday={() => update({ anchor: today })}
          onShowOpen={() => update({ statuses: ['OPEN'] })}
          onGenerate={() => setDialog('generate')}
          onAddShift={() => setDialog('addShift')}
        />
        <BoardFilters state={state} update={update} sites={sites.data ?? []} staff={staff.data ?? []} embedded={embedded} />
        {board.data?.truncated && (
          <Alert severity='warning'>
            Showing the first {board.data.shifts.length.toLocaleString()} shifts in this window. Narrow the board by site, staff or status to see the rest.
          </Alert>
        )}
        {board.isError && (
          <Alert severity='error' action={<Button color='inherit' size='small' onClick={() => void board.refetch()}>Retry</Button>}>
            {errorMessage(board.error)}
          </Alert>
        )}
        {board.isSuccess && counts?.total === 0 && (
          <Alert
            severity='info'
            action={
              <Button color='inherit' size='small' onClick={() => setDialog(embedded ? 'addShift' : 'generate')}>
                {embedded ? 'Add shift' : 'Generate schedule'}
              </Button>
            }
          >
            No shifts in this window.
          </Alert>
        )}
      </CardContent>

      {board.isFetching && <LinearProgress className='bs-0.5' />}

      {state.range === 'month' ? (
        <MonthGrid days={window.days} month={window.month ?? ''} shifts={shifts} today={today} onPickDay={day => update({ range: 'day', anchor: day })} />
      ) : (
        <BoardGrid
          days={window.days}
          rows={rows}
          placed={placement.rows}
          view={state.view}
          today={today}
          wide={state.range === 'day'}
          canDrag={canDrag}
          onOpen={selectShift}
          onDrop={drop}
        />
      )}

      {counts && <BoardFooter counts={counts} approximate={board.data?.truncated} />}

      <ShiftDrawer shiftId={selectedShiftId} onClose={() => selectShift(null)} assignFlow={flow} />
      {!embedded && <GenerateScheduleDialog open={dialog === 'generate'} onClose={() => setDialog(null)} />}
      {/* Mounted only while open: fresh fields every time, and no queries while it is closed */}
      {dialog === 'addShift' && <AddShiftDialog open scheduleId={scheduleId} defaultDate={state.anchor} onClose={() => setDialog(null)} />}
      {flow.dialog}
    </Card>
  )
}

export default ShiftBoard
