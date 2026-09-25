'use client'

// React Imports
import { useState } from 'react'

// Next Imports
import Link from 'next/link'

// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'

// Type Imports
import type { Lead, LeadStatus } from '@/types/leadTypes'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'

import { LEAD_STATUSES } from '@/libs/api/queries/leads'
import { getInitials } from '@/utils/getInitials'

import { NEXT_STATUSES, SOURCE_META, STATUS_META, timeAgo } from '../shared'

type Props = {
  leads: Lead[] | undefined
  loading: boolean
  onMove: (lead: Lead, target: LeadStatus) => void
  onConvert: (lead: Lead) => void
}

/** Kanban view of the pipeline. Drag a card onto a column to move it; dropping on "Won" opens conversion. */
const LeadBoard = ({ leads, loading, onMove, onConvert }: Props) => {
  const [dragging, setDragging] = useState<Lead | null>(null)
  const [over, setOver] = useState<LeadStatus | null>(null)

  const canDrop = (target: LeadStatus) =>
    !!dragging &&
    dragging.status !== target &&
    (NEXT_STATUSES[dragging.status].includes(target) || (target === 'WON' && ['QUALIFIED', 'PROPOSAL'].includes(dragging.status)))

  const handleDrop = (target: LeadStatus) => {
    if (dragging && canDrop(target)) {
      if (target === 'WON') onConvert(dragging)
      else onMove(dragging, target)
    }

    setDragging(null)
    setOver(null)
  }

  return (
    <div className='flex gap-4 overflow-x-auto pbe-2'>
      {LEAD_STATUSES.map(status => {
        const column = (leads ?? []).filter(lead => lead.status === status)
        const droppable = canDrop(status)

        return (
          <div
            key={status}
            className='flex flex-col gap-3 min-is-[260px] is-[260px] shrink-0 rounded p-3'
            style={{
              background: 'var(--mui-palette-action-hover)',
              outline: over === status && droppable ? '2px dashed var(--mui-palette-primary-main)' : undefined,
              opacity: dragging && !droppable && dragging.status !== status ? 0.5 : 1
            }}
            onDragOver={e => {
              if (droppable) {
                e.preventDefault()
                setOver(status)
              }
            }}
            onDragLeave={() => setOver(null)}
            onDrop={() => handleDrop(status)}
          >
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-2'>
                <i className={`${STATUS_META[status].icon} text-lg`} style={{ color: `var(--mui-palette-${STATUS_META[status].color}-main)` }} />
                <Typography variant='h6'>{STATUS_META[status].label}</Typography>
              </div>
              <Chip size='small' variant='tonal' color={STATUS_META[status].color} label={column.length} />
            </div>
            {loading && [0, 1].map(i => <Skeleton key={i} variant='rounded' height={96} />)}
            {!loading && column.length === 0 && (
              <Typography variant='body2' color='text.disabled' className='text-center plb-6'>
                No leads
              </Typography>
            )}
            {column.map(lead => (
              <Card
                key={lead.id}
                draggable={lead.status !== 'WON'}
                onDragStart={() => setDragging(lead)}
                onDragEnd={() => {
                  setDragging(null)
                  setOver(null)
                }}
                className={lead.status !== 'WON' ? 'cursor-grab' : undefined}
              >
                <CardContent className='flex flex-col gap-2 !p-4'>
                  <Typography component={Link} href={`/leads/${lead.id}`} className='font-medium hover:underline' color='text.primary'>
                    {lead.companyName}
                  </Typography>
                  <Typography variant='body2' color='text.secondary'>
                    {lead.contactName}
                    {lead.serviceInterest ? ` · ${lead.serviceInterest}` : ''}
                  </Typography>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-1 text-textDisabled'>
                      <i className={`${SOURCE_META[lead.source].icon} text-sm`} />
                      <Typography variant='caption' color='text.disabled'>
                        {timeAgo(lead.createdAt)}
                      </Typography>
                    </div>
                    {lead.owner && (
                      <CustomAvatar size={24} skin='light' color='primary' className='text-xs' title={lead.owner.name}>
                        {getInitials(lead.owner.name)}
                      </CustomAvatar>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      })}
    </div>
  )
}

export default LeadBoard
