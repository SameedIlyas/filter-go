'use client'

// React Imports
import { useEffect, useState } from 'react'

// Next Imports
import Link from 'next/link'

// MUI Imports
import Card from '@mui/material/Card'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import Divider from '@mui/material/Divider'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import CustomAvatar from '@core/components/mui/Avatar'

// Lib Imports
import { useUsersQuery } from '@/libs/api/queries/users'
import { getInitials } from '@/utils/getInitials'

import { ROLE_META } from '../shared'

/** Quick-switch list beside the profile, like the reference portal: search and jump between people. */
const UserRail = ({ activeId }: { activeId: string }) => {
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 350)

    return () => clearTimeout(id)
  }, [search])

  const users = useUsersQuery({ q: q || undefined, limit: 50 })
  const rows = users.data?.users ?? []

  return (
    <Card className='flex flex-col lg:sticky lg:top-6 lg:max-bs-[calc(100dvh-160px)]'>
      <div className='p-4'>
        <CustomTextField
          fullWidth
          size='small'
          placeholder='Search users'
          value={search}
          onChange={e => setSearch(e.target.value)}
          slotProps={{ input: { startAdornment: <i className='bx-search mie-2 text-textDisabled' /> } }}
        />
      </div>
      <Divider />
      <div className='overflow-y-auto max-bs-[320px] lg:max-bs-none lg:flex-1'>
        {users.isPending &&
          [0, 1, 2, 3, 4].map(i => (
            <div key={i} className='flex items-center gap-3 pli-4 plb-3'>
              <Skeleton variant='circular' width={34} height={34} />
              <Skeleton className='flex-1' />
            </div>
          ))}
        {!users.isPending && rows.length === 0 && (
          <Typography color='text.secondary' className='p-4 text-center'>
            No users found
          </Typography>
        )}
        {rows.map(user => {
          const active = user.id === activeId

          return (
            <Link
              key={user.id}
              href={`/users/${user.id}`}
              className={`flex items-center gap-3 pli-4 plb-3 border-be hover:bg-actionHover ${active ? 'bg-primaryLighter' : ''}`}
            >
              <CustomAvatar src={user.image ?? undefined} skin='light' color={ROLE_META[user.role].color} size={34}>
                {getInitials(user.name).slice(0, 2)}
              </CustomAvatar>
              <div className='flex flex-col min-is-0'>
                <Typography color={active ? 'primary' : 'text.primary'} className='font-medium truncate'>
                  {user.name}
                </Typography>
                <Typography variant='body2' color='text.disabled' className='truncate'>
                  {ROLE_META[user.role].label}
                  {user.status !== 'ACTIVE' ? ` · ${user.status === 'INVITED' ? 'Invited' : 'Disabled'}` : ''}
                </Typography>
              </div>
            </Link>
          )
        })}
      </div>
    </Card>
  )
}

export default UserRail
