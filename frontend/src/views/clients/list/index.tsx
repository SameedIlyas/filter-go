'use client'

// React Imports
import { useEffect, useState } from 'react'

// Next Imports
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// MUI Imports
import Card from '@mui/material/Card'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import MenuItem from '@mui/material/MenuItem'
import Chip from '@mui/material/Chip'
import Pagination from '@mui/material/Pagination'
import LinearProgress from '@mui/material/LinearProgress'
import Skeleton from '@mui/material/Skeleton'
import Divider from '@mui/material/Divider'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import CustomAvatar from '@core/components/mui/Avatar'

// Lib Imports
import { useClientListQuery } from '@/libs/api/queries/contracts'
import { errorMessage } from '@/libs/api/bff'
import { useSession } from '@/contexts/sessionContext'
import { getInitials } from '@/utils/getInitials'

import ClientDialog from '../ClientDialog'
import { paymentTermsLabel } from '../../contracts/shared'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

const PAGE_SIZES = [10, 20, 50]

type ActiveFilter = 'true' | 'false' | ''

const useDebounced = <T,>(value: T, delay = 350) => {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)

    return () => clearTimeout(id)
  }, [value, delay])

  return debounced
}

const ClientList = () => {
  const router = useRouter()
  const session = useSession()
  const isAdmin = session?.role === 'ADMIN'

  const [search, setSearch] = useState('')
  const [active, setActive] = useState<ActiveFilter>('true')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [createOpen, setCreateOpen] = useState(false)

  const q = useDebounced(search.trim())
  const clients = useClientListQuery({ q: q || undefined, active: active || undefined, page, limit })

  useEffect(() => setPage(1), [q, active, limit])

  const meta = clients.data?.meta
  const rows = clients.data?.clients ?? []
  const filtered = !!q || active !== 'true'

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <div>
          <Typography variant='h4'>Clients &amp; Sites</Typography>
          <Typography color='text.secondary'>Who you bill, and the locations where the work happens.</Typography>
        </div>
        {isAdmin && (
          <Button variant='contained' startIcon={<i className='bx-plus' />} onClick={() => setCreateOpen(true)}>
            New Client
          </Button>
        )}
      </div>

      <Card>
        <div className='flex flex-wrap items-center gap-4 p-6'>
          <CustomTextField
            className='min-is-[240px] flex-1'
            placeholder='Search by legal name'
            value={search}
            onChange={e => setSearch(e.target.value)}
            slotProps={{ input: { startAdornment: <i className='bx-search mie-2 text-textDisabled' /> } }}
          />
          <CustomTextField
            select
            className='min-is-[170px]'
            value={active}
            onChange={e => setActive(e.target.value as ActiveFilter)}
            slotProps={{ select: { displayEmpty: true } }}
          >
            <MenuItem value='true'>Active clients</MenuItem>
            <MenuItem value='false'>Inactive clients</MenuItem>
            <MenuItem value=''>All clients</MenuItem>
          </CustomTextField>
        </div>

        {clients.isFetching && <LinearProgress className='bs-0.5' />}
        <Divider />

        {clients.isError && (
          <div className='p-6 flex items-center justify-between gap-4'>
            <Typography color='error'>{errorMessage(clients.error)}</Typography>
            <Button variant='tonal' onClick={() => clients.refetch()}>
              Retry
            </Button>
          </div>
        )}

        <div className='overflow-x-auto'>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Client</th>
                <th>Billing email</th>
                <th>Payment terms</th>
                <th>Status</th>
                <th className='text-end'>Since</th>
              </tr>
            </thead>
            <tbody>
              {clients.isPending &&
                [0, 1, 2, 3].map(i => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j}>
                        <Skeleton />
                      </td>
                    ))}
                  </tr>
                ))}
              {!clients.isPending && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className='text-center plb-12'>
                    <div className='flex flex-col items-center gap-2'>
                      <i className='bx-buildings text-5xl text-textDisabled' />
                      <Typography variant='h6'>
                        {filtered ? 'No clients match these filters' : 'No clients yet'}
                      </Typography>
                      <Typography color='text.secondary'>
                        {filtered
                          ? 'Try another search or status.'
                          : 'Converting a won lead creates the client, or add one by hand.'}
                      </Typography>
                    </div>
                  </td>
                </tr>
              )}
              {rows.map(client => (
                <tr key={client.id} className='cursor-pointer' onClick={() => router.push(`/clients/${client.id}`)}>
                  <td>
                    <div className='flex items-center gap-3'>
                      <CustomAvatar skin='light' color={client.active ? 'primary' : 'secondary'} size={34}>
                        {getInitials(client.legalName).slice(0, 2)}
                      </CustomAvatar>
                      <div className='flex flex-col'>
                        <Typography
                          component={Link}
                          href={`/clients/${client.id}`}
                          onClick={e => e.stopPropagation()}
                          color='text.primary'
                          className='font-medium hover:text-primary'
                        >
                          {client.legalName}
                        </Typography>
                        {client.billingAddress && (
                          <Typography variant='body2' color='text.disabled' className='max-is-[260px] truncate'>
                            {client.billingAddress}
                          </Typography>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>{client.billingEmail}</td>
                  <td>{paymentTermsLabel(client.paymentTerms)}</td>
                  <td>
                    <Chip
                      size='small'
                      variant='tonal'
                      color={client.active ? 'success' : 'secondary'}
                      label={client.active ? 'Active' : 'Inactive'}
                    />
                  </td>
                  <td className='text-end'>{new Date(client.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className='flex justify-between items-center flex-wrap pli-6 border-bs plb-3 gap-2'>
          <div className='flex items-center gap-3'>
            <Typography color='text.disabled'>
              {meta && meta.total > 0
                ? `Showing ${(meta.page - 1) * meta.limit + 1} to ${Math.min(meta.page * meta.limit, meta.total)} of ${meta.total} clients`
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

      <ClientDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={client => router.push(`/clients/${client.id}`)}
      />
    </div>
  )
}

export default ClientList
