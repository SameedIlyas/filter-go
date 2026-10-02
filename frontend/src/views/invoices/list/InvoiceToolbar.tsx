'use client'

// React Imports
import { useEffect, useState } from 'react'

// MUI Imports
import Button from '@mui/material/Button'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { useClientsQuery } from '@/libs/api/queries/contracts'

import { INVOICE_STATUSES, STATUS_LABEL } from '../logic/labels'
import type { InvoiceParams } from './useInvoiceParams'

type Props = {
  filters: InvoiceParams['filters']
  filtered: boolean
  isAdmin: boolean
  exporting: boolean
  update: (patch: Record<string, string | null>) => void
  clear: () => void
  onExport: () => void
  onReconcile: () => void
  onRun: () => void
}

/** Debounced so the list is not refetched on every keystroke. */
const SearchBox = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
  const [text, setText] = useState(value)

  useEffect(() => setText(value), [value])

  useEffect(() => {
    if (text.trim() === value) return

    const timer = setTimeout(() => onChange(text.trim()), 350)

    return () => clearTimeout(timer)
  }, [text, value, onChange])

  return (
    <CustomTextField
      className='min-is-[220px]'
      placeholder='Search by invoice number'
      value={text}
      onChange={e => setText(e.target.value.slice(0, 50))}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position='start'>
              <i className='bx-search text-lg' />
            </InputAdornment>
          )
        }
      }}
    />
  )
}

/** Admin only: the server refuses the client list to anyone else. */
const ClientFilter = ({ value, onChange }: { value: string; onChange: (clientId: string) => void }) => {
  const clients = useClientsQuery()

  return (
    <CustomTextField
      select
      className='min-is-[200px]'
      value={value}
      onChange={e => onChange(e.target.value)}
      slotProps={{ select: { displayEmpty: true } }}
    >
      <MenuItem value=''>All clients</MenuItem>
      {(clients.data ?? []).map(client => (
        <MenuItem key={client.id} value={client.id}>
          {client.legalName}
        </MenuItem>
      ))}
    </CustomTextField>
  )
}

/** Search, client, status and issue-date filters on the left; export, reconciliation and a new run on the right. */
const InvoiceToolbar = ({
  filters,
  filtered,
  isAdmin,
  exporting,
  update,
  clear,
  onExport,
  onReconcile,
  onRun
}: Props) => {
  return (
    <div className='flex flex-col gap-4 p-6'>
      <div className='flex flex-wrap items-center gap-4'>
        <SearchBox value={filters.q ?? ''} onChange={q => update({ q })} />
        {isAdmin && <ClientFilter value={filters.clientId ?? ''} onChange={clientId => update({ clientId })} />}
        <CustomTextField
          select
          className='min-is-[170px]'
          value={filters.status ?? ''}
          onChange={e => update({ status: e.target.value })}
          slotProps={{ select: { displayEmpty: true } }}
        >
          <MenuItem value=''>All statuses</MenuItem>
          {INVOICE_STATUSES.filter(status => isAdmin || (status !== 'DRAFT' && status !== 'VOID')).map(status => (
            <MenuItem key={status} value={status}>
              {STATUS_LABEL[status]}
            </MenuItem>
          ))}
        </CustomTextField>
        <div className='flex items-center gap-2'>
          <CustomTextField
            type='date'
            value={filters.from ?? ''}
            onChange={e => update({ from: e.target.value })}
            aria-label='Issued from'
            slotProps={{ htmlInput: { max: filters.to } }}
          />
          <Typography color='text.secondary'>–</Typography>
          <CustomTextField
            type='date'
            value={filters.to ?? ''}
            onChange={e => update({ to: e.target.value })}
            aria-label='Issued to'
            slotProps={{ htmlInput: { min: filters.from } }}
          />
        </div>
        {filtered && (
          <Button variant='text' color='secondary' onClick={clear}>
            Reset
          </Button>
        )}
        <div className='flex flex-wrap gap-3 mis-auto'>
          <Button
            variant='tonal'
            color='secondary'
            startIcon={<i className='bx-download' />}
            onClick={onExport}
            disabled={exporting}
          >
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
          {isAdmin && (
            <>
              <Button
                variant='tonal'
                color='secondary'
                startIcon={<i className='bx-spreadsheet' />}
                onClick={onReconcile}
              >
                Reconciliation
              </Button>
              <Button variant='contained' startIcon={<i className='bx-plus' />} onClick={onRun}>
                Create invoice
              </Button>
            </>
          )}
        </div>
      </div>
      <Typography variant='body2' color='text.disabled'>
        Dates filter on the issue date.
      </Typography>
    </div>
  )
}

export default InvoiceToolbar
