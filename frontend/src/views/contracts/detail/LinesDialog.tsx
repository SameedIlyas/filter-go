'use client'

// React Imports
import { useEffect, useMemo, useState } from 'react'

// MUI Imports
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import MenuItem from '@mui/material/MenuItem'
import Alert from '@mui/material/Alert'
import Tooltip from '@mui/material/Tooltip'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { ContractDetail, Service, Site, TaxRate } from '@/types/contractTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { BffError, errorMessage } from '@/libs/api/bff'
import { useReplaceLines } from '@/libs/api/queries/contracts'

import { formatMoney, parseRowPath, rateUnit } from '../shared'
import { blankRow, toInput, toRows, validate } from './lineRows'
import type { Row, RowErrors } from './lineRows'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

type Props = {
  open: boolean
  contract: ContractDetail
  sites: Site[]
  services: Service[]
  taxRates: TaxRate[]

  /** Pre-add an empty row for this site when opening. */
  focusSiteId?: string

  /** A site that was just created from this dialog: dropped into rows that have no site yet. */
  newSiteId?: string
  onAddSite: () => void
  onClose: () => void
}

/** Replace-all editor for a draft's service lines (PUT /contracts/:id/lines). */
const LinesDialog = ({
  open,
  contract,
  sites,
  services,
  taxRates,
  focusSiteId,
  newSiteId,
  onAddSite,
  onClose
}: Props) => {
  const replaceLines = useReplaceLines(contract.id)
  const [rows, setRows] = useState<Row[]>([])
  const [errors, setErrors] = useState<RowErrors>({})
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!open) return

    const current = toRows(contract)
    const needsRow = current.length === 0 || (focusSiteId && !current.some(row => row.siteId === focusSiteId))

    setRows(needsRow ? [...current, blankRow(focusSiteId ?? (sites.length === 1 ? sites[0].id : ''))] : current)
    setErrors({})
    setFormError('')

    // Only when the dialog opens: later contract refetches must not wipe unsaved edits
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (newSiteId) setRows(current => current.map(row => (row.siteId ? row : { ...row, siteId: newSiteId })))
  }, [newSiteId])

  const activeServices = services.filter(service => service.active)
  const serviceName = (id: string) => services.find(service => service.id === id)?.name

  const total = useMemo(
    () => rows.reduce((sum, row) => sum + (Number(row.qty) || 0) * (Number(row.billRate) || 0), 0),
    [rows]
  )

  const duplicateHourlySites = useMemo(() => {
    if (contract.billingType !== 'HOURLY') return new Set<string>()

    const seen = new Set<string>()
    const dupes = new Set<string>()

    rows.forEach(row => (seen.has(row.siteId) ? dupes.add(row.siteId) : seen.add(row.siteId)))

    return dupes
  }, [rows, contract.billingType])

  const update = (index: number, patch: Partial<Row>) => {
    setRows(current => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
    setErrors(current => {
      if (!current[index]) return current

      const cleared = { ...current[index] }

      Object.keys(patch).forEach(key => delete cleared[key as keyof Row])

      return { ...current, [index]: cleared }
    })
  }

  const pickService = (index: number, serviceId: string) => {
    const row = rows[index]
    const previous = serviceName(row.serviceId)

    // Fill the description from the service unless the user already typed their own
    update(index, {
      serviceId,
      ...(!row.description.trim() || row.description === previous ? { description: serviceName(serviceId) ?? '' } : {})
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
      await replaceLines.mutateAsync(rows.map(toInput))
      toast.success('Service lines saved')
      onClose()
    } catch (error) {
      if (error instanceof BffError && error.details?.issues) {
        const mapped: RowErrors = {}

        error.details.issues.forEach(issue => {
          const at = parseRowPath(issue.field, 'lines')

          if (at && at.field) mapped[at.index] = { ...mapped[at.index], [at.field]: issue.message }
          else setFormError(issue.message)
        })
        setErrors(mapped)
      }

      toast.error(errorMessage(error))
    }
  }

  const unit = rateUnit(contract.billingType)

  return (
    <Dialog open={open} onClose={onClose} maxWidth='xl' fullWidth>
      <DialogTitle className='flex flex-col gap-1'>
        <span>Services &amp; rates</span>
        <Typography variant='body2' color='text.secondary'>
          {contract.contractNumber} · what is delivered at each site and what it costs. Bill rates are{' '}
          {unit.replace('/ ', 'per ')}.
        </Typography>
      </DialogTitle>
      <DialogContent className='flex flex-col gap-4'>
        {contract.billingType === 'HOURLY' && (
          <Alert severity='info' variant='outlined'>
            Hourly contracts need exactly one line per site, so every shift has one unambiguous rate.
          </Alert>
        )}
        {sites.length === 0 && (
          <Alert
            severity='warning'
            variant='outlined'
            action={
              <Button color='inherit' size='small' onClick={onAddSite}>
                Add site
              </Button>
            }
          >
            {contract.client.legalName} has no sites yet. Add the first location before adding services.
          </Alert>
        )}
        {formError && <Alert severity='error'>{formError}</Alert>}

        <div className='overflow-x-auto'>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th className='min-is-[180px]'>Site</th>
                <th className='min-is-[170px]'>Service</th>
                <th className='min-is-[200px]'>Description</th>
                <th className='is-[90px]'>Qty</th>
                <th className='is-[130px]'>Bill rate</th>
                <th className='is-[130px]'>Pay rate</th>
                <th className='is-[110px]'>Est. min</th>
                <th className='is-[120px]'>Tax</th>
                <th className='text-end'>Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const e = errors[index] ?? {}
                const hourlyClash = duplicateHourlySites.has(row.siteId)

                return (
                  <tr key={row.key}>
                    <td>
                      <CustomTextField
                        select
                        fullWidth
                        size='small'
                        value={row.siteId}
                        onChange={ev => update(index, { siteId: ev.target.value })}
                        error={!!e.siteId || hourlyClash}
                        helperText={e.siteId ?? (hourlyClash ? 'One line per site on hourly.' : undefined)}
                        slotProps={{ select: { displayEmpty: true } }}
                      >
                        <MenuItem value='' disabled>
                          Pick a site
                        </MenuItem>
                        {sites.map(site => (
                          <MenuItem key={site.id} value={site.id} disabled={!site.active && site.id !== row.siteId}>
                            {site.name}
                            {!site.active && ' (inactive)'}
                          </MenuItem>
                        ))}
                        {row.siteId && !sites.some(site => site.id === row.siteId) && (
                          <MenuItem value={row.siteId}>Loading…</MenuItem>
                        )}
                      </CustomTextField>
                    </td>
                    <td>
                      <CustomTextField
                        select
                        fullWidth
                        size='small'
                        value={row.serviceId}
                        onChange={ev => pickService(index, ev.target.value)}
                        slotProps={{ select: { displayEmpty: true } }}
                      >
                        <MenuItem value=''>
                          <span className='text-textDisabled'>None</span>
                        </MenuItem>
                        {activeServices.map(service => (
                          <MenuItem key={service.id} value={service.id}>
                            {service.name}
                          </MenuItem>
                        ))}
                        {row.serviceId && !activeServices.some(s => s.id === row.serviceId) && (
                          <MenuItem value={row.serviceId}>{serviceName(row.serviceId) ?? 'Archived service'}</MenuItem>
                        )}
                      </CustomTextField>
                    </td>
                    <td>
                      <CustomTextField
                        fullWidth
                        size='small'
                        value={row.description}
                        placeholder='e.g. Monthly filter change, 12 AHUs'
                        onChange={ev => update(index, { description: ev.target.value })}
                        error={!!e.description}
                        helperText={e.description}
                        slotProps={{ htmlInput: { maxLength: 500 } }}
                      />
                    </td>
                    <td>
                      <CustomTextField
                        fullWidth
                        size='small'
                        value={row.qty}
                        onChange={ev => update(index, { qty: ev.target.value })}
                        onFocus={ev => ev.target.select()}
                        error={!!e.qty}
                        helperText={e.qty}
                        slotProps={{ htmlInput: { inputMode: 'decimal' } }}
                      />
                    </td>
                    <td>
                      <CustomTextField
                        fullWidth
                        size='small'
                        value={row.billRate}
                        placeholder='0.00'
                        onChange={ev => update(index, { billRate: ev.target.value })}
                        error={!!e.billRate || (row.billRate !== '' && Number(row.billRate) === 0)}
                        helperText={
                          e.billRate ??
                          (row.billRate !== '' && Number(row.billRate) === 0 ? 'Set before sending' : undefined)
                        }
                        slotProps={{
                          input: { startAdornment: <span className='mie-1 text-textDisabled'>$</span> },
                          htmlInput: { inputMode: 'decimal' }
                        }}
                      />
                    </td>
                    <td>
                      <CustomTextField
                        fullWidth
                        size='small'
                        value={row.payRate}
                        placeholder='Worker default'
                        onChange={ev => update(index, { payRate: ev.target.value })}
                        error={!!e.payRate}
                        helperText={e.payRate}
                        slotProps={{
                          input: { startAdornment: <span className='mie-1 text-textDisabled'>$</span> },
                          htmlInput: { inputMode: 'decimal' }
                        }}
                      />
                    </td>
                    <td>
                      <CustomTextField
                        fullWidth
                        size='small'
                        value={row.estMinutes}
                        placeholder='—'
                        onChange={ev => update(index, { estMinutes: ev.target.value.replace(/\D/g, '') })}
                        error={!!e.estMinutes}
                        helperText={e.estMinutes}
                        slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                      />
                    </td>
                    <td>
                      <CustomTextField
                        select
                        fullWidth
                        size='small'
                        value={row.taxCode}
                        onChange={ev => update(index, { taxCode: ev.target.value })}
                        error={!!e.taxCode}
                        helperText={e.taxCode}
                        slotProps={{ select: { displayEmpty: true } }}
                      >
                        <MenuItem value=''>
                          <span className='text-textDisabled'>No tax</span>
                        </MenuItem>
                        {taxRates.map(rate => (
                          <MenuItem key={rate.code} value={rate.code}>
                            {rate.code} ({Number(rate.ratePercent)}%)
                          </MenuItem>
                        ))}
                        {row.taxCode && !taxRates.some(rate => rate.code === row.taxCode) && (
                          <MenuItem value={row.taxCode}>{row.taxCode}</MenuItem>
                        )}
                      </CustomTextField>
                    </td>
                    <td className='text-end whitespace-nowrap'>
                      <Typography color='text.primary'>
                        {formatMoney((Number(row.qty) || 0) * (Number(row.billRate) || 0))}
                      </Typography>
                    </td>
                    <td>
                      <Tooltip title='Remove line'>
                        <IconButton size='small' color='error' onClick={() => remove(index)}>
                          <i className='bx-x' />
                        </IconButton>
                      </Tooltip>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className='text-center plb-8'>
                    <Typography color='text.secondary'>
                      No lines. A contract needs at least one before it can be sent for signature.
                    </Typography>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex gap-2'>
            <Button
              variant='tonal'
              startIcon={<i className='bx-plus' />}
              onClick={() => setRows(current => [...current, blankRow(sites.length === 1 ? sites[0].id : '')])}
            >
              Add line
            </Button>
            <Button variant='text' startIcon={<i className='bx-map-pin' />} onClick={onAddSite}>
              New site
            </Button>
          </div>
          <Typography color='text.secondary'>
            Sum of qty × rate: <b className='text-textPrimary'>{formatMoney(total)}</b> {unit}
          </Typography>
        </div>
      </DialogContent>
      <DialogActions>
        <Button variant='tonal' color='secondary' onClick={onClose}>
          Cancel
        </Button>
        <Button variant='contained' onClick={save} disabled={replaceLines.isPending}>
          {replaceLines.isPending ? 'Saving…' : 'Save lines'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default LinesDialog
