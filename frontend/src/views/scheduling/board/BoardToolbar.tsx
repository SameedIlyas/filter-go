'use client'

// React Imports
import { useState } from 'react'

// MUI Imports
import Button from '@mui/material/Button'
import ButtonGroup from '@mui/material/ButtonGroup'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'

import type { BoardRange, BoardView } from '../logic/boardWindow'

type Props = {
  embedded: boolean
  view: BoardView
  range: BoardRange
  label: string
  openCount: number
  canCreate: boolean
  onView: (view: BoardView) => void
  onRange: (range: BoardRange) => void
  onStep: (direction: 1 | -1) => void
  onToday: () => void
  onShowOpen: () => void
  onGenerate: () => void
  onAddShift: () => void
}

const RANGES: Array<{ value: BoardRange; label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' }
]

/** Date navigation, Day/Week/Month, the "needs assignment" badge and the Create menu. */
const BoardToolbar = ({ embedded, view, range, label, openCount, canCreate, onView, onRange, onStep, onToday, onShowOpen, onGenerate, onAddShift }: Props) => {
  const [menu, setMenu] = useState<HTMLElement | null>(null)

  return (
    <div className='flex flex-wrap items-center justify-between gap-3'>
      <div className='flex flex-wrap items-center gap-2'>
        {embedded && (
          <ToggleButtonGroup exclusive size='small' value={view} onChange={(_event, next: BoardView | null) => next && onView(next)} aria-label='Group rows by'>
            <ToggleButton value='staff'>By staff</ToggleButton>
            <ToggleButton value='site'>By site</ToggleButton>
          </ToggleButtonGroup>
        )}
        <div className='flex items-center gap-1'>
          <IconButton size='small' onClick={() => onStep(-1)} aria-label='Previous'>
            <i className='bx-chevron-left' />
          </IconButton>
          <Typography variant='h6' component='h2' className='min-is-[180px] text-center'>
            {label}
          </Typography>
          <IconButton size='small' onClick={() => onStep(1)} aria-label='Next'>
            <i className='bx-chevron-right' />
          </IconButton>
        </div>
        <Button size='small' variant='tonal' color='secondary' onClick={onToday}>
          Today
        </Button>
        <ButtonGroup size='small' aria-label='Range'>
          {RANGES.map(option => (
            <Button key={option.value} variant={range === option.value ? 'contained' : 'tonal'} onClick={() => onRange(option.value)}>
              {option.label}
            </Button>
          ))}
        </ButtonGroup>
      </div>

      <div className='flex items-center gap-2'>
        {openCount > 0 && (
          <Chip
            color='error'
            variant='tonal'
            icon={<i className='bx-error-circle' />}
            label={`${openCount} shift${openCount === 1 ? '' : 's'} need${openCount === 1 ? 's' : ''} assignment`}
            onClick={onShowOpen}
          />
        )}
        {canCreate &&
          (embedded ? (
            <Button variant='contained' startIcon={<i className='bx-plus' />} onClick={onAddShift}>
              Add shift
            </Button>
          ) : (
            <>
              <Button variant='contained' startIcon={<i className='bx-plus' />} endIcon={<i className='bx-chevron-down' />} onClick={event => setMenu(event.currentTarget)}>
                Create
              </Button>
              <Menu anchorEl={menu} open={menu !== null} onClose={() => setMenu(null)}>
                <MenuItem
                  onClick={() => {
                    setMenu(null)
                    onGenerate()
                  }}
                >
                  <i className='bx-calendar-plus mie-2' /> Generate schedule
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMenu(null)
                    onAddShift()
                  }}
                >
                  <i className='bx-time mie-2' /> Add shift
                </MenuItem>
              </Menu>
            </>
          ))}
      </div>
    </div>
  )
}

export default BoardToolbar
