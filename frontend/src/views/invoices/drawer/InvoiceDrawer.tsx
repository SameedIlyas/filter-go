'use client'

// React Imports
import { useEffect, useState } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Skeleton from '@mui/material/Skeleton'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { InvoiceDetail } from '@/types/invoiceTypes'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { safePayUrl, useInvoiceQuery, useInvoiceStep } from '@/libs/api/queries/invoices'
import type { InvoiceStep } from '@/libs/api/queries/invoices'

import AddLineDialog from '../dialogs/AddLineDialog'
import DeleteDialog from '../dialogs/DeleteDialog'
import PaymentDialog from '../dialogs/PaymentDialog'
import VoidDialog from '../dialogs/VoidDialog'
import { invoiceActions } from '../logic/actions'
import { InvoiceStatusChip, SyncChip, formatMoney, useInvoiceRole } from '../shared'
import ActivityTab from './ActivityTab'
import InvoiceDocument from './InvoiceDocument'
import TraceTab from './TraceTab'

type TabName = 'invoice' | 'trace' | 'activity'

type Dialog = 'line' | 'payment' | 'void' | 'delete' | null

type Props = { invoiceId: string | null; onClose: () => void }

const STEP_DONE: Record<InvoiceStep, string> = {
  approve: 'Approved. Syncing to accounting…',
  send: 'Sending: the client gets an email with a pay link shortly',
  'retry-sync': 'Retrying the sync'
}

const Header = ({ invoice }: { invoice: InvoiceDetail }) => (
  <div className='flex flex-col gap-1'>
    <Typography variant='h5'>{invoice.invoiceNumber}</Typography>
    <Typography color='text.secondary'>
      {invoice.client.legalName} · {formatMoney(invoice.total)}
    </Typography>
    <div className='mbs-2 flex flex-wrap gap-2'>
      <InvoiceStatusChip status={invoice.status} />
      <SyncChip sync={invoice.sync} />
    </div>
  </div>
)

/** Footer buttons for what the invoice allows now; disabled ones say why. */
const ActionBar = ({
  invoice,
  onDialog,
  onStep,
  stepping
}: {
  invoice: InvoiceDetail
  onDialog: (dialog: Dialog) => void
  onStep: (step: InvoiceStep) => void
  stepping: boolean
}) => {
  const lineCount = invoice.sites.reduce((count, group) => count + group.lines.length, 0)
  const actions = invoiceActions({ ...invoice, lineCount }, true)

  return (
    <div className='flex flex-wrap items-center justify-end gap-3 p-4 border-bs bg-backgroundPaper sticky inset-be-0'>
      {actions.remove && (
        <Button color='error' variant='text' startIcon={<i className='bx-trash' />} onClick={() => onDialog('delete')}>
          Delete draft
        </Button>
      )}
      {(actions.void || actions.voidBlocked) && (
        <Tooltip title={actions.voidBlocked ?? ''}>
          <span>
            <Button color='error' variant='tonal' disabled={!actions.void} onClick={() => onDialog('void')}>
              Void
            </Button>
          </span>
        </Tooltip>
      )}
      {actions.retrySync && (
        <Button
          color='warning'
          variant='tonal'
          startIcon={<i className='bx-refresh' />}
          disabled={stepping}
          onClick={() => onStep('retry-sync')}
        >
          Retry sync
        </Button>
      )}
      {actions.pay && (
        <Button
          color='success'
          variant='tonal'
          startIcon={<i className='bx-dollar' />}
          onClick={() => onDialog('payment')}
        >
          Record payment
        </Button>
      )}
      {actions.send && (
        <Button
          variant='contained'
          startIcon={<i className='bx-send' />}
          disabled={stepping || invoice.sync?.payment.state === 'PENDING'}
          onClick={() => onStep('send')}
        >
          {invoice.sync?.payment.state === 'PENDING' ? 'Sending…' : 'Send to client'}
        </Button>
      )}
      {(actions.approve || actions.approveBlocked) && (
        <Tooltip title={actions.approveBlocked ?? 'Locks the amounts and syncs to accounting'}>
          <span>
            <Button
              variant='contained'
              color='success'
              startIcon={<i className='bx-check' />}
              disabled={!actions.approve || stepping}
              onClick={() => onStep('approve')}
            >
              Approve
            </Button>
          </span>
        </Tooltip>
      )}
    </div>
  )
}

/** One invoice, read like the document the client gets, with the admin's lifecycle actions, the trace and the audit trail. */
const InvoiceDrawer = ({ invoiceId, onClose }: Props) => {
  const { isAdmin } = useInvoiceRole()
  const detail = useInvoiceQuery(invoiceId)
  const step = useInvoiceStep()
  const [tab, setTab] = useState<TabName>('invoice')
  const [dialog, setDialog] = useState<Dialog>(null)

  useEffect(() => {
    setTab('invoice')
    setDialog(null)
  }, [invoiceId])

  const invoice = detail.data
  const editable = isAdmin && invoice?.status === 'DRAFT'
  const payUrl = safePayUrl(invoice?.paymentUrl)

  const runStep = async (name: InvoiceStep) => {
    if (!invoice) return

    try {
      await step.mutateAsync({ id: invoice.id, step: name })
      toast.success(STEP_DONE[name])
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <Drawer
      open={invoiceId !== null}
      anchor='right'
      onClose={onClose}
      sx={{ '& .MuiDrawer-paper': { width: { xs: '100%', md: 820 } } }}
    >
      <div className='flex items-start justify-between gap-3 p-6'>
        {invoice ? (
          <Header invoice={invoice} />
        ) : (
          <div className='flex flex-1 flex-col gap-2'>
            <Skeleton width='40%' height={32} />
            <Skeleton width='30%' />
          </div>
        )}
        <IconButton size='small' onClick={onClose} aria-label='Close'>
          <i className='bx-x text-textPrimary text-2xl' />
        </IconButton>
      </div>

      {isAdmin && (
        <>
          <Tabs
            value={tab}
            onChange={(_event, next: TabName) => setTab(next)}
            className='px-6'
            variant='scrollable'
            scrollButtons='auto'
          >
            <Tab value='invoice' label='Invoice' />
            <Tab value='trace' label='Trace' />
            <Tab value='activity' label='Activity' />
          </Tabs>
          <Divider />
        </>
      )}

      <div className='flex flex-1 flex-col gap-4 p-6'>
        {detail.isError && <Alert severity='error'>{errorMessage(detail.error)}</Alert>}
        {detail.isLoading && <Skeleton variant='rounded' height={360} />}
        {invoice && tab === 'invoice' && (
          <InvoiceDocument
            invoice={invoice}
            isAdmin={isAdmin}
            editable={editable}
            onAddLine={() => setDialog('line')}
          />
        )}
        {invoice && tab === 'trace' && <TraceTab invoice={invoice} />}
        {invoice && tab === 'activity' && <ActivityTab invoiceId={invoice.id} />}
      </div>

      {invoice && isAdmin && (
        <ActionBar
          invoice={invoice}
          onDialog={setDialog}
          onStep={name => void runStep(name)}
          stepping={step.isPending}
        />
      )}
      {invoice && !isAdmin && payUrl && Number(invoice.balance) > 0 && (
        <div className='flex justify-end p-4 border-bs'>
          <Button
            variant='contained'
            href={payUrl}
            target='_blank'
            rel='noopener noreferrer'
            startIcon={<i className='bx-credit-card' />}
          >
            Pay {formatMoney(invoice.balance)}
          </Button>
        </div>
      )}

      <AddLineDialog invoice={dialog === 'line' && invoice ? invoice : null} onClose={() => setDialog(null)} />
      <PaymentDialog invoice={dialog === 'payment' && invoice ? invoice : null} onClose={() => setDialog(null)} />
      <VoidDialog invoice={dialog === 'void' && invoice ? invoice : null} onClose={() => setDialog(null)} />
      <DeleteDialog
        invoice={dialog === 'delete' && invoice ? invoice : null}
        onClose={() => setDialog(null)}
        onDeleted={onClose}
      />
    </Drawer>
  )
}

export default InvoiceDrawer
