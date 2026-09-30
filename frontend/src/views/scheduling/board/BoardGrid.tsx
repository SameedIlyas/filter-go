'use client'

// React Imports
import { useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'

// MUI Imports
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { useVirtualizer } from '@tanstack/react-virtual'

// Type Imports
import type { BoardShift } from '@/types/scheduleTypes'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'

// Util Imports
import { getInitials } from '@/utils/getInitials'

import type { BoardView } from '../logic/boardWindow'
import { splitCell } from '../logic/placeShifts'
import type { PlacedRows } from '../logic/placeShifts'
import ShiftCard, { SHIFT_DRAG_TYPE } from './ShiftCard'

export type BoardRow = {
  key: string
  title: string
  subtitle?: string

  /** Highlight the subtitle (e.g. over the weekly hours). */
  subtitleWarn?: boolean
  image?: string | null
  icon?: string

  /** Staff view only: dropping a shift here assigns it to this user; `null` = the Unassigned row (unassign). */
  dropUserId?: string | null
}

type Props = {
  days: string[]
  rows: BoardRow[]
  placed: PlacedRows
  view: BoardView
  today: string
  wide: boolean
  canDrag: (shift: BoardShift) => boolean
  onOpen: (shiftId: string) => void
  onDrop: (shiftId: string, row: BoardRow) => void
}

const CELL_LIMIT = 3
const HEAD_WIDTH = 220

const dayHeader = (day: string) => {
  const date = new Date(`${day}T00:00:00Z`)

  return {
    weekday: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(date).toUpperCase(),
    date: date.getUTCDate()
  }
}

/**
 * The week/day grid: one row per person (or site), one column per day. Only the rows in view are rendered, so
 * hundreds of staff stay smooth. Shifts are dragged with native HTML5 drag-and-drop between staff rows.
 */
const BoardGrid = ({ days, rows, placed, view, today, wide, canDrag, onOpen, onDrop }: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [dragging, setDragging] = useState<BoardShift | null>(null)
  const [overRow, setOverRow] = useState<string | null>(null)

  // The source card can scroll out of the virtual window mid-drag and never fire its own dragend
  useEffect(() => {
    if (!dragging) return

    const reset = () => {
      setDragging(null)
      setOverRow(null)
    }

    window.addEventListener('dragend', reset)
    window.addEventListener('drop', reset)

    return () => {
      window.removeEventListener('dragend', reset)
      window.removeEventListener('drop', reset)
    }
  }, [dragging])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 84,
    overscan: 6
  })

  const columns = `${HEAD_WIDTH}px repeat(${days.length}, minmax(${wide ? 320 : 136}px, 1fr))`

  const acceptsDrop = (row: BoardRow) =>
    dragging !== null && row.dropUserId !== undefined && (row.dropUserId ?? null) !== (dragging.assignedUser?.id ?? null)

  const dragOver = (event: DragEvent, row: BoardRow) => {
    if (!acceptsDrop(row) || !event.dataTransfer.types.includes(SHIFT_DRAG_TYPE)) return

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (overRow !== row.key) setOverRow(row.key)
  }

  const drop = (event: DragEvent, row: BoardRow) => {
    const shiftId = event.dataTransfer.getData(SHIFT_DRAG_TYPE)

    event.preventDefault()
    setOverRow(null)
    setDragging(null)
    if (shiftId && acceptsDrop(row)) onDrop(shiftId, row)
  }

  const toggle = (cellKey: string) =>
    setExpanded(current => {
      const next = new Set(current)

      if (next.has(cellKey)) next.delete(cellKey)
      else next.add(cellKey)

      return next
    })

  return (
    <div ref={scrollRef} className='overflow-auto border-bs' style={{ maxHeight: 'calc(100vh - 330px)', minHeight: 360 }}>
      <div style={{ minWidth: HEAD_WIDTH + days.length * (wide ? 320 : 136) }}>
        <div className='sticky top-0 z-[2] grid border-be' style={{ gridTemplateColumns: columns, background: 'var(--mui-palette-background-paper)' }}>
          <div className='sticky left-0 z-[3] border-ie' style={{ background: 'var(--mui-palette-background-paper)' }} />
          {days.map(day => {
            const header = dayHeader(day)
            const isToday = day === today

            return (
              <div
                key={day}
                className='flex items-center justify-center gap-1 border-ie py-2'
                style={isToday ? { background: 'var(--mui-palette-primary-main)', color: 'var(--mui-palette-primary-contrastText)' } : undefined}
              >
                <Typography variant='body2' color='inherit' className='font-medium'>
                  {header.weekday} {header.date}
                </Typography>
              </div>
            )
          })}
        </div>

        <div className='relative' style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map(item => {
            const row = rows[item.index]
            const cells = placed.get(row.key)
            const highlighted = overRow === row.key

            return (
              <div
                key={row.key}
                ref={virtualizer.measureElement}
                data-index={item.index}
                className='absolute inset-x-0 grid border-be'
                style={{
                  transform: `translateY(${item.start}px)`,
                  gridTemplateColumns: columns,
                  background: highlighted ? 'var(--mui-palette-primary-lightOpacity)' : undefined
                }}
                onDragOver={event => dragOver(event, row)}
                onDragLeave={() => highlighted && setOverRow(null)}
                onDrop={event => drop(event, row)}
              >
                <div className='sticky left-0 z-[1] flex items-center gap-3 border-ie p-3' style={{ background: 'var(--mui-palette-background-paper)' }}>
                  <CustomAvatar src={row.image ?? undefined} skin='light' color={row.dropUserId === null ? 'error' : 'primary'} size={34}>
                    {row.icon ? <i className={row.icon} /> : getInitials(row.title).slice(0, 2)}
                  </CustomAvatar>
                  <div className='flex min-is-0 flex-col'>
                    <Typography variant='body2' color='text.primary' className='font-medium' noWrap title={row.title}>
                      {row.title}
                    </Typography>
                    {row.subtitle && (
                      <Typography variant='caption' color={row.subtitleWarn ? 'warning.main' : 'text.secondary'} noWrap>
                        {row.subtitle}
                      </Typography>
                    )}
                  </div>
                </div>

                {days.map(day => {
                  const cellKey = `${row.key}|${day}`
                  const cell = cells?.get(day) ?? []
                  const open = expanded.has(cellKey)
                  const { visible, hidden } = open ? { visible: cell, hidden: 0 } : splitCell(cell, CELL_LIMIT)

                  return (
                    <div key={day} className='flex min-bs-[72px] flex-col gap-1 border-ie p-1.5' style={day === today ? { background: 'var(--mui-palette-action-hover)' } : undefined}>
                      {visible.map(shift => (
                        <ShiftCard
                          key={shift.id}
                          shift={shift}
                          view={view}
                          wide={wide}
                          draggable={canDrag(shift)}
                          onOpen={onOpen}
                          onDragStart={setDragging}
                          onDragEnd={() => {
                            setDragging(null)
                            setOverRow(null)
                          }}
                        />
                      ))}
                      {(hidden > 0 || open) && cell.length > CELL_LIMIT && (
                        <Button size='small' variant='text' className='self-start' onClick={() => toggle(cellKey)}>
                          {open ? 'Show less' : `+${hidden} more`}
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default BoardGrid
