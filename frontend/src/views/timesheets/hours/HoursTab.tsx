'use client'

// React Imports
import { useState } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Divider from '@mui/material/Divider'
import LinearProgress from '@mui/material/LinearProgress'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useSchedulingSites } from '@/libs/api/queries/scheduling'
import { useHoursQuery } from '@/libs/api/queries/timesheets'

import { hoursCsv } from '../logic/hoursCsv'
import type { HoursMetric } from '../logic/hoursCsv'
import HoursGrid from './HoursGrid'
import HoursToolbar from './HoursToolbar'
import { useHoursParams } from './useHoursParams'

/** Hands the browser a CSV file to save. */
const download = (name: string, csv: string) => {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')

  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

/** Hours per worker and day for a period (at most 45 days), with weekly overtime and a CSV export for payroll. */
const HoursTab = () => {
  const { window, siteId, setWindow, setSite, drill, showExceptions } = useHoursParams()
  const [metric, setMetric] = useState<HoursMetric>('workedMinutes')

  const hours = useHoursQuery({ from: window.from, to: window.to, siteId: siteId || undefined })
  const sites = useSchedulingSites()

  const onExport = () => {
    if (hours.data) download(`hours_${window.from}_${window.to}.csv`, hoursCsv(hours.data, metric))
  }

  return (
    <Card>
      <HoursToolbar
        window={window}
        siteId={siteId}
        sites={sites.data ?? []}
        metric={metric}
        canExport={Boolean(hours.data?.workers.length)}
        onWindow={setWindow}
        onSite={setSite}
        onMetric={setMetric}
        onExport={onExport}
      />
      {hours.isFetching && <LinearProgress className='bs-0.5' />}
      <Divider />
      {hours.isError && (
        <Alert
          severity='error'
          className='m-6'
          action={
            <Button color='inherit' size='small' onClick={() => hours.refetch()}>
              Retry
            </Button>
          }
        >
          {errorMessage(hours.error)}
        </Alert>
      )}
      <HoursGrid data={hours.data} loading={hours.isPending} metric={metric} onDrill={drill} onExceptions={showExceptions} />
    </Card>
  )
}

export default HoursTab
