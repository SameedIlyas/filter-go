// React Imports
import type { ReactNode } from 'react'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'

// Type Imports
import type { User } from '@/types/userTypes'

// Lib Imports
import { useClientQuery } from '@/libs/api/queries/contracts'

import { EMPLOYMENT_META, ROLE_META, RoleChip, StatusChip, formatDate, formatDay, formatMoney } from '../shared'

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className='flex flex-col gap-0.5 min-is-0'>
    <Typography variant='body2' color='text.disabled'>
      {label}
    </Typography>
    <div className='break-words'>{children}</div>
  </div>
)

type Props = {
  user: User
  canEdit: boolean
  onEdit: () => void
}

const ProfileTab = ({ user, canEdit, onEdit }: Props) => {
  const client = useClientQuery(user.role === 'CLIENT_USER' ? (user.clientId ?? undefined) : undefined)
  const [firstName, ...rest] = user.name.split(' ')

  const editAction = canEdit ? (
    <IconButton size='small' onClick={onEdit} aria-label='Edit user'>
      <i className='bx-edit text-textSecondary' />
    </IconButton>
  ) : null

  return (
    <div className='flex flex-col gap-6'>
      <div className='grid gap-6 grid-cols-1 xl:grid-cols-2'>
        <Card>
          <CardHeader title='Basic information' action={editAction} />
          <CardContent className='grid gap-4 grid-cols-1 sm:grid-cols-2'>
            <Field label='First name'>{firstName}</Field>
            <Field label='Last name'>{rest.join(' ') || '—'}</Field>
            <Field label='Email'>{user.email}</Field>
            <Field label='Phone'>{user.phone ?? '—'}</Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title='Job details' action={editAction} />
          <CardContent className='grid gap-4 grid-cols-1 sm:grid-cols-2'>
            <Field label='Role'>
              <RoleChip role={user.role} />
            </Field>
            <Field label='Type'>{EMPLOYMENT_META[user.employmentType]}</Field>
            {user.defaultPayRate !== undefined && (
              <Field label='Base rate / hour'>{formatMoney(user.defaultPayRate)}</Field>
            )}
            <Field label='Hire date'>{formatDay(user.hiredAt)}</Field>
            {user.role === 'CLIENT_USER' && (
              <Field label='Client'>{client.data?.legalName ?? (client.isPending ? '…' : '—')}</Field>
            )}
            <Field label='Access'>
              <Typography variant='body2' color='text.secondary'>
                {ROLE_META[user.role].hint}
              </Typography>
            </Field>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader title='Account' />
        <CardContent className='grid gap-4 grid-cols-1 sm:grid-cols-3'>
          <Field label='Status'>
            <StatusChip status={user.status} />
          </Field>
          <Field label='Member since'>{formatDate(user.createdAt)}</Field>
          <Field label='Last sign-in'>{formatDate(user.lastLoginAt)}</Field>
        </CardContent>
      </Card>
    </div>
  )
}

export default ProfileTab
