'use client'

// React Imports
import { useState } from 'react'
import type { ReactNode } from 'react'

// Next Imports
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Alert from '@mui/material/Alert'

// Third-party Imports
import { toast } from 'react-toastify'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useClientQuery, useContractsQuery, useUpdateClient } from '@/libs/api/queries/contracts'
import { useSession } from '@/contexts/sessionContext'
import { getInitials } from '@/utils/getInitials'

import ClientDialog from '../ClientDialog'
import SitesCard from './SitesCard'
import CreateContractDialog from '../../contracts/CreateContractDialog'
import { ConfirmDialog } from '../../contracts/detail/ActionDialogs'
import { StatusChip, billingCycleLabel, billingTypeLabel, formatTerm, paymentTermsLabel } from '../../contracts/shared'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

const InfoRow = ({ icon, label, children }: { icon: string; label: string; children: ReactNode }) => (
  <div className='flex items-start gap-3'>
    <i className={`${icon} text-xl text-textSecondary mbs-0.5`} />
    <div className='flex flex-col min-is-0'>
      <Typography variant='body2' color='text.disabled'>
        {label}
      </Typography>
      <div className='break-words'>{children}</div>
    </div>
  </div>
)

const ClientDetail = ({ id }: { id: string }) => {
  const router = useRouter()
  const session = useSession()
  const isAdmin = session?.role === 'ADMIN'
  const client = useClientQuery(id)
  const contracts = useContractsQuery({ clientId: id, latestOnly: 'true', limit: 100 })
  const updateClient = useUpdateClient(id)

  const [editOpen, setEditOpen] = useState(false)
  const [contractOpen, setContractOpen] = useState(false)
  const [confirmActive, setConfirmActive] = useState(false)

  if (client.isPending) {
    return (
      <div className='flex flex-col gap-6'>
        <Skeleton variant='rounded' height={120} />
        <div className='grid gap-6 grid-cols-1 lg:grid-cols-3'>
          <Skeleton variant='rounded' height={360} />
          <Skeleton variant='rounded' height={360} className='lg:col-span-2' />
        </div>
      </div>
    )
  }

  if (client.isError || !client.data) {
    return (
      <Card>
        <CardContent className='flex flex-col items-center gap-3 plb-12'>
          <i className='bx-error-circle text-5xl text-error' />
          <Typography variant='h5'>Couldn&apos;t load this client</Typography>
          <Typography color='text.secondary'>{errorMessage(client.error)}</Typography>
          <div className='flex gap-3'>
            <Button variant='tonal' onClick={() => client.refetch()}>
              Retry
            </Button>
            <Button component={Link} href='/clients' variant='contained'>
              Back to clients
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const data = client.data
  const rows = contracts.data?.contracts ?? []
  const running = rows.filter(c => c.status === 'ACTIVE' || c.status === 'SUSPENDED').length

  const toggleActive = async () => {
    try {
      await updateClient.mutateAsync({ active: !data.active })
      toast.success(`${data.legalName} ${data.active ? 'deactivated' : 'reactivated'}`)
      setConfirmActive(false)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex items-center gap-2'>
        <Button
          component={Link}
          href='/clients'
          variant='text'
          color='secondary'
          startIcon={<i className='bx-arrow-back' />}
        >
          All clients
        </Button>
      </div>

      <Card>
        <CardContent className='flex flex-wrap items-start justify-between gap-4'>
          <div className='flex items-center gap-4'>
            <CustomAvatar
              skin='light'
              color={data.active ? 'primary' : 'secondary'}
              size={56}
              variant='rounded'
              className='text-xl'
            >
              {getInitials(data.legalName).slice(0, 2)}
            </CustomAvatar>
            <div className='flex flex-col gap-1'>
              <div className='flex flex-wrap items-center gap-2'>
                <Typography variant='h4'>{data.legalName}</Typography>
                <Chip
                  size='small'
                  variant='tonal'
                  color={data.active ? 'success' : 'secondary'}
                  label={data.active ? 'Active' : 'Inactive'}
                />
              </div>
              <Typography color='text.secondary'>
                {running} running contract{running === 1 ? '' : 's'} · client since{' '}
                {new Date(data.createdAt).toLocaleDateString()}
              </Typography>
            </div>
          </div>
          {isAdmin && (
            <div className='flex flex-wrap gap-3'>
              <Button variant='tonal' color={data.active ? 'error' : 'success'} onClick={() => setConfirmActive(true)}>
                {data.active ? 'Deactivate' : 'Reactivate'}
              </Button>
              <Button
                variant='tonal'
                color='secondary'
                startIcon={<i className='bx-edit' />}
                onClick={() => setEditOpen(true)}
              >
                Edit
              </Button>
              {data.active && (
                <Button variant='contained' startIcon={<i className='bx-plus' />} onClick={() => setContractOpen(true)}>
                  New contract
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {!data.active && (
        <Alert severity='info' variant='outlined'>
          This client is inactive: it is hidden from pickers and cannot get new contracts. Existing contracts are not
          changed.
        </Alert>
      )}

      <div className='grid gap-6 grid-cols-1 lg:grid-cols-3 items-start'>
        <Card>
          <CardHeader title='Billing details' />
          <CardContent className='flex flex-col gap-4'>
            <InfoRow icon='bx-envelope' label='Billing email'>
              <Typography component='a' href={`mailto:${data.billingEmail}`} color='primary.main'>
                {data.billingEmail}
              </Typography>
            </InfoRow>
            <InfoRow icon='bx-map' label='Billing address'>
              <Typography color={data.billingAddress ? 'text.primary' : 'text.disabled'}>
                {data.billingAddress ?? '—'}
              </Typography>
            </InfoRow>
            <InfoRow icon='bx-time-five' label='Payment terms'>
              <Typography color='text.primary'>{paymentTermsLabel(data.paymentTerms)}</Typography>
            </InfoRow>
            {isAdmin && (
              <InfoRow icon='bx-link' label='Accounting / payments'>
                <Typography color={data.accountingRef || data.stripeCustomerId ? 'text.primary' : 'text.disabled'}>
                  {[data.accountingRef && `QuickBooks ${data.accountingRef}`, data.stripeCustomerId && 'Stripe linked']
                    .filter(Boolean)
                    .join(' · ') || 'Not synced yet'}
                </Typography>
              </InfoRow>
            )}
          </CardContent>
        </Card>

        <div className='lg:col-span-2 flex flex-col gap-6'>
          <SitesCard client={data} isAdmin={isAdmin} />

          <Card>
            <CardHeader title='Contracts' subheader='Latest version of each contract with this client' />
            <div className='overflow-x-auto'>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th>Term</th>
                    <th>Billing</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.isPending && (
                    <tr>
                      <td colSpan={4}>
                        <Skeleton />
                      </td>
                    </tr>
                  )}
                  {contracts.isError && (
                    <tr>
                      <td colSpan={4}>
                        <Typography color='error'>{errorMessage(contracts.error)}</Typography>
                      </td>
                    </tr>
                  )}
                  {!contracts.isPending && rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className='text-center plb-8'>
                        <Typography color='text.secondary'>No contracts with this client yet.</Typography>
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
                      </td>
                      <td>{formatTerm(contract.startDate, contract.endDate)}</td>
                      <td>
                        {billingTypeLabel(contract.billingType)} ·{' '}
                        {billingCycleLabel(contract.billingCycle).toLowerCase()}
                      </td>
                      <td>
                        <StatusChip status={contract.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      {isAdmin && (
        <>
          <ClientDialog open={editOpen} client={data} onClose={() => setEditOpen(false)} />
          <CreateContractDialog
            open={contractOpen}
            initialClient={data}
            onClose={() => setContractOpen(false)}
            onCreated={contract => router.push(`/contracts/${contract.id}`)}
          />
          <ConfirmDialog
            open={confirmActive}
            title={data.active ? `Deactivate ${data.legalName}?` : `Reactivate ${data.legalName}?`}
            confirmLabel={data.active ? 'Deactivate' : 'Reactivate'}
            color={data.active ? 'error' : 'success'}
            busy={updateClient.isPending}
            onConfirm={toggleActive}
            onClose={() => setConfirmActive(false)}
          >
            {data.active
              ? 'The client disappears from pickers and cannot get new contracts. Running contracts keep going until you end them.'
              : 'The client can be picked for new contracts again.'}
          </ConfirmDialog>
        </>
      )}
    </div>
  )
}

export default ClientDetail
