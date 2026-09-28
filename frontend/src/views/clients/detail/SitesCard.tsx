'use client'

// React Imports
import { useState } from 'react'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { Client, Site } from '@/types/contractTypes'

// Component Imports
import OptionMenu from '@core/components/option-menu'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useClientSites, useUpdateSite } from '@/libs/api/queries/contracts'

import SiteDialog from '../../contracts/detail/SiteDialog'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

type Props = { client: Client; isAdmin: boolean }

/** The client's service locations: add, edit, deactivate. Contract lines and coverage point at these. */
const SitesCard = ({ client, isAdmin }: Props) => {
  const sites = useClientSites(client.id)
  const updateSite = useUpdateSite()
  const [dialog, setDialog] = useState<{ site?: Site } | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  const all = sites.data ?? []
  const rows = showInactive ? all : all.filter(site => site.active)
  const inactiveCount = all.length - all.filter(site => site.active).length

  const toggleActive = async (site: Site) => {
    try {
      await updateSite.mutateAsync({ id: site.id, input: { active: !site.active } })
      toast.success(`${site.name} ${site.active ? 'deactivated' : 'reactivated'}`)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <Card>
      <CardHeader
        title='Sites'
        subheader={`${all.length - inactiveCount} active${inactiveCount ? ` · ${inactiveCount} inactive` : ''}`}
        action={
          <div className='flex items-center gap-2'>
            {inactiveCount > 0 && (
              <FormControlLabel
                control={
                  <Switch size='small' checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
                }
                label='Show inactive'
              />
            )}
            {isAdmin && (
              <Button
                variant='contained'
                size='small'
                startIcon={<i className='bx-plus' />}
                onClick={() => setDialog({})}
              >
                Add site
              </Button>
            )}
          </div>
        }
      />
      <div className='overflow-x-auto'>
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th>Site</th>
              <th>On-site contact</th>
              <th>Access notes</th>
              <th>Status</th>
              {isAdmin && <th className='text-end'>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {sites.isPending &&
              [0, 1].map(i => (
                <tr key={i}>
                  {Array.from({ length: isAdmin ? 5 : 4 }).map((_, j) => (
                    <td key={j}>
                      <Skeleton />
                    </td>
                  ))}
                </tr>
              ))}
            {sites.isError && (
              <tr>
                <td colSpan={5}>
                  <Typography color='error'>{errorMessage(sites.error)}</Typography>
                </td>
              </tr>
            )}
            {!sites.isPending && rows.length === 0 && (
              <tr>
                <td colSpan={5} className='text-center plb-8'>
                  <Typography color='text.secondary'>
                    No sites yet. Add the first location this client wants serviced.
                  </Typography>
                </td>
              </tr>
            )}
            {rows.map(site => (
              <tr key={site.id}>
                <td>
                  <div className='flex items-start gap-2'>
                    <i className='bx-map-pin text-xl text-textSecondary mbs-0.5' />
                    <div className='flex flex-col'>
                      <Typography color='text.primary' className='font-medium'>
                        {site.name}
                      </Typography>
                      <Typography variant='body2' color='text.disabled'>
                        {site.address}
                      </Typography>
                    </div>
                  </div>
                </td>
                <td>
                  {site.contactName || site.contactPhone ? (
                    <div className='flex flex-col'>
                      <Typography>{site.contactName ?? '—'}</Typography>
                      {site.contactPhone && (
                        <Typography
                          variant='body2'
                          component='a'
                          href={`tel:${site.contactPhone}`}
                          color='primary.main'
                        >
                          {site.contactPhone}
                        </Typography>
                      )}
                    </div>
                  ) : (
                    <Typography color='text.disabled'>—</Typography>
                  )}
                </td>
                <td>
                  <Typography
                    variant='body2'
                    className='max-is-[240px] line-clamp-2'
                    title={site.accessNotes ?? undefined}
                  >
                    {site.accessNotes ?? '—'}
                  </Typography>
                </td>
                <td>
                  <Chip
                    size='small'
                    variant='tonal'
                    color={site.active ? 'success' : 'secondary'}
                    label={site.active ? 'Active' : 'Inactive'}
                  />
                </td>
                {isAdmin && (
                  <td className='text-end'>
                    <OptionMenu
                      iconButtonProps={{ size: 'small' }}
                      iconClassName='text-textSecondary'
                      options={[
                        {
                          text: 'Edit',
                          icon: <i className='bx-edit' />,
                          menuItemProps: { onClick: () => setDialog({ site }), className: 'flex items-center gap-2' }
                        },
                        {
                          text: site.active ? 'Deactivate' : 'Reactivate',
                          icon: <i className={site.active ? 'bx-block' : 'bx-revision'} />,
                          menuItemProps: {
                            onClick: () => toggleActive(site),
                            className: `flex items-center gap-2 ${site.active ? 'text-error' : ''}`
                          }
                        }
                      ]}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SiteDialog
        open={!!dialog}
        site={dialog?.site}
        clientId={client.id}
        clientName={client.legalName}
        onClose={() => setDialog(null)}
      />
    </Card>
  )
}

export default SitesCard
