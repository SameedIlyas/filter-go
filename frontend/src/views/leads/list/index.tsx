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
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import LinearProgress from '@mui/material/LinearProgress'
import Skeleton from '@mui/material/Skeleton'
import Divider from '@mui/material/Divider'

// Type Imports
import type { Lead, LeadFilters, LeadSource, LeadStatus } from '@/types/leadTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import CustomAvatar from '@core/components/mui/Avatar'
import OptionMenu from '@core/components/option-menu'

// Lib Imports
import { useLeadOwners, useLeadStatusCounts, useLeadsQuery, LEAD_STATUSES } from '@/libs/api/queries/leads'
import { errorMessage } from '@/libs/api/bff'
import { useSession } from '@/contexts/sessionContext'
import { getInitials } from '@/utils/getInitials'

import LeadStats from './LeadStats'
import LeadBoard from './LeadBoard'
import LeadFormDrawer from '../LeadFormDrawer'
import StatusChangeDialog from '../StatusChangeDialog'
import ConvertLeadDialog from '../ConvertLeadDialog'
import { CONVERTIBLE, NEXT_STATUSES, SOURCE_META, STATUS_META, StatusChip, formatDate, timeAgo } from '../shared'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

const PAGE_SIZES = [10, 20, 50]

type View = 'table' | 'board'

const useDebounced = <T,>(value: T, delay = 350) => {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)

    return () => clearTimeout(id)
  }, [value, delay])

  return debounced
}

const LeadList = () => {
  const router = useRouter()
  const session = useSession()
  const isAdmin = session?.role === 'ADMIN'

  const [view, setView] = useState<View>('table')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<LeadStatus | undefined>()
  const [source, setSource] = useState<LeadSource | ''>('')
  const [ownerId, setOwnerId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<Lead | undefined>()
  const [statusTarget, setStatusTarget] = useState<{ lead: Lead; target: LeadStatus } | null>(null)
  const [converting, setConverting] = useState<Lead | null>(null)

  const q = useDebounced(search.trim())

  const baseFilters = useMemo(
    () => ({ q: q || undefined, source: source || undefined, ownerId: ownerId || undefined, from: from || undefined, to: to || undefined }),
    [q, source, ownerId, from, to]
  )

  // Board shows every status at once, so it ignores the status tab and paging.
  const filters: LeadFilters =
    view === 'board' ? { ...baseFilters, page: 1, limit: 100 } : { ...baseFilters, status, page, limit }

  const leads = useLeadsQuery(filters)
  const counts = useLeadStatusCounts(baseFilters)
  const owners = useLeadOwners()

  // Any filter change goes back to page 1
  useEffect(() => setPage(1), [baseFilters, status, limit])

  const hasFilters = !!(search || source || ownerId || from || to)

  const clearFilters = () => {
    setSearch('')
    setSource('')
    setOwnerId('')
    setFrom('')
    setTo('')
  }

  const openCreate = () => {
    setEditing(undefined)
    setDrawerOpen(true)
  }

  const openEdit = (lead: Lead) => {
    setEditing(lead)
    setDrawerOpen(true)
  }

  const rowActions = (lead: Lead) => [
    { text: 'View details', icon: <i className='bx-show' />, href: `/leads/${lead.id}`, linkProps: { className: 'flex items-center gap-2 is-full plb-2 pli-4' } },
    { text: 'Edit', icon: <i className='bx-edit' />, menuItemProps: { onClick: () => openEdit(lead), className: 'flex items-center gap-2' } },
    ...(NEXT_STATUSES[lead.status].length > 0 ? [{ divider: true }] : []),
    ...NEXT_STATUSES[lead.status].map(target => ({
      text: target === 'LOST' ? 'Mark as lost' : target === 'NEW' ? 'Reopen' : `Move to ${STATUS_META[target].label}`,
      icon: <i className={STATUS_META[target].icon} />,
      menuItemProps: {
        onClick: () => setStatusTarget({ lead, target }),
        className: `flex items-center gap-2 ${target === 'LOST' ? 'text-error' : ''}`
      }
    })),
    ...(isAdmin && CONVERTIBLE.includes(lead.status)
      ? [
          {
            text: 'Convert to contract',
            icon: <i className='bx-transfer-alt' />,
            menuItemProps: { onClick: () => setConverting(lead), className: 'flex items-center gap-2 text-success' }
          }
        ]
      : [])
  ]

  const meta = leads.data?.meta
  const rows = leads.data?.leads ?? []

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <div>
          <Typography variant='h4'>Leads</Typography>
          <Typography color='text.secondary'>Web intake, qualification and hand-off to contracts.</Typography>
        </div>
        <div className='flex items-center gap-3'>
          <ToggleButtonGroup exclusive size='small' value={view} onChange={(_, next: View | null) => next && setView(next)}>
            <ToggleButton value='table' aria-label='Table view'>
              <i className='bx-list-ul' />
            </ToggleButton>
            <ToggleButton value='board' aria-label='Board view'>
              <i className='bx-columns' />
            </ToggleButton>
          </ToggleButtonGroup>
          <Button variant='contained' startIcon={<i className='bx-plus' />} onClick={openCreate}>
            Add Lead
          </Button>
        </div>
      </div>

      <LeadStats counts={counts.data} active={status} onSelect={next => setStatus(next)} />

      <Card>
        {view === 'table' && (
          <Tabs value={status ?? 'ALL'} onChange={(_, value) => setStatus(value === 'ALL' ? undefined : value)} variant='scrollable' className='border-be'>
            <Tab
              value='ALL'
              label={
                <div className='flex items-center gap-2'>
                  All
                  <Chip size='small' variant='tonal' label={counts.data ? Object.values(counts.data).reduce((a, b) => a + b, 0) : '…'} />
                </div>
              }
            />
            {LEAD_STATUSES.map(s => (
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
        )}

        <div className='flex flex-wrap items-end gap-4 p-6'>
          <CustomTextField
            className='min-is-[240px] flex-1'
            placeholder='Search company, contact or email'
            value={search}
            onChange={e => setSearch(e.target.value)}
            slotProps={{ input: { startAdornment: <i className='bx-search mie-2 text-textDisabled' /> } }}
          />
          <CustomTextField select className='min-is-[150px]' value={source} onChange={e => setSource(e.target.value as LeadSource | '')} slotProps={{ select: { displayEmpty: true } }}>
            <MenuItem value=''>All sources</MenuItem>
            {(Object.keys(SOURCE_META) as LeadSource[]).map(s => (
              <MenuItem key={s} value={s}>
                {SOURCE_META[s].label}
              </MenuItem>
            ))}
          </CustomTextField>
          {isAdmin && (
            <CustomTextField select className='min-is-[170px]' value={ownerId} onChange={e => setOwnerId(e.target.value)} slotProps={{ select: { displayEmpty: true } }}>
              <MenuItem value=''>All owners</MenuItem>
              {(owners.data ?? []).map(owner => (
                <MenuItem key={owner.id} value={owner.id}>
                  {owner.name}
                </MenuItem>
              ))}
            </CustomTextField>
          )}
          <CustomTextField type='date' label='From' value={from} onChange={e => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <CustomTextField type='date' label='To' value={to} onChange={e => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          {hasFilters && (
            <Button variant='text' color='secondary' onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>

        {leads.isFetching && <LinearProgress className='bs-0.5' />}
        <Divider />

        {leads.isError && (
          <div className='p-6 flex items-center justify-between gap-4'>
            <Typography color='error'>{errorMessage(leads.error)}</Typography>
            <Button variant='tonal' onClick={() => leads.refetch()}>
              Retry
            </Button>
          </div>
        )}

        {view === 'board' ? (
          <div className='p-6'>
            <LeadBoard
              leads={leads.data?.leads}
              loading={leads.isPending}
              onMove={(lead, target) => setStatusTarget({ lead, target })}
              onConvert={lead => (isAdmin ? setConverting(lead) : undefined)}
            />
            {meta && meta.total > 100 && (
              <Typography variant='body2' color='text.disabled' className='mbs-4'>
                Showing the 100 most recent of {meta.total} leads. Narrow with filters to see the rest.
              </Typography>
            )}
          </div>
        ) : (
          <>
            <div className='overflow-x-auto'>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Contact</th>
                    <th>Service</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th>Owner</th>
                    <th>Created</th>
                    <th className='text-end'>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.isPending &&
                    [0, 1, 2, 3, 4].map(i => (
                      <tr key={i}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j}>
                            <Skeleton />
                          </td>
                        ))}
                      </tr>
                    ))}
                  {!leads.isPending && rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className='text-center plb-12'>
                        <div className='flex flex-col items-center gap-2'>
                          <i className='bx-user-plus text-5xl text-textDisabled' />
                          <Typography variant='h6'>{hasFilters || status ? 'No leads match these filters' : 'No leads yet'}</Typography>
                          <Typography color='text.secondary'>
                            {hasFilters || status ? 'Try clearing the filters.' : 'Website form submissions land here automatically, or add one by hand.'}
                          </Typography>
                          {!hasFilters && !status && (
                            <Button variant='tonal' onClick={openCreate} className='mbs-2'>
                              Add your first lead
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  {rows.map(lead => (
                    <tr key={lead.id} className='cursor-pointer' onClick={() => router.push(`/leads/${lead.id}`)}>
                      <td>
                        <div className='flex items-center gap-3'>
                          <CustomAvatar skin='light' color={STATUS_META[lead.status].color} size={34}>
                            {getInitials(lead.companyName)}
                          </CustomAvatar>
                          <div className='flex flex-col'>
                            <Typography
                              component={Link}
                              href={`/leads/${lead.id}`}
                              onClick={e => e.stopPropagation()}
                              color='text.primary'
                              className='font-medium hover:text-primary'
                            >
                              {lead.companyName}
                            </Typography>
                            {lead.address && (
                              <Typography variant='body2' color='text.disabled' className='max-is-[220px] truncate'>
                                {lead.address}
                              </Typography>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className='flex flex-col'>
                          <Typography color='text.primary'>{lead.contactName}</Typography>
                          <Typography variant='body2' color='text.disabled'>
                            {lead.email}
                          </Typography>
                          {lead.phone && (
                            <Typography variant='body2' color='text.disabled'>
                              {lead.phone}
                            </Typography>
                          )}
                        </div>
                      </td>
                      <td>
                        <Typography>{lead.serviceInterest ?? '—'}</Typography>
                      </td>
                      <td>
                        <div className='flex items-center gap-2'>
                          <i className={`${SOURCE_META[lead.source].icon} text-lg text-textSecondary`} />
                          <Typography>{SOURCE_META[lead.source].label}</Typography>
                        </div>
                      </td>
                      <td>
                        <StatusChip status={lead.status} />
                      </td>
                      <td>
                        {lead.owner ? (
                          <div className='flex items-center gap-2'>
                            <CustomAvatar size={26} skin='light' color='primary' className='text-xs'>
                              {getInitials(lead.owner.name)}
                            </CustomAvatar>
                            <Typography>{lead.owner.name}</Typography>
                          </div>
                        ) : (
                          <Chip size='small' variant='outlined' label='Unassigned' />
                        )}
                      </td>
                      <td>
                        <Typography title={formatDate(lead.createdAt)}>{timeAgo(lead.createdAt)}</Typography>
                      </td>
                      <td className='text-end' onClick={e => e.stopPropagation()}>
                        <OptionMenu iconButtonProps={{ size: 'small' }} iconClassName='text-textSecondary' options={rowActions(lead)} />
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
                    ? `Showing ${(meta.page - 1) * meta.limit + 1} to ${Math.min(meta.page * meta.limit, meta.total)} of ${meta.total} leads`
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
          </>
        )}
      </Card>

      <LeadFormDrawer
        open={drawerOpen}
        lead={editing}
        onClose={() => setDrawerOpen(false)}
        onCreated={lead => router.push(`/leads/${lead.id}`)}
      />
      <StatusChangeDialog lead={statusTarget?.lead ?? null} target={statusTarget?.target ?? null} onClose={() => setStatusTarget(null)} />
      <ConvertLeadDialog lead={converting} onClose={() => setConverting(null)} />
    </div>
  )
}

export default LeadList
