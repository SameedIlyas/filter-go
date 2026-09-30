'use client'

// React Imports
import { useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
import MenuItem from '@mui/material/MenuItem'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'

// Type Imports
import type { ContractDetail, ContractSummary, Site } from '@/types/contractTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useClientSites, useContractQuery } from '@/libs/api/queries/contracts'

import { generatePreview } from '../logic/generatePreview'
import type { GeneratePreview } from '../logic/generatePreview'
import { formatPeriod } from '../shared'
import { formatDay } from '@views/contracts/shared'

type Props = {
  contract: ContractSummary
  siteId: string
  onSiteChange: (siteId: string) => void
  periodStart: string
  periodEnd: string

  /** Reports whether generating is impossible right now (still loading, no site, or a preview problem). */
  onBlockedChange: (blocked: boolean) => void

  /** The period and supervisor fields, rendered between the site and the preview. */
  children: ReactNode
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

const PreviewPanel = ({
  preview,
  contract,
  interval
}: {
  preview: GeneratePreview
  contract: ContractDetail
  interval: boolean
}) => (
  <div className='flex flex-col gap-3 rounded border border-[var(--mui-palette-divider)] p-4'>
    <Typography variant='h6'>Preview</Typography>
    <div className='flex flex-col gap-1'>
      {preview.patterns.map((pattern, index) => (
        <div key={`${pattern}-${index}`} className='flex items-center gap-2'>
          <i className='bx-calendar text-lg text-textSecondary' />
          <Typography>{pattern}</Typography>
        </div>
      ))}
    </div>
    {preview.problem ? (
      <Alert severity='error'>{preview.problem}</Alert>
    ) : (
      <>
        {preview.clamped && (
          <Alert severity='info' variant='outlined'>
            The contract runs {formatDay(contract.startDate)} –{' '}
            {contract.endDate ? formatDay(contract.endDate) : 'open-ended'}, so the schedule will cover{' '}
            {formatPeriod(preview.periodStart, preview.periodEnd)}.
          </Alert>
        )}
        <Typography className='font-medium'>
          {interval ? 'About ' : ''}
          {plural(preview.estimatedShifts, 'shift')} will be created
        </Typography>
        {preview.adHocVisits !== null && (
          <Alert severity='warning' variant='outlined'>
            {plural(preview.adHocVisits, 'ad-hoc visit')} expected — add those shifts by hand.
          </Alert>
        )}
      </>
    )}
  </div>
)

/**
 * The part of the generate form that depends on the picked contract: its covered sites and a preview of what
 * generation will create. Mounted only once a contract is chosen, so the contract query always has an id.
 */
const GeneratePlan = ({ contract, siteId, onSiteChange, periodStart, periodEnd, onBlockedChange, children }: Props) => {
  const detail = useContractQuery(contract.id)
  const sites = useClientSites(contract.client.id)

  // Only sites with coverage rows can generate shifts
  const siteIds = useMemo(() => [...new Set((detail.data?.coverage ?? []).map(row => row.siteId))], [detail.data])
  const siteName = (id: string) => (sites.data ?? []).find((site: Site) => site.id === id)?.name ?? 'Unnamed site'

  useEffect(() => {
    if (siteIds.length === 1 && siteId !== siteIds[0]) onSiteChange(siteIds[0])
  }, [siteIds, siteId, onSiteChange])

  const preview =
    detail.data && siteId && periodStart && periodEnd
      ? generatePreview(detail.data.coverage, siteId, detail.data, periodStart, periodEnd)
      : null

  const interval = !!detail.data?.coverage.some(row => row.siteId === siteId && row.patternType === 'INTERVAL')
  const blocked = !preview || !!preview.problem

  useEffect(() => onBlockedChange(blocked), [blocked, onBlockedChange])

  return (
    <>
      {detail.isPending ? (
        <Skeleton variant='rounded' height={40} />
      ) : detail.isError ? (
        <Alert severity='error'>{errorMessage(detail.error)}</Alert>
      ) : (
        <CustomTextField
          select
          fullWidth
          label='Site'
          value={siteIds.includes(siteId) ? siteId : ''}
          onChange={e => onSiteChange(e.target.value)}
          disabled={siteIds.length === 0}
          helperText={
            siteIds.length === 0 ? 'This contract has no coverage yet.' : 'Only sites with coverage on the contract'
          }
          slotProps={{ select: { displayEmpty: true } }}
        >
          <MenuItem value='' disabled>
            Pick a site
          </MenuItem>
          {siteIds.map(id => (
            <MenuItem key={id} value={id}>
              {sites.isPending ? 'Loading…' : siteName(id)}
            </MenuItem>
          ))}
        </CustomTextField>
      )}

      {children}

      {preview && detail.data && <PreviewPanel preview={preview} contract={detail.data} interval={interval} />}
    </>
  )
}

export default GeneratePlan
