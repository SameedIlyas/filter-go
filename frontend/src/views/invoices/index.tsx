'use client'

// React Imports
import { useState } from 'react'

// MUI Imports
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Divider from '@mui/material/Divider'
import LinearProgress from '@mui/material/LinearProgress'
import MenuItem from '@mui/material/MenuItem'
import Pagination from '@mui/material/Pagination'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { InvoiceSummary } from '@/types/invoiceTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useInvoiceStep, useInvoicesQuery } from '@/libs/api/queries/invoices'

// Util Imports
import { downloadCsv } from '@/utils/csv'

import DeleteDialog from './dialogs/DeleteDialog'
import ReconciliationDialog from './dialogs/ReconciliationDialog'
import RunDialog from './dialogs/RunDialog'
import InvoiceDrawer from './drawer/InvoiceDrawer'
import InvoiceRow, { COLUMNS, HEADERS, STICKY_END } from './list/InvoiceRow'
import InvoiceToolbar from './list/InvoiceToolbar'
import { useInvoiceParams } from './list/useInvoiceParams'
import { invoicesCsv } from './logic/csv'
import { EXPORT_CAP, fetchAllInvoices } from './logic/fetchAll'
import { useInvoiceRole } from './shared'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

const NoAccess = () => (
  <Card>
    <CardContent className='flex flex-col items-center gap-3 plb-12'>
      <i className='bx-receipt text-5xl text-textSecondary' />
      <Typography variant='h5'>Invoices are for admins and clients</Typography>
      <Typography color='text.secondary'>Ask an admin if you need to see billing.</Typography>
    </CardContent>
  </Card>
)

const EmptyRow = ({ filtered, isAdmin }: { filtered: boolean; isAdmin: boolean }) => (
  <tr>
    <td colSpan={COLUMNS} className='text-center plb-12'>
      <div className='flex flex-col items-center gap-2'>
        <i className='bx-receipt text-5xl text-textDisabled' />
        <Typography variant='h6'>{filtered ? 'No invoices match these filters' : 'No invoices yet'}</Typography>
        <Typography color='text.secondary'>
          {filtered
            ? 'Try other filters, or reset them.'
            : isAdmin
              ? 'Create one from a contract and its approved timesheets.'
              : 'Invoices show up here once they are issued.'}
        </Typography>
      </div>
    </td>
  </tr>
)

const SkeletonRows = () =>
  [0, 1, 2, 3, 4].map(i => (
    <tr key={i}>
      {Array.from({ length: COLUMNS }).map((_, j) => (
        <td key={j}>
          <Skeleton />
        </td>
      ))}
    </tr>
  ))

/** The list as CSV with the current filters, every page (up to the export cap). */
const useExport = (filters: ReturnType<typeof useInvoiceParams>['filters']) => {
  const [exporting, setExporting] = useState(false)

  const run = async () => {
    setExporting(true)

    try {
      const { items, total, truncated } = await fetchAllInvoices(filters)

      if (items.length === 0) {
        toast.info('Nothing to export with these filters')

        return
      }

      downloadCsv(`invoices_${new Date().toISOString().slice(0, 10)}.csv`, invoicesCsv(items))
      if (truncated)
        toast.warning(`Exported the first ${EXPORT_CAP} of ${total} invoices. Narrow the filters for the rest.`)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setExporting(false)
    }
  }

  return { exporting, run }
}

const InvoicesView = () => {
  const { isAdmin } = useInvoiceRole()
  const params = useInvoiceParams()
  const { filters } = params
  const query = useInvoicesQuery(filters)
  const step = useInvoiceStep()
  const exporter = useExport(filters)
  const [running, setRunning] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const [deleting, setDeleting] = useState<InvoiceSummary | null>(null)

  const rows = query.data?.items ?? []
  const meta = query.data?.meta

  const retrySync = async (invoice: InvoiceSummary) => {
    try {
      await step.mutateAsync({ id: invoice.id, step: 'retry-sync' })
      toast.success(`Retrying the sync of ${invoice.invoiceNumber}`)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Typography variant='h4'>Invoices</Typography>
        <Typography color='text.secondary'>
          {isAdmin
            ? 'Bill approved work, sync it to accounting, send pay links and track payments'
            : 'Your invoices and what is still owed'}
        </Typography>
      </div>
      <Card>
        <InvoiceToolbar
          filters={filters}
          filtered={params.filtered}
          isAdmin={isAdmin}
          exporting={exporter.exporting}
          update={params.update}
          clear={params.clear}
          onExport={() => void exporter.run()}
          onReconcile={() => setReconciling(true)}
          onRun={() => setRunning(true)}
        />
        {/* Always present: React Query reports "fetching" while hydrating but not on the server, and a child that only
            exists on the client would shift every generated id in this card (hydration mismatch) */}
        <div className='bs-0.5'>{query.isFetching && <LinearProgress className='bs-0.5' />}</div>
        <Divider />
        {query.isError && (
          <div className='p-6 flex items-center justify-between gap-4'>
            <Typography color='error'>{errorMessage(query.error)}</Typography>
            <Button variant='tonal' onClick={() => query.refetch()}>
              Retry
            </Button>
          </div>
        )}
        <div className='overflow-x-auto'>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                {HEADERS.map(header => (
                  <th
                    key={header}
                    className={['Subtotal', 'Tax', 'Total', 'Balance'].includes(header) ? 'text-end' : undefined}
                  >
                    {header}
                  </th>
                ))}
                <th className={STICKY_END} aria-label='Actions' />
              </tr>
            </thead>
            <tbody>
              {query.isPending && <SkeletonRows />}
              {!query.isPending && !query.isError && rows.length === 0 && (
                <EmptyRow filtered={params.filtered} isAdmin={isAdmin} />
              )}
              {rows.map(invoice => (
                <InvoiceRow
                  key={invoice.id}
                  invoice={invoice}
                  isAdmin={isAdmin}
                  busy={step.isPending && step.variables?.id === invoice.id}
                  onOpen={() => params.open(invoice.id)}
                  onRetrySync={() => void retrySync(invoice)}
                  onDelete={() => setDeleting(invoice)}
                />
              ))}
            </tbody>
          </table>
        </div>
        <div className='flex justify-between items-center flex-wrap pli-6 border-bs plb-3 gap-2'>
          <div className='flex items-center gap-3'>
            <Typography color='text.disabled'>
              {meta && meta.total > 0
                ? `Showing ${(meta.page - 1) * meta.limit + 1} to ${Math.min(meta.page * meta.limit, meta.total)} of ${meta.total} invoices`
                : 'No invoices'}
            </Typography>
            <CustomTextField
              select
              size='small'
              value={filters.limit}
              onChange={e => params.setLimit(Number(e.target.value))}
            >
              {params.pageSizes.map(size => (
                <MenuItem key={size} value={size}>
                  {size} / page
                </MenuItem>
              ))}
            </CustomTextField>
          </div>
          <Pagination
            shape='rounded'
            color='primary'
            variant='tonal'
            count={meta?.totalPages ?? 1}
            page={filters.page}
            onChange={(_event, page) => params.setPage(page)}
            showFirstButton
            showLastButton
          />
        </div>
      </Card>

      <InvoiceDrawer invoiceId={params.openId} onClose={() => params.open(null)} />
      {isAdmin && (
        <>
          <RunDialog open={running} onClose={() => setRunning(false)} onOpenInvoice={id => params.open(id)} />
          <ReconciliationDialog open={reconciling} onClose={() => setReconciling(false)} />
          <DeleteDialog invoice={deleting} onClose={() => setDeleting(null)} />
        </>
      )}
    </div>
  )
}

/** /invoices: the admin's billing desk, and a client user's read-only view of their own invoices. */
const Invoices = () => {
  const { canRead } = useInvoiceRole()

  return canRead ? <InvoicesView /> : <NoAccess />
}

export default Invoices
