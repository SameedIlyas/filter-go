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

// Type Imports
import type { ThemeColor } from '@core/types'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

type ProjectListDataType = {
  id: number
  amountPaid: number
  brand: string
  amountToPay: number
  category: string
  product: string
  src: string
  status: string
  action?: string
}

type ProductCategoryType = {
  [key: string]: {
    icon: string
    color: ThemeColor
  }
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
    amountPaid: 120,
    brand: 'OnePlus',
    amountToPay: 499,
    status: 'Confirmed',
    category: 'Smart Phone',
    product: 'OnePlus 7Pro',
    src: '/images/apps/ecommerce/product-21.png'
  },
  {
    id: 2,
    amountPaid: 149,
    brand: 'Apple',
    amountToPay: 149,
    category: 'Mouse',
    status: 'Completed',
    product: 'Magic Mouse',
    src: '/images/apps/ecommerce/product-22.png'
  },
  {
    id: 3,
    amountPaid: 0,
    brand: 'Apple',
    amountToPay: 899,
    status: 'Cancelled',
    product: 'iMac Pro',
    category: 'Computer',
    src: '/images/apps/ecommerce/product-27.png'
  },
  {
    id: 4,
    amountPaid: 169,
    brand: 'Samsung',
    amountToPay: 169,
    product: 'Note 10',
    status: 'Completed',
    category: 'Smart Phone',
    src: '/images/apps/ecommerce/product-28.png'
  },
  {
    id: 5,
    amountPaid: 399,
    brand: 'Apple',
    amountToPay: 399,
    status: 'Completed',
    category: 'Smart Phone',
    product: 'iPhone 11 Pro',
    src: '/images/apps/ecommerce/product-29.png'
  },
  {
    id: 6,
    amountPaid: 349,
    brand: 'Xiaomi',
    amountToPay: 2599,
    status: 'Confirmed',
    category: 'Smart Tv',
    product: 'Mi LED TV 4X',
    src: '/images/apps/ecommerce/product-30.png'
  },
  {
    id: 7,
    amountPaid: 89,
    amountToPay: 89,
    brand: 'Logitech',
    category: 'Mouse',
    status: 'Completed',
    product: 'Logitech MX',
    src: '/images/apps/ecommerce/product-31.png'
  }
]

const productCategoryObj: ProductCategoryType = {
  'Smart Phone': { icon: 'bx-mobile', color: 'primary' },
  Mouse: { icon: 'bx-mouse', color: 'warning' },
  Computer: { icon: 'bx-desktop', color: 'info' },
  'Smart Tv': { icon: 'bx-tv', color: 'error' }
}

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
      columnHelper.accessor('product', {
        header: 'Product',
        cell: ({ row }) => (
          <div className='flex items-center gap-3'>
            <img src={row.original.src} alt='product' className='bs-[32px]' />
            <div>
              <Typography variant='h6'>{row.original.product}</Typography>
              <Typography variant='body2'>{row.original.brand}</Typography>
            </div>
          </div>
        )
      }),
      columnHelper.accessor('category', {
        header: 'Category',
        cell: ({ row }) => (
          <div className='flex items-center gap-3'>
            <CustomAvatar skin='light' color={productCategoryObj[row.original.category].color} size={28}>
              <i className={classnames(productCategoryObj[row.original.category].icon, 'text-base')} />
            </CustomAvatar>
            <Typography>{row.original.category}</Typography>
          </div>
        )
      }),
      columnHelper.accessor('amountPaid', {
        header: 'Payment',
        cell: ({ row }) => (
          <>
            <Typography>
              <span className='font-medium text-primary'>${row.original.amountPaid}</span>
              {row.original.amountPaid === row.original.amountToPay ? null : `/${row.original.amountToPay}`}
            </Typography>

            <Typography variant='body2' color='textSecondary'>
              {row.original.amountPaid === row.original.amountToPay
                ? 'Fully Paid'
                : row.original.amountPaid < row.original.amountToPay && row.original.amountPaid !== 0
                  ? 'Partially Paid'
                  : 'Unpaid'}
            </Typography>
          </>
        )
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: ({ row }) => (
          <Chip
            variant='tonal'
            label={row.original.status}
            size='small'
            color={
              row.original.status === 'Completed'
                ? 'success'
                : row.original.status === 'Confirmed'
                  ? 'primary'
                  : 'error'
            }
          />
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
                      <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
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
