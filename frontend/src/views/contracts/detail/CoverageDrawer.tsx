'use client'

// React Imports
import { useEffect, useState } from 'react'

// MUI Imports
import Drawer from '@mui/material/Drawer'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import MenuItem from '@mui/material/MenuItem'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Tooltip from '@mui/material/Tooltip'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { ContractDetail, CoveragePattern, Site } from '@/types/contractTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { BffError, errorMessage } from '@/libs/api/bff'
import { useReplaceCoverage } from '@/libs/api/queries/contracts'

import { DayCircles, PATTERNS, formatDay, parseRowPath, spanMinutes } from '../shared'
import { blankRow, hours, siteTotals, toInput, toRows, validate } from './coverageRows'
import type { Row, RowErrors } from './coverageRows'

type Props = {
  open: boolean
  contract: ContractDetail
  sites: Site[]
  onClose: () => void
}

/**
 * "Coverage plan": when each site is serviced (the reference app's Shift Allocation Plan). One section per site that
 * has lines; each row is a weekly pattern, an every-N-days interval, or ad hoc. Saved with PUT /contracts/:id/coverage.
 */
const CoverageDrawer = ({ open, contract, sites, onClose }: Props) => {
  const replaceCoverage = useReplaceCoverage(contract.id)
  const [rows, setRows] = useState<Row[]>([])
  const [errors, setErrors] = useState<RowErrors>({})
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!open) return

    setRows(toRows(contract))
    setErrors({})
    setFormError('')

    // Only when the drawer opens: later contract refetches must not wipe unsaved edits
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Sites with lines first (they need coverage), then any site that already has coverage
  const lineSiteIds = [...new Set(contract.lines.map(line => line.siteId))]
  const sectionIds = [...lineSiteIds, ...new Set(rows.map(row => row.siteId).filter(id => !lineSiteIds.includes(id)))]
  const siteName = (id: string) => sites.find(site => site.id === id)?.name ?? 'Unknown site'
  const linesAt = (siteId: string) => contract.lines.filter(line => line.siteId === siteId)

  const update = (index: number, patch: Partial<Row>) => {
    setRows(current => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
    setErrors(current => {
      if (!current[index]) return current

      const cleared = { ...current[index] }

      Object.keys(patch).forEach(key => delete cleared[key as keyof Row])

      return { ...current, [index]: cleared }
    })
  }

  const remove = (index: number) => {
    setRows(current => current.filter((_, i) => i !== index))
    setErrors({})
  }

  const save = async () => {
    const found = validate(rows)

    setErrors(found)
    setFormError('')

    if (Object.keys(found).length > 0) return

    try {
      await replaceCoverage.mutateAsync(rows.map(toInput))
      toast.success('Coverage plan saved')
      onClose()
    } catch (error) {
      if (error instanceof BffError && error.details?.issues) {
        const mapped: RowErrors = {}

        error.details.issues.forEach(issue => {
          const at = parseRowPath(issue.field, 'coverage')

          if (at && at.field) mapped[at.index] = { ...mapped[at.index], [at.field]: issue.message }
          else setFormError(issue.message)
        })
        setErrors(mapped)
      }

      toast.error(errorMessage(error))
    }
  }

  return (
    <Drawer
      open={open}
      anchor='right'
      onClose={onClose}
      ModalProps={{ keepMounted: false }}
      sx={{ '& .MuiDrawer-paper': { width: { xs: '100%', md: 900 } } }}
    >
      <div className='flex items-start justify-between gap-4 plb-5 pli-6'>
        <div>
          <Typography variant='h5'>Coverage plan</Typography>
          <Typography color='text.secondary'>
            {contract.contractNumber} • Contract term: {formatDay(contract.startDate)} –{' '}
            {contract.endDate ? formatDay(contract.endDate) : 'open-ended'}
          </Typography>
        </div>
        <IconButton size='small' onClick={onClose}>
          <i className='bx-x text-2xl' />
        </IconButton>
      </div>
      <Divider />

      <div className='flex-1 overflow-y-auto flex flex-col gap-6 p-6'>
        <Typography variant='body2' color='text.secondary'>
          Times are local to each site. An end time at or before the start runs past midnight. Once the contract is
          active, the schedule is generated from this plan.
        </Typography>
        {formError && <Alert severity='error'>{formError}</Alert>}
        {sectionIds.length === 0 && (
          <Alert severity='info' variant='outlined'>
            Add service lines first. Every site with services needs at least one coverage row.
          </Alert>
        )}

        {sectionIds.map(siteId => {
          const siteRows = rows.map((row, index) => ({ row, index })).filter(({ row }) => row.siteId === siteId)
          const totals = siteTotals(siteRows.map(({ row }) => row))
          const lines = linesAt(siteId)
          const orphan = lines.length === 0

          return (
            <div key={siteId} className='flex flex-col gap-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='flex items-center gap-2'>
                  <i className='bx-map-pin text-xl text-textSecondary' />
                  <Typography variant='h6'>{siteName(siteId)}</Typography>
                  <Chip
                    size='small'
                    variant='tonal'
                    color='primary'
                    label={`${lines.length} service${lines.length === 1 ? '' : 's'}`}
                  />
                </div>
                <div className='flex flex-wrap items-center gap-2'>
                  <Chip size='small' variant='outlined' label={`Visits/week: ${Math.round(totals.visits * 10) / 10}`} />
                  <Chip size='small' variant='outlined' label={`Planned hrs/week: ${hours(totals.minutes)}`} />
                  {siteRows.length === 0 ? (
                    <Chip size='small' variant='tonal' color='error' label='No coverage' />
                  ) : (
                    <Chip size='small' variant='tonal' color='success' label='Covered' />
                  )}
                </div>
              </div>
              {orphan && (
                <Alert severity='warning' variant='outlined'>
                  This site has no service lines on the contract. Remove its coverage or add a line for it.
                </Alert>
              )}

              {siteRows.map(({ row, index }, position) => {
                const e = errors[index] ?? {}
                const span = spanMinutes(row.timeStart, row.timeEnd)

                return (
                  <div
                    key={row.key}
                    className='flex flex-wrap items-start gap-3 p-3 rounded border border-[var(--mui-palette-divider)]'
                  >
                    <Typography className='mbs-2 is-6' color='text.secondary'>
                      #{position + 1}
                    </Typography>
                    <CustomTextField
                      select
                      size='small'
                      label='Pattern'
                      className='is-[150px]'
                      value={row.patternType}
                      onChange={ev => update(index, { patternType: ev.target.value as CoveragePattern })}
                    >
                      {PATTERNS.map(p => (
                        <MenuItem key={p.value} value={p.value}>
                          {p.label}
                        </MenuItem>
                      ))}
                    </CustomTextField>

                    {row.patternType === 'WEEKLY' && (
                      <>
                        <CustomTextField
                          type='time'
                          size='small'
                          label='Start'
                          className='is-[130px]'
                          value={row.timeStart}
                          onChange={ev => update(index, { timeStart: ev.target.value })}
                          error={!!e.timeStart}
                          helperText={e.timeStart}
                          slotProps={{ inputLabel: { shrink: true } }}
                        />
                        <CustomTextField
                          type='time'
                          size='small'
                          label='End'
                          className='is-[130px]'
                          value={row.timeEnd}
                          onChange={ev => update(index, { timeEnd: ev.target.value })}
                          error={!!e.timeEnd}
                          helperText={
                            e.timeEnd ??
                            (span ? `${hours(span)}${row.timeEnd <= row.timeStart ? ', overnight' : ''}` : undefined)
                          }
                          slotProps={{ inputLabel: { shrink: true } }}
                        />
                        <div className='flex flex-col gap-1'>
                          <Typography variant='caption' color='text.secondary'>
                            Days
                          </Typography>
                          <DayCircles
                            value={row.weekdays}
                            onChange={weekdays => update(index, { weekdays })}
                            error={!!e.weekdays}
                          />
                          {e.weekdays && (
                            <Typography variant='caption' color='error'>
                              {e.weekdays}
                            </Typography>
                          )}
                        </div>
                      </>
                    )}

                    {row.patternType === 'INTERVAL' && (
                      <CustomTextField
                        size='small'
                        label='Every (days)'
                        className='is-[140px]'
                        value={row.intervalDays}
                        onChange={ev => update(index, { intervalDays: ev.target.value.replace(/\D/g, '') })}
                        error={!!e.intervalDays}
                        helperText={e.intervalDays ?? 'e.g. 30 for monthly'}
                        slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                      />
                    )}

                    {row.patternType === 'AD_HOC' && (
                      <CustomTextField
                        size='small'
                        label='Visits per period'
                        className='is-[160px]'
                        value={row.visitsPerPeriod}
                        onChange={ev => update(index, { visitsPerPeriod: ev.target.value.replace(/\D/g, '') })}
                        error={!!e.visitsPerPeriod}
                        helperText={e.visitsPerPeriod ?? 'Booked by hand'}
                        slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                      />
                    )}

                    <div className='flex-1' />
                    <Tooltip title='Remove row'>
                      <IconButton size='small' color='error' onClick={() => remove(index)} className='mbs-1'>
                        <i className='bx-x' />
                      </IconButton>
                    </Tooltip>
                  </div>
                )
              })}

              <Button
                variant='outlined'
                className='border-dashed'
                startIcon={<i className='bx-plus' />}
                onClick={() => setRows(current => [...current, blankRow(siteId)])}
              >
                Add coverage for {siteName(siteId)}
              </Button>
            </div>
          )
        })}
      </div>

      <Divider />
      <div className='flex justify-end gap-3 plb-4 pli-6'>
        <Button variant='tonal' color='secondary' onClick={onClose}>
          Cancel
        </Button>
        <Button variant='contained' onClick={save} disabled={replaceCoverage.isPending}>
          {replaceCoverage.isPending ? 'Saving…' : 'Save plan'}
        </Button>
      </div>
    </Drawer>
  )
}

export default CoverageDrawer
