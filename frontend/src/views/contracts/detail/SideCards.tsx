// React Imports
import type { ReactNode } from 'react'

// Next Imports
import Link from 'next/link'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import Chip from '@mui/material/Chip'

// Type Imports
import type { Client, ContractDetail } from '@/types/contractTypes'

// Lib Imports
import { fileUrl } from '@/libs/api/files'

import { StatusChip, billingCycleLabel, billingTypeLabel, formatDay, paymentTermsLabel } from '../shared'

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

const Value = ({ children, muted }: { children: ReactNode; muted?: boolean }) => (
  <Typography color={muted ? 'text.disabled' : 'text.primary'}>{children}</Typography>
)

/** The reference app's "Billing Information" panel, plus who the contract is with. */
export const BillingCard = ({ contract, client }: { contract: ContractDetail; client: Client | undefined }) => (
  <Card>
    <CardHeader title='Billing information' />
    <CardContent className='flex flex-col gap-4'>
      <InfoRow icon='bx-buildings' label='Client'>
        <Typography
          component={Link}
          href={`/clients/${contract.client.id}`}
          color='text.primary'
          className='hover:text-primary'
        >
          {contract.client.legalName}
        </Typography>
        {client && (
          <Typography variant='body2' component='a' href={`mailto:${client.billingEmail}`} color='primary.main'>
            {client.billingEmail}
          </Typography>
        )}
      </InfoRow>
      {client?.billingAddress && (
        <InfoRow icon='bx-map' label='Billing address'>
          <Value>{client.billingAddress}</Value>
        </InfoRow>
      )}
      <Divider />
      <InfoRow icon='bx-receipt' label='Billing type'>
        <Value>{billingTypeLabel(contract.billingType)}</Value>
      </InfoRow>
      <InfoRow icon='bx-sync' label='Billing cycle'>
        <Value>{billingCycleLabel(contract.billingCycle)}</Value>
      </InfoRow>
      <InfoRow icon='bx-time-five' label='Payment terms'>
        <Value muted={!client}>{client ? paymentTermsLabel(client.paymentTerms) : '—'}</Value>
      </InfoRow>
      <Divider />
      <InfoRow icon='bx-calendar' label='Billing start date'>
        <Value>{formatDay(contract.startDate)}</Value>
      </InfoRow>
      <InfoRow icon='bx-calendar-x' label='Billing end date'>
        <Value muted={!contract.endDate}>{contract.endDate ? formatDay(contract.endDate) : 'Open-ended'}</Value>
      </InfoRow>
      <InfoRow icon='bx-refresh' label='Auto-renew'>
        <Value>{contract.autoRenew ? 'Yes, one year at a time' : 'No'}</Value>
      </InfoRow>
      <Divider />
      <InfoRow icon='bx-pen' label='Signature'>
        {contract.signedAt ? (
          <>
            <Value>{contract.signedBy}</Value>
            <Typography variant='body2' color='text.disabled'>
              {new Date(contract.signedAt).toLocaleString()}
            </Typography>
            {contract.documentFileId && (
              <Typography
                variant='body2'
                component='a'
                href={fileUrl(contract.documentFileId)}
                target='_blank'
                rel='noreferrer'
                color='primary.main'
                className='flex items-center gap-1'
              >
                <i className='bx-file-pdf' /> Signed document
              </Typography>
            )}
          </>
        ) : (
          <Value muted>Not signed yet</Value>
        )}
      </InfoRow>
      {contract.leadId && (
        <InfoRow icon='bx-target-lock' label='Origin'>
          <Typography component={Link} href={`/leads/${contract.leadId}`} color='primary.main'>
            Converted from a lead
          </Typography>
        </InfoRow>
      )}
    </CardContent>
  </Card>
)

/** Every version of this contract number; the one on screen is highlighted. */
export const VersionsCard = ({ contract }: { contract: ContractDetail }) => (
  <Card>
    <CardHeader
      title='Versions'
      subheader='Rates, lines or coverage of a signed contract change through a new version.'
    />
    <CardContent className='flex flex-col gap-2'>
      {[...contract.versions].reverse().map(version => {
        const current = version.id === contract.id

        return (
          <Link
            key={version.id}
            href={`/contracts/${version.id}`}
            className={`flex items-center justify-between gap-2 rounded p-2 ${current ? 'bg-primaryLighter' : 'hover:bg-actionHover'}`}
          >
            <div className='flex items-center gap-2'>
              <Chip
                size='small'
                variant={current ? 'filled' : 'outlined'}
                color={current ? 'primary' : 'default'}
                label={`v${version.version}`}
              />
              <Typography color='text.primary'>{current ? 'This version' : `Version ${version.version}`}</Typography>
            </div>
            <StatusChip status={version.status} />
          </Link>
        )
      })}
      {contract.versions.length <= 1 && (
        <Typography variant='body2' color='text.disabled'>
          Only one version so far. {contract.status === 'ACTIVE' ? 'Use “New version” to change terms.' : ''}
        </Typography>
      )}
    </CardContent>
  </Card>
)
