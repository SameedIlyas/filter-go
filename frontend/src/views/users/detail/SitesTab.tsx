'use client'

// React Imports
import { useState } from 'react'

// Next Imports
import Link from 'next/link'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { Site } from '@/types/contractTypes'
import type { User } from '@/types/userTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import CustomAvatar from '@core/components/mui/Avatar'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useSaveUserSites, useSiteOptions, useUserSites } from '@/libs/api/queries/users'

type Props = { user: User; isAdmin: boolean }

const SitesTab = ({ user, isAdmin }: Props) => {
  const sites = useUserSites(user.id)
  const options = useSiteOptions(isAdmin)
  const save = useSaveUserSites(user.id)
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<Pick<Site, 'id' | 'name' | 'clientId' | 'active'>[]>([])

  if (user.role === 'CLIENT_USER') {
    return (
      <Alert severity='info'>
        Client users don&apos;t get site access here. They see every site that belongs to their client.
      </Alert>
    )
  }

  if (sites.isPending) return <Skeleton variant='rounded' height={260} />

  if (sites.isError) {
    return (
      <Alert
        severity='error'
        action={
          <Button color='inherit' size='small' onClick={() => sites.refetch()}>
            Retry
          </Button>
        }
      >
        {errorMessage(sites.error)}
      </Alert>
    )
  }

  const startEditing = () => {
    setSelected(sites.data.sites)
    setEditing(true)
  }

  const onSave = async () => {
    try {
      await save.mutateAsync(selected.map(site => site.id))
      toast.success('Site access updated')
      setEditing(false)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <Card>
      <CardHeader
        title='Site access'
        subheader='The sites this person can be scheduled at and, for supervisors, the sites they manage.'
        action={
          isAdmin && !editing ? (
            <Button variant='tonal' startIcon={<i className='bx-edit' />} onClick={startEditing}>
              Manage sites
            </Button>
          ) : null
        }
      />
      <CardContent className='flex flex-col gap-4'>
        {editing ? (
          <>
            <Autocomplete
              multiple
              disableCloseOnSelect
              loading={options.isPending}
              options={options.data ?? []}
              value={selected}
              onChange={(_, value) => setSelected(value)}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              getOptionLabel={site => site.name}
              renderInput={params => (
                <CustomTextField {...params} label='Sites' placeholder='Search sites' />
              )}
              renderValue={(value, getItemProps) =>
                value.map((site, index) => {
                  const { key, ...itemProps } = getItemProps({ index })

                  return <Chip key={key} size='small' label={site.name} {...itemProps} />
                })
              }
            />
            <div className='flex justify-end gap-3'>
              <Button variant='tonal' color='secondary' onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button variant='contained' onClick={onSave} disabled={save.isPending}>
                {save.isPending ? 'Saving…' : 'Save access'}
              </Button>
            </div>
          </>
        ) : sites.data.sites.length === 0 ? (
          <div className='flex flex-col items-center gap-2 plb-8 text-center'>
            <i className='bx-map-pin text-5xl text-textDisabled' />
            <Typography variant='h6'>No sites assigned</Typography>
            <Typography color='text.secondary'>
              {isAdmin ? 'Use “Manage sites” to give them access.' : 'An admin can assign sites.'}
            </Typography>
          </div>
        ) : (
          <div className='grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'>
            {sites.data.sites.map(site => (
              <div key={site.id} className='flex items-center gap-3 p-3 border rounded'>
                <CustomAvatar variant='rounded' skin='light' color={site.active ? 'primary' : 'secondary'} size={36}>
                  <i className='bx-map-pin' />
                </CustomAvatar>
                <div className='flex flex-col min-is-0'>
                  <Typography
                    component={Link}
                    href={`/clients/${site.clientId}`}
                    className='font-medium truncate hover:text-primary'
                    color='text.primary'
                  >
                    {site.name}
                  </Typography>
                  <Typography variant='body2' color='text.disabled'>
                    {site.active ? 'Active site' : 'Inactive site'}
                  </Typography>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default SitesTab
