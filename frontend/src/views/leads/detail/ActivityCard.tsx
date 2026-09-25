'use client'

// React Imports
import { useState } from 'react'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import TimelineDot from '@mui/lab/TimelineDot'
import TimelineItem from '@mui/lab/TimelineItem'
import TimelineContent from '@mui/lab/TimelineContent'
import TimelineSeparator from '@mui/lab/TimelineSeparator'
import TimelineConnector from '@mui/lab/TimelineConnector'
import MuiTimeline from '@mui/lab/Timeline'
import { styled } from '@mui/material/styles'
import type { TimelineProps } from '@mui/lab/Timeline'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { LeadActivityType } from '@/types/leadTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useAddLeadActivity, useLeadActivities, useLeadOwners } from '@/libs/api/queries/leads'

import { ACTIVITY_META, formatDateTime, timeAgo } from '../shared'

const Timeline = styled(MuiTimeline)<TimelineProps>({
  paddingLeft: 0,
  paddingRight: 0,
  '& .MuiTimelineItem-root': {
    width: '100%',
    '&:before': { display: 'none' },
    '& .MuiTimelineContent-root:last-child': { paddingBottom: 0 }
  }
})

const TYPES = Object.keys(ACTIVITY_META) as LeadActivityType[]
const PAGE = 20

const ActivityCard = ({ leadId, disabled }: { leadId: string; disabled?: boolean }) => {
  const [type, setType] = useState<LeadActivityType>('CALL')
  const [body, setBody] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const activities = useLeadActivities(leadId, limit)
  const owners = useLeadOwners()
  const addActivity = useAddLeadActivity(leadId)

  const authorName = (userId: string | null) =>
    userId ? (owners.data?.find(owner => owner.id === userId)?.name ?? 'Team member') : 'System'

  const submit = async () => {
    if (!body.trim()) return

    try {
      await addActivity.mutateAsync({ type, body: body.trim() })
      setBody('')
      toast.success(`${ACTIVITY_META[type].label} logged`)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const items = activities.data?.activities ?? []
  const total = activities.data?.total ?? 0

  return (
    <Card>
      <CardHeader title='Activity' subheader='Calls, emails, visits and notes. Logging a call or email on a new lead marks it contacted.' />
      <CardContent className='flex flex-col gap-4'>
        {!disabled && (
          <div className='flex flex-col gap-3 p-4 rounded border'>
            <ToggleButtonGroup exclusive size='small' value={type} onChange={(_, next) => next && setType(next)}>
              {TYPES.map(t => (
                <ToggleButton key={t} value={t} className='gap-1'>
                  <i className={`${ACTIVITY_META[t].icon} text-lg`} />
                  {ACTIVITY_META[t].label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <CustomTextField
              fullWidth
              multiline
              minRows={2}
              placeholder={
                type === 'CALL'
                  ? 'Who did you speak to, what was agreed?'
                  : type === 'EMAIL'
                    ? 'Summary of the email'
                    : type === 'SITE_VISIT'
                      ? 'What did you see on site?'
                      : 'Add a note'
              }
              value={body}
              onChange={e => setBody(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit()
              }}
            />
            <div className='flex justify-between items-center'>
              <Typography variant='caption' color='text.disabled'>
                Ctrl + Enter to save
              </Typography>
              <Button variant='contained' size='small' onClick={submit} disabled={!body.trim() || addActivity.isPending}>
                {addActivity.isPending ? 'Saving…' : `Log ${ACTIVITY_META[type].label.toLowerCase()}`}
              </Button>
            </div>
          </div>
        )}

        {activities.isPending && <Typography color='text.disabled'>Loading activity…</Typography>}
        {!activities.isPending && items.length === 0 && (
          <Typography color='text.disabled' className='text-center plb-4'>
            No activity yet. Speed to first contact drives close rate: log your first call.
          </Typography>
        )}

        {items.length > 0 && (
          <Timeline>
            {items.map((activity, index) => (
              <TimelineItem key={activity.id}>
                <TimelineSeparator>
                  <TimelineDot color={ACTIVITY_META[activity.type].color} variant='outlined' className='p-1.5'>
                    <i className={`${ACTIVITY_META[activity.type].icon} text-base`} />
                  </TimelineDot>
                  {index < items.length - 1 && <TimelineConnector />}
                </TimelineSeparator>
                <TimelineContent>
                  <div className='flex flex-wrap items-center justify-between gap-x-2 mbe-1'>
                    <Typography variant='h6'>
                      {ACTIVITY_META[activity.type].label}
                      <Typography component='span' color='text.disabled' className='mis-2'>
                        by {authorName(activity.userId)}
                      </Typography>
                    </Typography>
                    <Typography variant='caption' title={formatDateTime(activity.at)}>
                      {timeAgo(activity.at)}
                    </Typography>
                  </div>
                  <Typography className='whitespace-pre-wrap'>{activity.body}</Typography>
                </TimelineContent>
              </TimelineItem>
            ))}
          </Timeline>
        )}
        {items.length < total && (
          <Button variant='text' onClick={() => setLimit(l => Math.min(l + PAGE, 100))} disabled={activities.isFetching || limit >= 100}>
            {activities.isFetching ? 'Loading…' : `Show more (${total - items.length} older)`}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export default ActivityCard
