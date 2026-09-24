'use client'

// React Imports
import { useState, useMemo } from 'react'

// MUI Imports
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Card from '@mui/material/Card'
import IconButton from '@mui/material/IconButton'

// Third-party Imports
import classnames from 'classnames'
import { rankItem } from '@tanstack/match-sorter-utils'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getFilteredRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFacetedMinMaxValues,
  getPaginationRowModel,
  getSortedRowModel
} from '@tanstack/react-table'
import type { ColumnDef, FilterFn } from '@tanstack/react-table'
import type { RankingInfo } from '@tanstack/match-sorter-utils'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

type ProjectListDataType = {
  id: number
  avatarSrc: string
  methodImg: string
  amount: string
  email: string
  name: string
  status: string
  action?: string
}

declare module '@tanstack/table-core' {
  interface FilterFns {
    fuzzy: FilterFn<unknown>
  }
  interface FilterMeta {
    itemRank: RankingInfo
  }
}

// Vars
const projectTable: ProjectListDataType[] = [
  {
    id: 1,
    avatarSrc: '/images/avatars/1.png',
    status: 'paid',
    amount: '$459.65',
    email: 'ceasomw@theguardian.com',
    name: 'Cristine Easom',
    methodImg: '/images/apps/ecommerce/mastercard.png'
  },
  {
    id: 2,
    avatarSrc: '/images/avatars/6.png',
    status: 'pending',
    amount: '$93.81',
    email: 'fscreechs@army.mil',
    name: 'Fayre Screech',
    methodImg: '/images/apps/ecommerce/mastercard.png'
  },
  {
    id: 3,
    avatarSrc: '/images/avatars/5.png',
    status: 'pending',
    amount: '$934.34',
    email: 'ppfaffe1i@wikia.com',
    name: 'Pauline Pfaffe',
    methodImg: '/images/apps/ecommerce/paypal.png'
  },
  {
    id: 4,
    avatarSrc: '/images/avatars/4.png',
    status: 'paid',
    amount: '$794.97',
    email: 'mnealeyf@kapanpost.jp',
    name: 'Maurits Nealey',
    methodImg: '/images/apps/ecommerce/mastercard.png'
  },
  {
    id: 5,
    avatarSrc: '/images/avatars/3.png',
    status: 'paid',
    amount: '$19.49',
    email: 'ugoodlife2p@blogger.com',
    name: 'Ulysses Goodlife',
    methodImg: '/images/apps/ecommerce/mastercard.png'
  },
  {
    id: 6,
    avatarSrc: '/images/avatars/2.png',
    status: 'failed',
    amount: '$636.27',
    email: 'eduke1z@dell.com',
    name: 'Etienne Duke',
    methodImg: '/images/apps/ecommerce/mastercard.png'
  }
]

const fuzzyFilter: FilterFn<any> = (row, columnId, value, addMeta) => {
  // Rank the item
  const itemRank = rankItem(row.getValue(columnId), value)

  // Store the itemRank info
  addMeta({
    itemRank
  })

  // Return if the item should be filtered in/out
  return itemRank.passed
}

// Column Definitions
const columnHelper = createColumnHelper<ProjectListDataType>()

const CustomersTable = () => {
  // States
  const [rowSelection, setRowSelection] = useState({})
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [data, setData] = useState(...[projectTable])
  const [globalFilter, setGlobalFilter] = useState('')

  // Hooks
  const columns = useMemo<ColumnDef<ProjectListDataType, any>[]>(
    () => [
      columnHelper.accessor('name', {
        header: 'Customers',
        cell: ({ row }) => (
          <div className='flex items-center gap-3'>
            <CustomAvatar src={row.original.avatarSrc} size={34} />
            <div className='flex flex-col'>
              <Typography variant='h6'>{row.original.name}</Typography>
              <Typography variant='body2'>{row.original.email}</Typography>
            </div>
          </div>
        )
      }),
      columnHelper.accessor('amount', {
        header: 'Amount',
        cell: ({ row }) => <Typography>{row.original.amount}</Typography>
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: ({ row }) => (
          <>
            <Chip
              className='capitalize'
              size='small'
              label={row.original.status}
              color={
                row.original.status === 'paid' ? 'success' : row.original.status === 'pending' ? 'warning' : 'error'
              }
              variant='tonal'
            />
          </>
        )
      }),
      columnHelper.accessor('methodImg', {
        header: 'Method',
        cell: ({ row }) => (
          <div className='flex items-center justify-center plb-2 pli-3 rounded bg-actionHover is-[32px] bs-5'>
            <img src={row.original.methodImg} className='bs-3' />
          </div>
        )
      }),
      columnHelper.accessor('action', {
        header: 'Action',
        cell: () => (
          <div className='flex items-center'>
            <IconButton>
              <i className='bx-dots-vertical-rounded text-textSecondary' />
            </IconButton>
          </div>
        )
      })
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const table = useReactTable({
    data,
    columns,
    filterFns: {
      fuzzy: fuzzyFilter
    },
    state: {
      rowSelection,
      globalFilter
    },
    initialState: {
      pagination: {
        pageSize: 7
      }
    },
    enableRowSelection: true, //enable row selection for all rows
    // enableRowSelection: row => row.original.age > 18, // or enable row selection conditionally per row
    globalFilterFn: fuzzyFilter,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues()
  })

  return (
    <Card>
      <div className='overflow-x-auto'>
        <table className={tableStyles.table}>
          <thead className='border-bs-0'>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th key={header.id}>
                    {header.isPlaceholder ? null : (
                      <>
                        <div
                          className={classnames({
                            'flex items-center': header.column.getIsSorted(),
                            'cursor-pointer select-none': header.column.getCanSort()
                          })}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {{
                            asc: <i className='bx-chevron-up text-xl' />,
                            desc: <i className='bx-chevron-down text-xl' />
                          }[header.column.getIsSorted() as 'asc' | 'desc'] ?? null}
                        </div>
                      </>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table
              .getRowModel()
              .rows.slice(0, table.getState().pagination.pageSize)
              .map(row => {
                return (
                  <tr key={row.id} className={classnames({ selected: row.getIsSelected() })}>
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className='plb-2.5'>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export default CustomersTable
