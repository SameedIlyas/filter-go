'use client'

// React Imports
import { useState } from 'react'
import type { SyntheticEvent } from 'react'

// Next Imports
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Tab from '@mui/material/Tab'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import TabContext from '@mui/lab/TabContext'
import TabPanel from '@mui/lab/TabPanel'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { User } from '@/types/userTypes'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'
import CustomTabList from '@core/components/mui/TabList'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useInviteUser, useRevokeUserSessions, useUpdateUser, useUserQuery } from '@/libs/api/queries/users'
import { useSession } from '@/contexts/sessionContext'
import { getInitials } from '@/utils/getInitials'

import UserRail from './UserRail'
import ProfileTab from './ProfileTab'
import AvailabilityTab from './AvailabilityTab'
import SitesTab from './SitesTab'
import DocumentsTab from './DocumentsTab'
import UserFormDialog from '../UserFormDialog'
import { ConfirmDialog } from '../../contracts/detail/ActionDialogs'
import { ROLE_META, RoleChip, StatusChip } from '../shared'

const TABS = [
  { value: 'profile', label: 'Profile', icon: 'bx-user' },
  { value: 'availability', label: 'Availability', icon: 'bx-calendar-check' },
  { value: 'sites', label: 'Site access', icon: 'bx-map-pin' },
  { value: 'documents', label: 'Documents', icon: 'bx-file' }
] as const

type TabValue = (typeof TABS)[number]['value']

type Confirm = 'disable' | 'enable' | 'revoke' | null

const AdminActions = ({ user, onEdit }: { user: User; onEdit: () => void }) => {
  const update = useUpdateUser(user.id)
  const invite = useInviteUser()
  const revoke = useRevokeUserSessions(user.id)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)

  const close = () => setAnchor(null)

  const resendInvite = async () => {
    close()

    try {
      const { emailSent } = await invite.mutateAsync({
        email: user.email,
        name: user.name,
        role: user.role,
        employmentType: user.employmentType,
        ...(user.clientId ? { clientId: user.clientId } : {}),
        ...(user.phone ? { phone: user.phone } : {}),
        ...(user.defaultPayRate ? { defaultPayRate: user.defaultPayRate } : {}),
        ...(user.hiredAt ? { hiredAt: user.hiredAt } : {})
      })

      if (emailSent) toast.success(`Invitation re-sent to ${user.email}`)
      else toast.error('The invite email could not be sent. Try again shortly.')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const onConfirm = async () => {
    try {
      if (confirm === 'revoke') {
        const count = await revoke.mutateAsync()

        toast.success(count === 1 ? 'Signed out of 1 device' : `Signed out of ${count} devices`)
      } else {
        await update.mutateAsync({ status: confirm === 'disable' ? 'DISABLED' : 'ACTIVE' })
        toast.success(`${user.name} ${confirm === 'disable' ? 'disabled' : 're-enabled'}`)
      }

      setConfirm(null)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <>
      <div className='flex gap-2'>
        <Button variant='contained' startIcon={<i className='bx-edit' />} onClick={onEdit}>
          Edit
        </Button>
        <Button
          variant='tonal'
          color='secondary'
          onClick={e => setAnchor(e.currentTarget)}
          endIcon={<i className='bx-chevron-down' />}
        >
          More
        </Button>
      </div>
      <Menu anchorEl={anchor} open={!!anchor} onClose={close}>
        {user.status === 'INVITED' && (
          <MenuItem onClick={resendInvite} disabled={invite.isPending}>
            <ListItemIcon>
              <i className='bx-send' />
            </ListItemIcon>
            Re-send invite
          </MenuItem>
        )}
        {user.status === 'ACTIVE' && (
          <MenuItem onClick={() => (close(), setConfirm('revoke'))}>
            <ListItemIcon>
              <i className='bx-log-out' />
            </ListItemIcon>
            Sign out of all devices
          </MenuItem>
        )}
        {user.status === 'DISABLED' ? (
          <MenuItem onClick={() => (close(), setConfirm('enable'))}>
            <ListItemIcon>
              <i className='bx-lock-open' />
            </ListItemIcon>
            Re-enable user
          </MenuItem>
        ) : (
          <MenuItem onClick={() => (close(), setConfirm('disable'))} className='text-error'>
            <ListItemIcon>
              <i className='bx-block text-error' />
            </ListItemIcon>
            Disable user
          </MenuItem>
        )}
      </Menu>
      <ConfirmDialog
        open={!!confirm}
        title={
          confirm === 'disable'
            ? `Disable ${user.name}?`
            : confirm === 'enable'
              ? `Re-enable ${user.name}?`
              : `Sign ${user.name} out everywhere?`
        }
        confirmLabel={confirm === 'disable' ? 'Disable' : confirm === 'enable' ? 'Re-enable' : 'Sign out'}
        color={confirm === 'disable' ? 'error' : 'primary'}
        busy={update.isPending || revoke.isPending}
        onConfirm={onConfirm}
        onClose={() => setConfirm(null)}
      >
        {confirm === 'disable'
          ? 'They will be signed out right away and won’t be able to sign in. Their history is kept, and you can re-enable them later.'
          : confirm === 'enable'
            ? 'They will be able to sign in again with their existing password.'
            : 'Every active session ends now. They can sign in again with their password.'}
      </ConfirmDialog>
    </>
  )
}

const UserDetail = ({ id }: { id: string }) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const session = useSession()
  const user = useUserQuery(id)
  const [editOpen, setEditOpen] = useState(false)

  const isAdmin = session?.role === 'ADMIN'
  const isStaff = isAdmin || session?.role === 'SUPERVISOR'
  const isSelf = session?.id === id
  const requested = searchParams.get('tab')
  const tab: TabValue = TABS.some(t => t.value === requested) ? (requested as TabValue) : 'profile'

  const onTab = (_: SyntheticEvent, value: string) => router.replace(`${pathname}?tab=${value}`, { scroll: false })

  const main = (() => {
    if (user.isPending) {
      return (
        <div className='flex flex-col gap-6'>
          <Skeleton variant='rounded' height={120} />
          <Skeleton variant='rounded' height={48} />
          <Skeleton variant='rounded' height={320} />
        </div>
      )
    }

    if (user.isError || !user.data) {
      return (
        <Card>
          <CardContent className='flex flex-col items-center gap-3 plb-12'>
            <i className='bx-error-circle text-5xl text-error' />
            <Typography variant='h5'>Couldn&apos;t load this user</Typography>
            <Typography color='text.secondary'>{errorMessage(user.error)}</Typography>
            <div className='flex gap-3'>
              <Button variant='tonal' onClick={() => user.refetch()}>
                Retry
              </Button>
              <Button component={Link} href='/users' variant='contained'>
                Back to users
              </Button>
            </div>
          </CardContent>
        </Card>
      )
    }

    const data = user.data

    return (
      <div className='flex flex-col gap-6'>
        <Card>
          <CardContent className='flex flex-wrap items-center justify-between gap-6'>
            <div className='flex items-center gap-4 min-is-0'>
              <CustomAvatar src={data.image ?? undefined} skin='light' color={ROLE_META[data.role].color} size={64}>
                <span className='text-2xl'>{getInitials(data.name).slice(0, 2)}</span>
              </CustomAvatar>
              <div className='flex flex-col gap-1 min-is-0'>
                <Typography variant='h4' className='truncate'>
                  {data.name}
                </Typography>
                <div className='flex flex-wrap items-center gap-2'>
                  <RoleChip role={data.role} />
                  <StatusChip status={data.status} />
                </div>
              </div>
            </div>
            <div className='flex flex-wrap items-center gap-6'>
              <div className='flex flex-col'>
                <Typography variant='body2' color='text.disabled'>
                  Email
                </Typography>
                <Typography>{data.email}</Typography>
              </div>
              <div className='flex flex-col'>
                <Typography variant='body2' color='text.disabled'>
                  Phone
                </Typography>
                <Typography>{data.phone ?? '—'}</Typography>
              </div>
              {isAdmin && !isSelf && <AdminActions user={data} onEdit={() => setEditOpen(true)} />}
            </div>
          </CardContent>
        </Card>

        <TabContext value={tab}>
          <CustomTabList onChange={onTab} variant='scrollable' pill='true'>
            {TABS.map(t => (
              <Tab key={t.value} value={t.value} label={t.label} icon={<i className={t.icon} />} iconPosition='start' />
            ))}
          </CustomTabList>
          <TabPanel value='profile' className='p-0'>
            <ProfileTab user={data} canEdit={isAdmin && !isSelf} onEdit={() => setEditOpen(true)} />
          </TabPanel>
          <TabPanel value='availability' className='p-0'>
            <AvailabilityTab userId={data.id} canEdit={isStaff || isSelf} />
          </TabPanel>
          <TabPanel value='sites' className='p-0'>
            <SitesTab user={data} isAdmin={isAdmin} />
          </TabPanel>
          <TabPanel value='documents' className='p-0'>
            <DocumentsTab userId={data.id} canAdd={isStaff || isSelf} canManage={isStaff} />
          </TabPanel>
        </TabContext>

        {isAdmin && <UserFormDialog open={editOpen} onClose={() => setEditOpen(false)} user={data} />}
      </div>
    )
  })()

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Button
          component={Link}
          href='/users'
          variant='text'
          color='secondary'
          startIcon={<i className='bx-arrow-back' />}
        >
          All users
        </Button>
      </div>
      <div className='grid gap-6 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] items-start'>
        {isStaff && (
          <div className='hidden lg:block'>
            <UserRail activeId={id} />
          </div>
        )}
        <div className={isStaff ? '' : 'lg:col-span-2'}>{main}</div>
      </div>
    </div>
  )
}

export default UserDetail
