'use client'

// React Imports
import { useEffect, useMemo, useState } from 'react'

// Next Imports
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// MUI Imports
import Card from '@mui/material/Card'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import MenuItem from '@mui/material/MenuItem'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Chip from '@mui/material/Chip'
import Pagination from '@mui/material/Pagination'
import LinearProgress from '@mui/material/LinearProgress'
import Skeleton from '@mui/material/Skeleton'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Tooltip from '@mui/material/Tooltip'

// Type Imports
import type { ContractFilters, ContractStatus, ContractSummary } from '@/types/contractTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import CustomAvatar from '@core/components/mui/Avatar'

// Lib Imports
import {
  CONTRACT_STATUSES,
  useClientsQuery,
  useContractStatusCounts,
  useContractsQuery
} from '@/libs/api/queries/contracts'
import { errorMessage } from '@/libs/api/bff'
import { useSession } from '@/contexts/sessionContext'
import { getInitials } from '@/utils/getInitials'

import ContractStats from './ContractStats'
import CreateContractDialog from '../CreateContractDialog'
import { STATUS_META, StatusChip, billingCycleLabel, billingTypeLabel, daysUntil, formatDay } from '../shared'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

const PAGE_SIZES = [10, 20, 50]
const EXPIRY_WARNING_DAYS = 30

const useDebounced = <T,>(value: T, delay = 350) => {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)

    return () => clearTimeout(id)
  }, [value, delay])

  return debounced
}

/** "Ends in 12 days" for running contracts close to their end date; auto-renewing ones are left alone. */
const ExpiryHint = ({ contract }: { contract: ContractSummary }) => {
  if (!contract.endDate || contract.autoRenew || !['ACTIVE', 'SUSPENDED'].includes(contract.status)) return null

  const days = daysUntil(contract.endDate)

  if (days > EXPIRY_WARNING_DAYS || days < 0) return null

  return <Chip size='small' variant='tonal' color='warning' label={days === 0 ? 'Ends today' : `Ends in ${days}d`} />
}

const ContractList = () => {
  const router = useRouter()
  const session = useSession()
  const isAdmin = session?.role === 'ADMIN'

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<ContractStatus | undefined>()
  const [clientId, setClientId] = useState('')
  const [latestOnly, setLatestOnly] = useState(true)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [createOpen, setCreateOpen] = useState(false)

  const q = useDebounced(search.trim())

  const baseFilters = useMemo(() => ({ q: q || undefined, clientId: clientId || undefined }), [q, clientId])

  const filters: ContractFilters = { ...baseFilters, status, latestOnly: latestOnly ? 'true' : 'false', page, limit }

  const contracts = useContractsQuery(filters)
  const counts = useContractStatusCounts(baseFilters)
  const clients = useClientsQuery()

  // Any filter change goes back to page 1
  useEffect(() => setPage(1), [baseFilters, status, limit, latestOnly])

  const hasFilters = !!(search || clientId)
  const meta = contracts.data?.meta
  const rows = contracts.data?.contracts ?? []
  const total = counts.data ? Object.values(counts.data).reduce((a, b) => a + b, 0) : undefined

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <div>
          <Typography variant='h4'>Contracts</Typography>
          <Typography color='text.secondary'>
            What each client pays for, where, and how often. Active contracts drive the schedule.
          </Typography>
        </div>
        {isAdmin && (
          <Button variant='contained' startIcon={<i className='bx-plus' />} onClick={() => setCreateOpen(true)}>
            New Contract
          </Button>
        )}
      </div>

      <ContractStats counts={counts.data} active={status} onSelect={setStatus} />

      <Card>
        <Tabs
          value={status ?? 'ALL'}
          onChange={(_, value) => setStatus(value === 'ALL' ? undefined : value)}
          variant='scrollable'
          className='border-be'
        >
          <Tab
            value='ALL'
            label={
              <div className='flex items-center gap-2'>
                All
                <Chip size='small' variant='tonal' label={total ?? '…'} />
              </div>
            }
          />
          {CONTRACT_STATUSES.map(s => (
            <Tab
              key={s}
              value={s}
              label={
                <div className='flex items-center gap-2'>
                  {STATUS_META[s].label}
                  <Chip size='small' variant='tonal' color={STATUS_META[s].color} label={counts.data?.[s] ?? '…'} />
                </div>
              }
            />
          ))}
        </Tabs>

        <div className='flex flex-wrap items-center gap-4 p-6'>
          <CustomTextField
            className='min-is-[240px] flex-1'
            placeholder='Search contract number or client'
            value={search}
            onChange={e => setSearch(e.target.value)}
            slotProps={{ input: { startAdornment: <i className='bx-search mie-2 text-textDisabled' /> } }}
          />
          <CustomTextField
            select
            className='min-is-[200px]'
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            slotProps={{ select: { displayEmpty: true } }}
          >
            <MenuItem value=''>All clients</MenuItem>
            {(clients.data ?? []).map(client => (
              <MenuItem key={client.id} value={client.id}>
                {client.legalName}
              </MenuItem>
            ))}
          </CustomTextField>
          <Tooltip title='Show only the newest version of each contract number'>
            <FormControlLabel
              control={<Switch checked={latestOnly} onChange={e => setLatestOnly(e.target.checked)} />}
              label='Latest versions'
            />
          </Tooltip>
          {hasFilters && (
            <Button
              variant='text'
              color='secondary'
              onClick={() => {
                setSearch('')
                setClientId('')
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {contracts.isFetching && <LinearProgress className='bs-0.5' />}
        <Divider />

        {contracts.isError && (
          <div className='p-6 flex items-center justify-between gap-4'>
            <Typography color='error'>{errorMessage(contracts.error)}</Typography>
            <Button variant='tonal' onClick={() => contracts.refetch()}>
              Retry
            </Button>
          </div>
        )}

        <div className='overflow-x-auto'>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Contract</th>
                <th>Client</th>
                <th>Term</th>
                <th>Billing</th>
                <th>Status</th>
                <th>Signed</th>
                <th className='text-end'>Updated</th>
              </tr>
            </thead>
            <tbody>
              {contracts.isPending &&
                [0, 1, 2, 3, 4].map(i => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j}>
                        <Skeleton />
                      </td>
                    ))}
                  </tr>
                ))}
              {!contracts.isPending && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className='text-center plb-12'>
                    <div className='flex flex-col items-center gap-2'>
                      <i className='bx-file-blank text-5xl text-textDisabled' />
                      <Typography variant='h6'>
                        {hasFilters || status ? 'No contracts match these filters' : 'No contracts yet'}
                      </Typography>
                      <Typography color='text.secondary'>
                        {hasFilters || status
                          ? 'Try clearing the filters.'
                          : 'Converting a won lead creates one automatically, or start one by hand.'}
                      </Typography>
                      {isAdmin && !hasFilters && !status && (
                        <Button variant='tonal' onClick={() => setCreateOpen(true)} className='mbs-2'>
                          Create your first contract
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              {rows.map(contract => (
                <tr
                  key={contract.id}
                  className='cursor-pointer'
                  onClick={() => router.push(`/contracts/${contract.id}`)}
                >
                  <td>
                    <div className='flex items-center gap-3'>
                      <CustomAvatar skin='light' color={STATUS_META[contract.status].color} size={34} variant='rounded'>
                        <i className='bx-file text-xl' />
                      </CustomAvatar>
                      <div className='flex flex-col'>
                        <div className='flex items-center gap-2'>
                          <Typography
                            component={Link}
                            href={`/contracts/${contract.id}`}
                            onClick={e => e.stopPropagation()}
                            color='text.primary'
                            className='font-medium hover:text-primary'
                          >
                            {contract.contractNumber}
                          </Typography>
                          <Chip size='small' variant='outlined' label={`v${contract.version}`} />
                        </div>
                        {contract.leadId && (
                          <Typography variant='body2' color='text.disabled'>
                            From a lead
                          </Typography>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className='flex items-center gap-2'>
                      <CustomAvatar size={26} skin='light' color='primary' className='text-xs'>
                        {getInitials(contract.client.legalName).slice(0, 2)}
                      </CustomAvatar>
                      <Typography color='text.primary'>{contract.client.legalName}</Typography>
                    </div>
                  </td>
                  <td>
                    <div className='flex flex-col gap-1 items-start'>
                      <Typography>
                        {formatDay(contract.startDate)} –{' '}
                        {contract.endDate ? formatDay(contract.endDate) : 'Open-ended'}
                      </Typography>
                      <div className='flex gap-1'>
                        {contract.autoRenew && (
                          <Chip
                            size='small'
                            variant='tonal'
                            color='info'
                            label='Auto-renew'
                            icon={<i className='bx-refresh' />}
                          />
                        )}
                        <ExpiryHint contract={contract} />
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className='flex flex-col'>
                      <Typography>{billingTypeLabel(contract.billingType)}</Typography>
                      <Typography variant='body2' color='text.disabled'>
                        Billed {billingCycleLabel(contract.billingCycle).toLowerCase()}
                      </Typography>
                    </div>
                  </td>
                  <td>
                    <StatusChip status={contract.status} />
                  </td>
                  <td>
                    {contract.signedAt ? (
                      <div className='flex flex-col'>
                        <Typography>{contract.signedBy}</Typography>
                        <Typography variant='body2' color='text.disabled'>
                          {new Date(contract.signedAt).toLocaleDateString()}
                        </Typography>
                      </div>
                    ) : (
                      <Typography color='text.disabled'>—</Typography>
                    )}
                  </td>
                  <td className='text-end'>
                    <Typography variant='body2'>{new Date(contract.updatedAt).toLocaleDateString()}</Typography>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className='flex justify-between items-center flex-wrap pli-6 border-bs plb-3 gap-2'>
          <div className='flex items-center gap-3'>
            <Typography color='text.disabled'>
              {meta && meta.total > 0
                ? `Showing ${(meta.page - 1) * meta.limit + 1} to ${Math.min(meta.page * meta.limit, meta.total)} of ${meta.total} contracts`
                : 'No entries'}
            </Typography>
            <CustomTextField select size='small' value={limit} onChange={e => setLimit(Number(e.target.value))}>
              {PAGE_SIZES.map(size => (
                <MenuItem key={size} value={size}>
                  {size} / page
                </MenuItem>
              ))}
            </CustomTextField>
          </div>
          <Pagination
            shape='rounded'
            color='primary'
            variant='tonal'
            count={meta?.totalPages ?? 1}
            page={page}
            onChange={(_, next) => setPage(next)}
            showFirstButton
            showLastButton
          />
        </div>
      </Card>

      <CreateContractDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={contract => router.push(`/contracts/${contract.id}`)}
      />
    </div>
  )
}

export default ContractList
