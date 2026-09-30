'use client'

// React Imports
import { useState } from 'react'

// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'

// Type Imports
import type { TermsSnapshot } from '@/types/scheduleTypes'

// Util Imports
import { billingCycleLabel, billingTypeLabel, formatMoney } from '@views/contracts/shared'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

type Pattern = TermsSnapshot['coverage'][number]

const timeWindow = (row: Pattern) => (row.timeStart && row.timeEnd ? ` · ${row.timeStart}–${row.timeEnd}` : '')

const describePattern = (row: Pattern) => {
  if (row.patternType === 'WEEKLY')
    return `Weekly on ${row.weekdays.map(day => WEEKDAY_NAMES[day - 1]).join(', ')}${timeWindow(row)}`
  if (row.patternType === 'INTERVAL') return `Every ${row.intervalDays} days${timeWindow(row)}`

  return `Ad hoc: ${row.visitsPerPeriod ?? 0} visits per period`
}

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div className='flex flex-col'>
    <Typography variant='body2' color='text.disabled'>
      {label}
    </Typography>
    <Typography color='text.primary'>{value}</Typography>
  </div>
)

/**
 * The contract terms frozen when the schedule was generated. Rates are already redacted by the server per role,
 * so a rate column only appears when the snapshot carries it.
 */
const TermsPanel = ({ terms, siteId }: { terms: TermsSnapshot; siteId: string }) => {
  const [open, setOpen] = useState(false)
  const items = terms.serviceItems.filter(item => item.siteId === siteId)
  const patterns = terms.coverage.filter(row => row.siteId === siteId)
  const showPay = items.some(item => 'payRate' in item)
  const showBill = items.some(item => 'billRate' in item)

  return (
    <Card>
      <CardHeader
        title='Contract terms'
        subheader={`Snapshot of ${terms.contractNumber} v${terms.contractVersion}, taken ${new Date(terms.generatedAt).toLocaleString()}`}
        className='cursor-pointer'
        onClick={() => setOpen(value => !value)}
        action={
          <IconButton aria-label={open ? 'Hide contract terms' : 'Show contract terms'} aria-expanded={open}>
            <i className={open ? 'bx-chevron-up' : 'bx-chevron-down'} />
          </IconButton>
        }
      />
      <Collapse in={open} unmountOnExit>
        <CardContent className='flex flex-col gap-6'>
          <div className='grid gap-4 grid-cols-1 sm:grid-cols-3'>
            <Fact label='Billing type' value={billingTypeLabel(terms.billingType)} />
            <Fact label='Billing cycle' value={billingCycleLabel(terms.billingCycle)} />
            <Fact label='Site timezone' value={terms.siteTimezone} />
          </div>

          <div className='flex flex-col gap-2'>
            <Typography variant='h6'>Coverage</Typography>
            {patterns.length === 0 && <Typography color='text.disabled'>No coverage patterns.</Typography>}
            {patterns.map((row, index) => (
              <div key={`${row.patternType}-${index}`} className='flex items-center gap-2'>
                <i className='bx-calendar text-lg text-textSecondary' />
                <Typography>{describePattern(row)}</Typography>
              </div>
            ))}
          </div>

          <div className='flex flex-col gap-2'>
            <Typography variant='h6'>Services</Typography>
            <div className='overflow-x-auto'>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th className='text-end'>Qty</th>
                    <th className='text-end'>Est. minutes</th>
                    {showPay && <th className='text-end'>Pay rate</th>}
                    {showBill && <th className='text-end'>Bill rate</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={3 + Number(showPay) + Number(showBill)} className='text-center'>
                        <Typography color='text.disabled'>No service lines for this site.</Typography>
                      </td>
                    </tr>
                  )}
                  {items.map(item => (
                    <tr key={item.lineId}>
                      <td>
                        <Typography color='text.primary'>{item.description}</Typography>
                      </td>
                      <td className='text-end'>{item.qty}</td>
                      <td className='text-end'>{item.estMinutes ?? '—'}</td>
                      {showPay && <td className='text-end'>{formatMoney(item.payRate)}</td>}
                      {showBill && <td className='text-end'>{formatMoney(item.billRate)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Collapse>
    </Card>
  )
}

export default TermsPanel
