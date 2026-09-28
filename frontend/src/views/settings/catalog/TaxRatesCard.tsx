'use client'

// React Imports
import { useMemo, useState } from 'react'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'
import Skeleton from '@mui/material/Skeleton'
import Divider from '@mui/material/Divider'
import Tooltip from '@mui/material/Tooltip'
import IconButton from '@mui/material/IconButton'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { TaxRate } from '@/types/contractTypes'

// Lib Imports
import { useDeleteTaxRate, useTaxRatesQuery } from '@/libs/api/queries/contracts'
import { errorMessage } from '@/libs/api/bff'

import TaxRateDialog, { formatRate } from './TaxRateDialog'
import { ConfirmDialog } from '@views/contracts/detail/ActionDialogs'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

/** Tax rates are ADMIN-only on the server, so this card is only rendered for admins. */
const TaxRatesCard = () => {
  const taxRates = useTaxRatesQuery(true)
  const deleteTaxRate = useDeleteTaxRate()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TaxRate | null>(null)
  const [deleting, setDeleting] = useState<TaxRate | null>(null)

  const rows = useMemo(() => [...(taxRates.data ?? [])].sort((a, b) => a.code.localeCompare(b.code)), [taxRates.data])
  const existingCodes = useMemo(() => rows.map(rate => rate.code), [rows])

  const openDialog = (taxRate: TaxRate | null) => {
    setEditing(taxRate)
    setDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!deleting) return

    try {
      await deleteTaxRate.mutateAsync(deleting.code)
      toast.success(`${deleting.code} deleted`)
      setDeleting(null)
    } catch (error) {
      // 409 CONFLICT while a live contract line still uses the code: the server message says so
      toast.error(errorMessage(error))
      setDeleting(null)
    }
  }

  return (
    <Card>
      <CardHeader
        title='Tax rates'
        subheader='The tax codes contract lines can charge.'
        action={
          <Button variant='contained' startIcon={<i className='bx-plus' />} onClick={() => openDialog(null)}>
            Add tax rate
          </Button>
        }
      />

      {taxRates.isFetching && <LinearProgress className='bs-0.5' />}
      <Divider />

      {taxRates.isError && (
        <div className='p-6 flex items-center justify-between gap-4'>
          <Typography color='error'>{errorMessage(taxRates.error)}</Typography>
          <Button variant='tonal' onClick={() => taxRates.refetch()}>
            Retry
          </Button>
        </div>
      )}

      <div className='overflow-x-auto'>
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th>Code</th>
              <th>Rate</th>
              <th className='text-end'>Actions</th>
            </tr>
          </thead>
          <tbody>
            {taxRates.isPending &&
              [0, 1, 2].map(i => (
                <tr key={i}>
                  {[0, 1, 2].map(j => (
                    <td key={j}>
                      <Skeleton />
                    </td>
                  ))}
                </tr>
              ))}
            {!taxRates.isPending && !taxRates.isError && rows.length === 0 && (
              <tr>
                <td colSpan={3} className='text-center plb-12'>
                  <div className='flex flex-col items-center gap-2'>
                    <i className='bx-receipt text-5xl text-textDisabled' />
                    <Typography variant='h6'>No tax rates yet</Typography>
                    <Typography color='text.secondary'>
                      Add the tax codes your contract lines should charge, e.g. GST at 5%.
                    </Typography>
                    <Button variant='tonal' onClick={() => openDialog(null)} className='mbs-2'>
                      Add your first tax rate
                    </Button>
                  </div>
                </td>
              </tr>
            )}
            {rows.map(rate => (
              <tr key={rate.code}>
                <td>
                  <Typography color='text.primary' className='font-medium font-mono'>
                    {rate.code}
                  </Typography>
                </td>
                <td>
                  <Typography>{formatRate(rate.ratePercent)}%</Typography>
                </td>
                <td className='text-end whitespace-nowrap'>
                  <Tooltip title='Edit'>
                    <IconButton size='small' onClick={() => openDialog(rate)}>
                      <i className='bx-edit text-textSecondary' />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title='Delete'>
                    <IconButton size='small' onClick={() => setDeleting(rate)}>
                      <i className='bx-trash text-error' />
                    </IconButton>
                  </Tooltip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <TaxRateDialog
        open={dialogOpen}
        taxRate={editing}
        existingCodes={existingCodes}
        onClose={() => setDialogOpen(false)}
      />

      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.code ?? 'tax rate'}?`}
        confirmLabel='Delete'
        color='error'
        busy={deleteTaxRate.isPending}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleting(null)}
      >
        {deleting && (
          <>
            <b>{deleting.code}</b> ({formatRate(deleting.ratePercent)}%) will no longer be available for contract lines.
            It cannot be deleted while a live contract line still uses it.
          </>
        )}
      </ConfirmDialog>
    </Card>
  )
}

export default TaxRatesCard
