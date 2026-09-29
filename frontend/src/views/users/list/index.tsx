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
import Pagination from '@mui/material/Pagination'
import LinearProgress from '@mui/material/LinearProgress'
import Skeleton from '@mui/material/Skeleton'
import Divider from '@mui/material/Divider'

// Type Imports
import type { Role, UserStatus } from '@/types/userTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import CustomAvatar from '@core/components/mui/Avatar'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { USER_ROLES, USER_STATUSES, useUserCounts, useUsersQuery } from '@/libs/api/queries/users'
import { useSession } from '@/contexts/sessionContext'
import { getInitials } from '@/utils/getInitials'

import UserStats from './UserStats'
import UserFormDialog from '../UserFormDialog'
import { ROLE_META, RoleChip, STATUS_META, StatusChip, formatDate } from '../shared'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

const PAGE_SIZES = [10, 20, 50]
const COLUMNS = 7

const useDebounced = <T,>(value: T, delay = 350) => {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)

    return () => clearTimeout(id)
  }, [value, delay])

  return debounced
}

const UserList = () => {
  const router = useRouter()
  const session = useSession()
  const isAdmin = session?.role === 'ADMIN'

  const [search, setSearch] = useState('')
  const [role, setRole] = useState<Role | ''>('')
  const [status, setStatus] = useState<UserStatus | ''>('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [inviteOpen, setInviteOpen] = useState(false)

  const q = useDebounced(search.trim())
  const counts = useUserCounts({ q: q || undefined })

  const users = useUsersQuery({
    q: q || undefined,
    role: role || undefined,
    status: status || undefined,
    page,
    limit
  })

  useEffect(() => setPage(1), [q, role, status, limit])

  const meta = users.data?.meta
  const rows = users.data?.users ?? []
  const filtered = !!q || !!role || !!status

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <div>
          <Typography variant='h4'>Users</Typography>
          <Typography color='text.secondary'>Your team: who they are, what they can do and where they work.</Typography>
        </div>
        {isAdmin && (
          <Button variant='contained' startIcon={<i className='bx-user-plus' />} onClick={() => setInviteOpen(true)}>
            Invite User
          </Button>
        )}
      </div>

      <UserStats
        counts={counts.data}
        role={role || undefined}
        status={status || undefined}
        onSelect={filter => {
          setRole(filter.role ?? '')
          setStatus(filter.status ?? '')
        }}
      />

      <Card>
        <div className='flex flex-wrap items-center gap-4 p-6'>
          <CustomTextField
            className='min-is-[240px] flex-1'
            placeholder='Search by name or email'
            value={search}
            onChange={e => setSearch(e.target.value)}
            slotProps={{ input: { startAdornment: <i className='bx-search mie-2 text-textDisabled' /> } }}
          />
          <CustomTextField
            select
            className='min-is-[170px]'
            value={role}
            onChange={e => setRole(e.target.value as Role | '')}
            slotProps={{ select: { displayEmpty: true } }}
          >
            <MenuItem value=''>All roles</MenuItem>
            {USER_ROLES.map(r => (
              <MenuItem key={r} value={r}>
                {ROLE_META[r].label}
              </MenuItem>
            ))}
          </CustomTextField>
          <CustomTextField
            select
            className='min-is-[160px]'
            value={status}
            onChange={e => setStatus(e.target.value as UserStatus | '')}
            slotProps={{ select: { displayEmpty: true } }}
          >
            <MenuItem value=''>All statuses</MenuItem>
            {USER_STATUSES.map(s => (
              <MenuItem key={s} value={s}>
                {STATUS_META[s].label}
              </MenuItem>
            ))}
          </CustomTextField>
        </div>

        {users.isFetching && <LinearProgress className='bs-0.5' />}
        <Divider />

        {users.isError && (
          <div className='p-6 flex items-center justify-between gap-4'>
            <Typography color='error'>{errorMessage(users.error)}</Typography>
            <Button variant='tonal' onClick={() => users.refetch()}>
              Retry
            </Button>
          </div>
        )}

        <div className='overflow-x-auto'>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Phone</th>
                <th>Employment</th>
                <th>Last sign-in</th>
                <th className='text-end'>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.isPending &&
                [0, 1, 2, 3].map(i => (
                  <tr key={i}>
                    {Array.from({ length: COLUMNS }).map((_, j) => (
                      <td key={j}>
                        <Skeleton />
                      </td>
                    ))}
                  </tr>
                ))}
              {!users.isPending && rows.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS} className='text-center plb-12'>
                    <div className='flex flex-col items-center gap-2'>
                      <i className='bx-group text-5xl text-textDisabled' />
                      <Typography variant='h6'>{filtered ? 'No users match these filters' : 'No users yet'}</Typography>
                      <Typography color='text.secondary'>
                        {filtered ? 'Try another search, role or status.' : 'Invite your first team member to get started.'}
                      </Typography>
                    </div>
                  </td>
                </tr>
              )}
              {rows.map(user => (
                <tr key={user.id} className='cursor-pointer' onClick={() => router.push(`/users/${user.id}`)}>
                  <td>
                    <div className='flex items-center gap-3'>
                      <CustomAvatar
                        src={user.image ?? undefined}
                        skin='light'
                        color={ROLE_META[user.role].color}
                        size={34}
                      >
                        {getInitials(user.name).slice(0, 2)}
                      </CustomAvatar>
                      <div className='flex flex-col min-is-0'>
                        <Typography
                          component={Link}
                          href={`/users/${user.id}`}
                          onClick={e => e.stopPropagation()}
                          color='text.primary'
                          className='font-medium hover:text-primary'
                        >
                          {user.name}
                        </Typography>
                        <Typography variant='body2' color='text.disabled' className='max-is-[260px] truncate'>
                          {user.email}
                        </Typography>
                      </div>
                    </div>
                  </td>
                  <td>
                    <RoleChip role={user.role} />
                  </td>
                  <td>
                    <StatusChip status={user.status} />
                  </td>
                  <td>{user.phone ?? '—'}</td>
                  <td>{user.employmentType === 'CONTRACTOR' ? 'Contractor' : 'Employee'}</td>
                  <td>{formatDate(user.lastLoginAt)}</td>
                  <td className='text-end'>{formatDate(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className='flex justify-between items-center flex-wrap pli-6 border-bs plb-3 gap-2'>
          <div className='flex items-center gap-3'>
            <Typography color='text.disabled'>
              {meta && meta.total > 0
                ? `Showing ${(meta.page - 1) * meta.limit + 1} to ${Math.min(meta.page * meta.limit, meta.total)} of ${meta.total} users`
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

      <UserFormDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={user => router.push(`/users/${user.id}`)}
      />
    </div>
  )
}

export default UserList
