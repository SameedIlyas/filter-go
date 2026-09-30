'use client'

// React Imports
import { memo } from 'react'
import type { DragEvent } from 'react'

// MUI Imports
import Typography from '@mui/material/Typography'
import Tooltip from '@mui/material/Tooltip'

// Type Imports
import type { BoardShift } from '@/types/scheduleTypes'

import type { BoardView } from '../logic/boardWindow'
import { timeRange } from '../logic/placeShifts'
import { SHIFT_STATUS_META, statusColor } from '../shared'

/** The drag payload type: a shift id. Custom so drops from anywhere else are ignored. */
export const SHIFT_DRAG_TYPE = 'application/x-filtergo-shift'

type Props = {
  shift: BoardShift
  view: BoardView

  /** Day view: room for more detail on one line. */
  wide?: boolean
  draggable: boolean
  onOpen: (id: string) => void
  onDragStart?: (shift: BoardShift) => void
  onDragEnd?: () => void
}

/**
 * One shift on the board: time (site-local), then where (by staff) or who (by site). Left border = status colour,
 * dashed outline = draft schedule, struck through = cancelled.
 */
const ShiftCard = ({ shift, view, wide = false, draggable, onOpen, onDragStart, onDragEnd }: Props) => {
  const cancelled = shift.status === 'CANCELLED'
  const secondary = view === 'staff' ? shift.site.name : (shift.assignedUser?.name ?? 'Unassigned')
  const draft = shift.scheduleStatus === 'DRAFT'

  const startDrag = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData(SHIFT_DRAG_TYPE, shift.id)
    event.dataTransfer.effectAllowed = 'move'
    onDragStart?.(shift)
  }

  return (
    <Tooltip
      title={`${SHIFT_STATUS_META[shift.status].label}${draft ? ' · draft schedule' : ''}${shift.isExtra ? ' · extra' : ''}`}
      placement='top'
      disableInteractive
      enterDelay={500}
    >
      <div
        role='button'
        tabIndex={0}
        draggable={draggable}
        onDragStart={draggable ? startDrag : undefined}
        onDragEnd={onDragEnd}
        onClick={() => onOpen(shift.id)}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpen(shift.id)
          }
        }}
        className='rounded-md px-2 py-1 text-left outline-none focus-visible:ring-2'
        style={{
          borderLeft: `3px solid ${statusColor(shift.status)}`,
          outline: draft ? '1px dashed var(--mui-palette-divider)' : undefined,
          background: 'var(--mui-palette-action-hover)',
          opacity: cancelled ? 0.55 : 1,
          cursor: draggable ? 'grab' : 'pointer'
        }}
        aria-label={`${timeRange(shift)} ${secondary} ${SHIFT_STATUS_META[shift.status].label}`}
      >
        <div className={wide ? 'flex items-center gap-3' : ''}>
          <Typography variant='caption' component='div' className='font-medium' color='text.primary' sx={{ textDecoration: cancelled ? 'line-through' : undefined }}>
            {timeRange(shift)}
          </Typography>
          <Typography variant='caption' component='div' color='text.secondary' noWrap title={secondary}>
            {secondary}
          </Typography>
          {(shift.isExtra || shift.hasNotes) && (
            <div className='flex items-center gap-1'>
              {shift.isExtra && (
                <Typography variant='caption' color='warning.main' className='font-medium'>
                  Extra
                </Typography>
              )}
              {shift.hasNotes && <i className='bx-note text-xs' aria-label='Has notes' />}
            </div>
          )}
        </div>
      </div>
    </Tooltip>
  )
}

export default memo(ShiftCard)
