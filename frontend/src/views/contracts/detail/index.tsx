'use client'

// React Imports
import { useState } from 'react'

// Next Imports
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Skeleton from '@mui/material/Skeleton'
import Chip from '@mui/material/Chip'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stepper from '@mui/material/Stepper'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { ContractDetail, ContractStatus, Site } from '@/types/contractTypes'
import type { FieldIssue } from '@/types/api'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'

// Lib Imports
import { BffError, errorMessage } from '@/libs/api/bff'
import type { LifecycleAction } from '@/libs/api/queries/contracts'
import {
  useClientQuery,
  useClientSites,
  useContractAction,
  useContractQuery,
  useServicesQuery,
  useTaxRatesQuery
} from '@/libs/api/queries/contracts'
import { useSession } from '@/contexts/sessionContext'

import SiteServices from './SiteServices'
import LinesDialog from './LinesDialog'
import CoverageDrawer from './CoverageDrawer'
import TermsDialog from './TermsDialog'
import SiteDialog from './SiteDialog'
import { BillingCard, VersionsCard } from './SideCards'
import HistoryCard from './HistoryCard'
import { CancelDialog, ConfirmDialog, SignDialog } from './ActionDialogs'
import { CANCELLABLE, STATUS_META, StatusChip, VERSIONABLE, formatTerm, parseRowPath } from '../shared'

const STEPS: ContractStatus[] = ['DRAFT', 'PENDING_SIGNATURE', 'ACTIVE']

type Confirm = 'submit' | 'suspend' | 'resume' | 'new-version' | null

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/** Rewrites server issues ("lines[2].billRate", "Site <uuid> ...") into sentences that name the site and line. */
const describeIssue = (issue: FieldIssue, contract: ContractDetail, sites: Site[]) => {
  const siteName = (id: string) => sites.find(site => site.id === id)?.name ?? 'a site'
  const message = issue.message.replace(UUID, id => siteName(id))
  const line = parseRowPath(issue.field, 'lines')

  if (line) {
    const row = contract.lines[line.index]

    return row ? `${row.description} (${siteName(row.siteId)}): ${message}` : message
  }

  const cov = parseRowPath(issue.field, 'coverage')

  if (cov) {
    const row = contract.coverage[cov.index]

    return row ? `Coverage at ${siteName(row.siteId)}: ${message}` : message
  }

  return message
}

/** What still blocks "Send for signature", computed locally so the admin sees it before trying. */
const readiness = (contract: ContractDetail) => {
  const lineSites = new Set(contract.lines.map(line => line.siteId))
  const covered = new Set(contract.coverage.map(row => row.siteId))

  return [
    { ok: contract.lines.length > 0, label: 'At least one service line' },
    {
      ok:
        contract.lines.length > 0 &&
        contract.lines.every(line => line.billRate === undefined || Number(line.billRate) > 0),
      label: 'Every line has a bill rate'
    },
    { ok: lineSites.size > 0 && [...lineSites].every(id => covered.has(id)), label: 'Every site has a coverage plan' }
  ]
}

const ContractDetailView = ({ id }: { id: string }) => {
  const router = useRouter()
  const session = useSession()
  const isAdmin = session?.role === 'ADMIN'
  const { data: contract, isPending, isError, error, refetch } = useContractQuery(id)
  const clientId = contract?.client.id
  const client = useClientQuery(clientId)
  const sites = useClientSites(clientId)
  const services = useServicesQuery()
  const taxRates = useTaxRatesQuery(isAdmin)
  const action = useContractAction(id)

  const [linesOpen, setLinesOpen] = useState<{ siteId?: string } | null>(null)
  const [coverageOpen, setCoverageOpen] = useState(false)
  const [termsOpen, setTermsOpen] = useState(false)
  const [siteOpen, setSiteOpen] = useState(false)
  const [newSiteId, setNewSiteId] = useState<string>()
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [signOpen, setSignOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [issues, setIssues] = useState<FieldIssue[]>([])

  if (isPending) {
    return (
      <div className='flex flex-col gap-6'>
        <Skeleton variant='rounded' height={170} />
        <div className='grid gap-6 grid-cols-1 lg:grid-cols-3'>
          <Skeleton variant='rounded' height={460} />
          <Skeleton variant='rounded' height={460} className='lg:col-span-2' />
        </div>
      </div>
    )
  }

  if (isError || !contract) {
    return (
      <Card>
        <CardContent className='flex flex-col items-center gap-3 plb-12'>
          <i className='bx-error-circle text-5xl text-error' />
          <Typography variant='h5'>Couldn&apos;t load this contract</Typography>
          <Typography color='text.secondary'>{errorMessage(error)}</Typography>
          <div className='flex gap-3'>
            <Button variant='tonal' onClick={() => refetch()}>
              Retry
            </Button>
            <Button component={Link} href='/contracts' variant='contained'>
              Back to contracts
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const siteList = sites.data ?? []
  const editable = isAdmin && contract.status === 'DRAFT'
  const checks = readiness(contract)
  const newer = contract.versions.find(v => v.version > contract.version && v.status !== 'CANCELLED')
  const activeStep = contract.status === 'SUSPENDED' ? 2 : STEPS.indexOf(contract.status)

  const run = async (input: LifecycleAction, success: string) => {
    try {
      const result = await action.mutateAsync(input)

      setIssues([])
      setConfirm(null)
      setSignOpen(false)
      setCancelOpen(false)
      toast.success(success)
      if (result.id !== contract.id) router.push(`/contracts/${result.id}`)
    } catch (err) {
      setConfirm(null)

      if (err instanceof BffError && err.code === 'VALIDATION_ERROR' && err.details?.issues?.length) {
        setIssues(err.details.issues)
        toast.error('The contract is not complete yet. See the list above.')
      } else {
        toast.error(errorMessage(err))
      }
    }
  }

  const moreActions = [
    ...(editable ? [{ label: 'Edit terms', icon: 'bx-edit', onClick: () => setTermsOpen(true) }] : []),
    ...(isAdmin && contract.status === 'ACTIVE'
      ? [{ label: 'Suspend', icon: 'bx-pause-circle', onClick: () => setConfirm('suspend') }]
      : []),
    ...(isAdmin && CANCELLABLE.includes(contract.status)
      ? [{ label: 'Cancel contract', icon: 'bx-x-circle', onClick: () => setCancelOpen(true), danger: true }]
      : [])
  ]

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex items-center gap-2'>
        <Button
          component={Link}
          href='/contracts'
          variant='text'
          color='secondary'
          startIcon={<i className='bx-arrow-back' />}
        >
          All contracts
        </Button>
      </div>

      <Card>
        <CardContent className='flex flex-col gap-6'>
          <div className='flex flex-wrap items-start justify-between gap-4'>
            <div className='flex items-center gap-4'>
              <CustomAvatar skin='light' color={STATUS_META[contract.status].color} size={56} variant='rounded'>
                <i className='bx-file text-3xl' />
              </CustomAvatar>
              <div className='flex flex-col gap-1'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Typography variant='h4'>{contract.contractNumber}</Typography>
                  <Chip size='small' variant='outlined' label={`v${contract.version}`} />
                  <StatusChip status={contract.status} size='medium' />
                </div>
                <Typography color='text.secondary'>
                  {contract.client.legalName} · {formatTerm(contract.startDate, contract.endDate)}
                </Typography>
              </div>
            </div>

            {isAdmin && (
              <div className='flex flex-wrap items-center gap-3'>
                {moreActions.length > 0 && (
                  <>
                    <Button
                      variant='tonal'
                      color='secondary'
                      endIcon={<i className='bx-chevron-down' />}
                      onClick={e => setMenuAnchor(e.currentTarget)}
                    >
                      Actions
                    </Button>
                    <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
                      {moreActions.map(item => (
                        <MenuItem
                          key={item.label}
                          className={`flex items-center gap-2 ${'danger' in item ? 'text-error' : ''}`}
                          onClick={() => {
                            setMenuAnchor(null)
                            item.onClick()
                          }}
                        >
                          <i className={item.icon} />
                          {item.label}
                        </MenuItem>
                      ))}
                    </Menu>
                  </>
                )}
                {contract.status === 'SUSPENDED' && (
                  <Button
                    variant='tonal'
                    color='success'
                    startIcon={<i className='bx-play-circle' />}
                    onClick={() => setConfirm('resume')}
                  >
                    Resume
                  </Button>
                )}
                {VERSIONABLE.includes(contract.status) && !newer && (
                  <Button
                    variant='tonal'
                    startIcon={<i className='bx-copy-alt' />}
                    onClick={() => setConfirm('new-version')}
                  >
                    New version
                  </Button>
                )}
                {contract.status === 'DRAFT' && (
                  <Button
                    variant='contained'
                    startIcon={<i className='bx-send' />}
                    onClick={() => setConfirm('submit')}
                  >
                    Send for signature
                  </Button>
                )}
                {contract.status === 'PENDING_SIGNATURE' && (
                  <Button
                    variant='contained'
                    color='success'
                    startIcon={<i className='bx-pen' />}
                    onClick={() => setSignOpen(true)}
                  >
                    Mark as signed
                  </Button>
                )}
              </div>
            )}
          </div>

          {contract.status === 'CANCELLED' || contract.status === 'EXPIRED' ? (
            <Alert
              severity={contract.status === 'CANCELLED' ? 'error' : 'info'}
              variant='outlined'
              icon={<i className={STATUS_META[contract.status].icon} />}
            >
              This contract is <b>{STATUS_META[contract.status].label.toLowerCase()}</b> and no longer generates visits
              or invoices.
              {newer && (
                <>
                  {' '}
                  <Link href={`/contracts/${newer.id}`} className='text-primary'>
                    Open version {newer.version}
                  </Link>
                  .
                </>
              )}
            </Alert>
          ) : (
            <Stepper activeStep={activeStep} alternativeLabel>
              {STEPS.map((step, index) => (
                <Step key={step} completed={index < activeStep || (step === 'ACTIVE' && contract.status === 'ACTIVE')}>
                  <StepLabel error={step === 'ACTIVE' && contract.status === 'SUSPENDED'}>
                    {step === 'ACTIVE' && contract.status === 'SUSPENDED' ? 'Suspended' : STATUS_META[step].label}
                  </StepLabel>
                </Step>
              ))}
            </Stepper>
          )}

          {newer && contract.status !== 'EXPIRED' && contract.status !== 'CANCELLED' && (
            <Alert severity='info' variant='outlined'>
              Version {newer.version} ({STATUS_META[newer.status].label.toLowerCase()}) will replace this one once it is
              signed.{' '}
              <Link href={`/contracts/${newer.id}`} className='text-primary'>
                Open it
              </Link>
            </Alert>
          )}

          {contract.status === 'DRAFT' && isAdmin && (
            <div className='flex flex-wrap items-center gap-x-6 gap-y-2'>
              <Typography variant='body2' className='font-medium'>
                Ready to send:
              </Typography>
              {checks.map(check => (
                <div key={check.label} className='flex items-center gap-1'>
                  <i
                    className={`${check.ok ? 'bx-check-circle text-success' : 'bx-circle text-textDisabled'} text-lg`}
                  />
                  <Typography variant='body2' color={check.ok ? 'text.primary' : 'text.secondary'}>
                    {check.label}
                  </Typography>
                </div>
              ))}
            </div>
          )}

          {issues.length > 0 && (
            <Alert severity='error' onClose={() => setIssues([])}>
              <AlertTitle>Fix these before sending for signature</AlertTitle>
              <ul className='mbs-1 pis-4 list-disc'>
                {issues.map((issue, index) => (
                  <li key={`${issue.field}-${index}`}>{describeIssue(issue, contract, siteList)}</li>
                ))}
              </ul>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className='grid gap-6 grid-cols-1 lg:grid-cols-3 items-start'>
        <div className='flex flex-col gap-6'>
          <BillingCard contract={contract} client={client.data} />
          <VersionsCard contract={contract} />
          {isAdmin && <HistoryCard contractId={contract.id} />}
        </div>
        <div className='lg:col-span-2 flex flex-col gap-6'>
          <SiteServices
            contract={contract}
            sites={siteList}
            services={services.data ?? []}
            editable={editable}
            onEditLines={siteId => setLinesOpen({ siteId })}
            onEditCoverage={() => setCoverageOpen(true)}
          />
        </div>
      </div>

      {editable && (
        <>
          <LinesDialog
            open={!!linesOpen}
            contract={contract}
            sites={siteList}
            services={services.data ?? []}
            taxRates={taxRates.data ?? []}
            focusSiteId={linesOpen?.siteId}
            newSiteId={newSiteId}
            onAddSite={() => setSiteOpen(true)}
            onClose={() => setLinesOpen(null)}
          />
          <CoverageDrawer
            open={coverageOpen}
            contract={contract}
            sites={siteList}
            onClose={() => setCoverageOpen(false)}
          />
          <TermsDialog open={termsOpen} contract={contract} onClose={() => setTermsOpen(false)} />
          <SiteDialog
            open={siteOpen}
            clientId={contract.client.id}
            clientName={contract.client.legalName}
            onClose={() => setSiteOpen(false)}
            onCreated={site => setNewSiteId(site.id)}
          />
        </>
      )}

      <ConfirmDialog
        open={confirm === 'submit'}
        title='Send for signature?'
        confirmLabel='Send'
        busy={action.isPending}
        onConfirm={() => run({ action: 'submit' }, 'Sent for signature')}
        onClose={() => setConfirm(null)}
      >
        The draft is checked for completeness and locked. After this, changes need a cancelled copy or, once signed, a
        new version.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'suspend'}
        title='Suspend contract?'
        confirmLabel='Suspend'
        color='warning'
        busy={action.isPending}
        onConfirm={() => run({ action: 'suspend' }, 'Contract suspended')}
        onClose={() => setConfirm(null)}
      >
        No new schedules are generated while it is suspended. You can resume it at any time.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'resume'}
        title='Resume contract?'
        confirmLabel='Resume'
        color='success'
        busy={action.isPending}
        onConfirm={() => run({ action: 'resume' }, 'Contract resumed')}
        onClose={() => setConfirm(null)}
      >
        The contract becomes active again and scheduling picks it back up.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'new-version'}
        title={`Create version ${contract.version + 1}?`}
        confirmLabel='Create draft'
        busy={action.isPending}
        onConfirm={() => run({ action: 'new-version' }, `Draft version ${contract.version + 1} created`)}
        onClose={() => setConfirm(null)}
      >
        Copies the terms, lines and coverage into a new draft. This version keeps running until the new one is signed,
        then it expires automatically.
      </ConfirmDialog>
      <SignDialog
        open={signOpen}
        busy={action.isPending}
        supersedes={!!contract.supersedesContractId}
        onSign={body => run({ action: 'sign', body }, 'Contract is now active')}
        onClose={() => setSignOpen(false)}
      />
      <CancelDialog
        open={cancelOpen}
        busy={action.isPending}
        contractNumber={contract.contractNumber}
        onCancelContract={reason => run({ action: 'cancel', body: { reason } }, 'Contract cancelled')}
        onClose={() => setCancelOpen(false)}
      />
    </div>
  )
}

export default ContractDetailView
