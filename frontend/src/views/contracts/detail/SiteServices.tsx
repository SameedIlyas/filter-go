'use client'

// React Imports
import { useState } from 'react'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Divider from '@mui/material/Divider'

// Type Imports
import type { ContractDetail, Service, Site } from '@/types/contractTypes'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'

import { DayCircles, PATTERNS, formatMinutes, formatMoney, rateUnit } from '../shared'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

type Props = {
  contract: ContractDetail
  sites: Site[]
  services: Service[]
  editable: boolean
  onEditLines: (siteId?: string) => void
  onEditCoverage: () => void
}

/**
 * Services grouped by site, one expandable block each (the reference app's contract accordion): the lines billed
 * there and when the site is visited.
 */
const SiteServices = ({ contract, sites, services, editable, onEditLines, onEditCoverage }: Props) => {
  const siteIds = [
    ...new Set([...contract.lines.map(line => line.siteId), ...contract.coverage.map(row => row.siteId)])
  ]

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const site = (id: string) => sites.find(s => s.id === id)
  const serviceName = (id: string | null) => (id ? services.find(s => s.id === id)?.name : undefined)
  const showBill = contract.lines.some(line => line.billRate !== undefined)
  const showPay = contract.lines.some(line => line.payRate !== undefined)
  const unit = rateUnit(contract.billingType)

  const toggle = (id: string) =>
    setCollapsed(current => {
      const next = new Set(current)

      if (next.has(id)) next.delete(id)
      else next.add(id)

      return next
    })

  return (
    <Card>
      <CardHeader
        title='Sites & services'
        subheader={`${siteIds.length} site${siteIds.length === 1 ? '' : 's'} · ${contract.lines.length} line${contract.lines.length === 1 ? '' : 's'}`}
        action={
          editable && (
            <div className='flex gap-2'>
              <Button
                variant='tonal'
                size='small'
                startIcon={<i className='bx-calendar-edit' />}
                onClick={onEditCoverage}
                disabled={contract.lines.length === 0}
              >
                Coverage plan
              </Button>
              <Button
                variant='contained'
                size='small'
                startIcon={<i className='bx-edit' />}
                onClick={() => onEditLines()}
              >
                Edit services
              </Button>
            </div>
          )
        }
      />
      <Divider />

      {siteIds.length === 0 && (
        <CardContent className='flex flex-col items-center gap-2 plb-12'>
          <i className='bx-map-alt text-5xl text-textDisabled' />
          <Typography variant='h6'>No services yet</Typography>
          <Typography color='text.secondary' className='text-center'>
            Add what is delivered at each of {contract.client.legalName}&apos;s sites, then plan the coverage.
          </Typography>
          {editable && (
            <Button variant='tonal' className='mbs-2' onClick={() => onEditLines()}>
              Add services
            </Button>
          )}
        </CardContent>
      )}

      {siteIds.map((siteId, i) => {
        const info = site(siteId)
        const lines = contract.lines.filter(line => line.siteId === siteId)
        const coverage = contract.coverage.filter(row => row.siteId === siteId)
        const open = !collapsed.has(siteId)
        const siteTotal = lines.reduce((sum, line) => sum + Number(line.qty) * Number(line.billRate ?? 0), 0)
        const needsRates = lines.some(line => line.billRate !== undefined && Number(line.billRate) === 0)

        return (
          <div key={siteId}>
            {i > 0 && <Divider />}
            <div
              className='flex flex-wrap items-center gap-3 pli-6 plb-4 cursor-pointer'
              onClick={() => toggle(siteId)}
            >
              <IconButton size='small'>
                <i className={open ? 'bx-chevron-up' : 'bx-chevron-down'} />
              </IconButton>
              <CustomAvatar skin='light' color='primary' size={36} variant='rounded'>
                <i className='bx-building' />
              </CustomAvatar>
              <div className='flex flex-col flex-1 min-is-0'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Typography className='font-medium' color='text.primary'>
                    {info?.name ?? 'Site'}
                  </Typography>
                  {info && !info.active && <Chip size='small' variant='tonal' color='secondary' label='Inactive' />}
                  {coverage.length === 0 && lines.length > 0 && (
                    <Chip size='small' variant='tonal' color='error' label='No coverage' />
                  )}
                  {needsRates && <Chip size='small' variant='tonal' color='warning' label='Rates missing' />}
                </div>
                <Typography variant='body2' color='text.disabled' className='truncate'>
                  {info?.address}
                  {info?.contactName && ` · ${info.contactName}${info.contactPhone ? ` (${info.contactPhone})` : ''}`}
                </Typography>
              </div>
              {showBill && (
                <Typography color='text.primary' className='font-medium'>
                  {formatMoney(siteTotal)} <span className='text-textDisabled text-sm font-normal'>{unit}</span>
                </Typography>
              )}
              {editable && (
                <Button
                  size='small'
                  variant='text'
                  onClick={e => {
                    e.stopPropagation()
                    onEditLines(siteId)
                  }}
                >
                  Add line
                </Button>
              )}
            </div>

            <Collapse in={open}>
              <div className='overflow-x-auto'>
                <table className={tableStyles.table}>
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Qty</th>
                      <th>Est. time</th>
                      {showBill && <th>Bill rate</th>}
                      {showPay && <th>Pay rate</th>}
                      <th>Tax</th>
                      {showBill && <th className='text-end'>Total</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map(line => (
                      <tr key={line.id}>
                        <td>
                          <div className='flex flex-col'>
                            <Typography color='text.primary'>{line.description}</Typography>
                            {serviceName(line.serviceId) && serviceName(line.serviceId) !== line.description && (
                              <Typography variant='body2' color='text.disabled'>
                                {serviceName(line.serviceId)}
                              </Typography>
                            )}
                          </div>
                        </td>
                        <td>{Number(line.qty)}</td>
                        <td>{formatMinutes(line.estMinutes)}</td>
                        {showBill && (
                          <td>
                            <Typography color={Number(line.billRate) === 0 ? 'warning.main' : 'text.primary'}>
                              {formatMoney(line.billRate)} <span className='text-textDisabled text-sm'>{unit}</span>
                            </Typography>
                          </td>
                        )}
                        {showPay && (
                          <td>
                            {line.payRate ? (
                              formatMoney(line.payRate)
                            ) : (
                              <span className='text-textDisabled'>Worker default</span>
                            )}
                          </td>
                        )}
                        <td>{line.taxCode ?? '—'}</td>
                        {showBill && (
                          <td className='text-end'>{formatMoney(Number(line.qty) * Number(line.billRate ?? 0))}</td>
                        )}
                      </tr>
                    ))}
                    {lines.length === 0 && (
                      <tr>
                        <td colSpan={7}>
                          <Typography color='text.disabled'>No service lines at this site.</Typography>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className='flex flex-col gap-2 pli-6 plb-4 bg-[var(--mui-palette-action-hover)]'>
                <Typography variant='body2' className='font-medium' color='text.secondary'>
                  Coverage
                </Typography>
                {coverage.length === 0 && (
                  <Typography variant='body2' color='text.disabled'>
                    Not planned yet{editable ? ' — open the coverage plan to set when this site is visited.' : '.'}
                  </Typography>
                )}
                {coverage.map(row => (
                  <div key={row.id} className='flex flex-wrap items-center gap-3'>
                    <Chip
                      size='small'
                      variant='tonal'
                      color='info'
                      label={PATTERNS.find(p => p.value === row.patternType)?.label}
                    />
                    {row.patternType === 'WEEKLY' ? (
                      <>
                        <DayCircles value={row.weekdays} />
                        <Typography color='text.primary'>
                          {row.timeStart} – {row.timeEnd}
                          {row.timeStart && row.timeEnd && row.timeEnd <= row.timeStart && (
                            <span className='text-textDisabled text-sm'> (next day)</span>
                          )}
                        </Typography>
                      </>
                    ) : row.patternType === 'INTERVAL' ? (
                      <Typography color='text.primary'>Every {row.intervalDays} days</Typography>
                    ) : (
                      <Typography color='text.primary'>
                        {row.visitsPerPeriod} visit(s) per period, booked by hand
                      </Typography>
                    )}
                  </div>
                ))}
              </div>
            </Collapse>
          </div>
        )
      })}
    </Card>
  )
}

export default SiteServices
