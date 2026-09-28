'use client'

// React Imports
import { useMemo, useState } from 'react'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Skeleton from '@mui/material/Skeleton'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Tooltip from '@mui/material/Tooltip'
import IconButton from '@mui/material/IconButton'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { Service } from '@/types/contractTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { useServicesQuery, useUpdateService } from '@/libs/api/queries/contracts'
import { errorMessage } from '@/libs/api/bff'

import ServiceDialog from './ServiceDialog'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

/** `canEdit` is ADMIN only: supervisors get the list read-only. */
type Props = { canEdit: boolean }

const matches = (service: Service, needle: string) =>
  service.name.toLowerCase().includes(needle) || (service.description ?? '').toLowerCase().includes(needle)

const ServicesCard = ({ canEdit }: Props) => {
  const services = useServicesQuery()
  const updateService = useUpdateService()

  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const all = useMemo(() => services.data ?? [], [services.data])
  const archivedCount = all.filter(service => !service.active).length
  const needle = search.trim().toLowerCase()
  const hasFilters = !!needle

  const rows = useMemo(
    () =>
      all
        .filter(service => (showArchived || service.active) && (!needle || matches(service, needle)))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [all, showArchived, needle]
  )

  const openDialog = (service: Service | null) => {
    setEditing(service)
    setDialogOpen(true)
  }

  const toggleActive = async (service: Service) => {
    setTogglingId(service.id)

    try {
      await updateService.mutateAsync({ id: service.id, input: { active: !service.active } })
      toast.success(service.active ? `${service.name} archived` : `${service.name} restored`)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setTogglingId(null)
    }
  }

  const columns = canEdit ? 4 : 3

  return (
    <Card>
      <CardHeader
        title='Services'
        subheader={
          services.data
            ? `${all.length - archivedCount} active${archivedCount ? ` · ${archivedCount} archived` : ''}`
            : undefined
        }
        action={
          canEdit && (
            <Button variant='contained' startIcon={<i className='bx-plus' />} onClick={() => openDialog(null)}>
              Add service
            </Button>
          )
        }
      />

      <div className='flex flex-wrap items-center gap-4 pli-6 pbe-6'>
        <CustomTextField
          className='min-is-[240px] flex-1'
          placeholder='Search services'
          value={search}
          onChange={e => setSearch(e.target.value)}
          slotProps={{ input: { startAdornment: <i className='bx-search mie-2 text-textDisabled' /> } }}
        />
        <FormControlLabel
          control={<Switch checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />}
          label='Show archived'
        />
      </div>

      {services.isFetching && <LinearProgress className='bs-0.5' />}
      <Divider />

      {services.isError && (
        <div className='p-6 flex items-center justify-between gap-4'>
          <Typography color='error'>{errorMessage(services.error)}</Typography>
          <Button variant='tonal' onClick={() => services.refetch()}>
            Retry
          </Button>
        </div>
      )}

      <div className='overflow-x-auto'>
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th>Service</th>
              <th>Status</th>
              <th>Created</th>
              {canEdit && <th className='text-end'>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {services.isPending &&
              [0, 1, 2, 3].map(i => (
                <tr key={i}>
                  {Array.from({ length: columns }).map((_, j) => (
                    <td key={j}>
                      <Skeleton />
                    </td>
                  ))}
                </tr>
              ))}
            {!services.isPending && !services.isError && rows.length === 0 && (
              <tr>
                <td colSpan={columns} className='text-center plb-12'>
                  <div className='flex flex-col items-center gap-2'>
                    <i className='bx-package text-5xl text-textDisabled' />
                    <Typography variant='h6'>
                      {hasFilters ? 'No services match this search' : 'No services yet'}
                    </Typography>
                    <Typography color='text.secondary'>
                      {hasFilters
                        ? 'Try another name, or show archived services.'
                        : archivedCount > 0 && !showArchived
                          ? 'Every service is archived. Turn on “Show archived” to restore one.'
                          : 'Add the services you sell so contract lines and site surveys can use them.'}
                    </Typography>
                    {canEdit && !hasFilters && (
                      <Button variant='tonal' onClick={() => openDialog(null)} className='mbs-2'>
                        Add your first service
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            )}
            {rows.map(service => (
              <tr key={service.id}>
                <td>
                  <div className='flex flex-col'>
                    <Typography color={service.active ? 'text.primary' : 'text.disabled'} className='font-medium'>
                      {service.name}
                    </Typography>
                    {service.description && (
                      <Typography variant='body2' color='text.disabled' className='line-clamp-2'>
                        {service.description}
                      </Typography>
                    )}
                  </div>
                </td>
                <td>
                  <Chip
                    size='small'
                    variant='tonal'
                    color={service.active ? 'success' : 'secondary'}
                    label={service.active ? 'Active' : 'Archived'}
                  />
                </td>
                <td>
                  <Typography variant='body2'>{new Date(service.createdAt).toLocaleDateString()}</Typography>
                </td>
                {canEdit && (
                  <td className='text-end whitespace-nowrap'>
                    <Tooltip title='Edit'>
                      <IconButton size='small' onClick={() => openDialog(service)}>
                        <i className='bx-edit text-textSecondary' />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={service.active ? 'Archive' : 'Restore'}>
                      <span>
                        <IconButton
                          size='small'
                          disabled={togglingId === service.id}
                          onClick={() => void toggleActive(service)}
                        >
                          <i
                            className={
                              service.active ? 'bx-archive-in text-textSecondary' : 'bx-archive-out text-success'
                            }
                          />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ServiceDialog open={dialogOpen} service={editing} onClose={() => setDialogOpen(false)} />
    </Card>
  )
}

export default ServicesCard
