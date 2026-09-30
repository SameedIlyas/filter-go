'use client'

// React Imports
import { useMemo } from 'react'

// MUI Imports
import ButtonBase from '@mui/material/ButtonBase'
import Typography from '@mui/material/Typography'

// Type Imports
import type { BoardShift } from '@/types/scheduleTypes'

import { dayKeyIn } from '../logic/zoned'

type Props = {
  days: string[]
  month: string
  shifts: BoardShift[]
  today: string
  onPickDay: (day: string) => void
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Month view: counts per site-local day ("12 · 3 open"). Clicking a day opens the Day view for it. */
const MonthGrid = ({ days, month, shifts, today, onPickDay }: Props) => {
  const tally = useMemo(() => {
    const byDay = new Map<string, { total: number; open: number }>()

    for (const shift of shifts) {
      if (shift.status === 'CANCELLED') continue

      const day = dayKeyIn(shift.scheduledStart, shift.site.timezone)
      const current = byDay.get(day) ?? { total: 0, open: 0 }

      byDay.set(day, { total: current.total + 1, open: current.open + (shift.status === 'OPEN' ? 1 : 0) })
    }

    return byDay
  }, [shifts])

  return (
    <div className='border-bs'>
      <div className='grid grid-cols-7 border-be'>
        {WEEKDAYS.map(name => (
          <Typography key={name} variant='body2' className='border-ie py-2 text-center font-medium'>
            {name.toUpperCase()}
          </Typography>
        ))}
      </div>
      <div className='grid grid-cols-7'>
        {days.map(day => {
          const counts = tally.get(day)
          const inMonth = day.startsWith(month)

          return (
            <ButtonBase
              key={day}
              onClick={() => onPickDay(day)}
              className='flex min-bs-[96px] flex-col items-start justify-start gap-1 border-be border-ie p-2 text-left'
              style={{ opacity: inMonth ? 1 : 0.45, background: day === today ? 'var(--mui-palette-primary-lightOpacity)' : undefined }}
              aria-label={`${day}: ${counts?.total ?? 0} shift${counts?.total === 1 ? '' : 's'}, ${counts?.open ?? 0} open`}
            >
              <Typography variant='body2' className='font-medium' color={day === today ? 'primary.main' : 'text.primary'}>
                {Number(day.slice(8))}
              </Typography>
              {counts && (
                <Typography variant='caption' color='text.secondary'>
                  {counts.total} shift{counts.total === 1 ? '' : 's'}
                  {counts.open > 0 && (
                    <Typography component='span' variant='caption' color='error.main' className='font-medium'>
                      {' '}
                      · {counts.open} open
                    </Typography>
                  )}
                </Typography>
              )}
            </ButtonBase>
          )
        })}
      </div>
    </div>
  )
}

export default MonthGrid
