'use client'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import MuiTimeline from '@mui/lab/Timeline'
import TimelineItem from '@mui/lab/TimelineItem'
import TimelineSeparator from '@mui/lab/TimelineSeparator'
import TimelineDot from '@mui/lab/TimelineDot'
import TimelineConnector from '@mui/lab/TimelineConnector'
import TimelineContent from '@mui/lab/TimelineContent'
import Typography from '@mui/material/Typography'
import AvatarGroup from '@mui/material/AvatarGroup'
import Tooltip from '@mui/material/Tooltip'
import { styled } from '@mui/material/styles'
import type { TimelineProps } from '@mui/lab/Timeline'

// Component Imports
import OptionMenu from '@core/components/option-menu'
import CustomAvatar from '@core/components/mui/Avatar'

// Styled Timeline component
const Timeline = styled(MuiTimeline)<TimelineProps>({
  '& .MuiTimelineItem-root': {
    '&:before': {
      display: 'none'
    }
  }
})

const Transactions = () => {
  return (
    <Card>
      <CardHeader
        title='Activity Timeline'
        action={<OptionMenu options={['Last Week', 'Last Month', 'Last 6 Months']} />}
      />
      <CardContent>
        <Timeline>
          <TimelineItem>
            <TimelineSeparator>
              <TimelineDot color='primary' />
              <TimelineConnector />
            </TimelineSeparator>
            <TimelineContent>
              <div className='flex items-center justify-between flex-wrap gap-x-4 mbe-2.5'>
                <Typography variant='h6'>12 Invoices have been paid</Typography>
                <Typography variant='caption'>12 min ago</Typography>
              </div>
              <Typography className='mbe-2'>Invoices have been paid to the company.</Typography>
              <div className='flex'>
                <div className='flex gap-2.5 items-center pli-2.5 rounded bg-actionHover plb-[0.3125rem]'>
                  <img alt='invoice.pdf' src='/images/icons/pdf.png' className='bs-5' />
                  <Typography className='font-medium'>invoice.pdf</Typography>
                </div>
              </div>
            </TimelineContent>
          </TimelineItem>
          <TimelineItem>
            <TimelineSeparator>
              <TimelineDot color='success' />
              <TimelineConnector />
            </TimelineSeparator>
            <TimelineContent>
              <div className='flex items-center justify-between flex-wrap gap-x-4 mbe-2.5'>
                <Typography variant='h6'>Client Meeting</Typography>
                <Typography variant='caption'>45 min ago</Typography>
              </div>
              <Typography className='mbe-2'>Project meeting with john @10:15am</Typography>
              <div className='flex items-center gap-2.5'>
                <CustomAvatar src='/images/avatars/1.png' alt='Lester McCarthy' size={32} />
                <div>
                  <Typography variant='body2' className='font-medium'>
                    Lester McCarthy (Client)
                  </Typography>
                  <Typography variant='body2'>CEO of ThemeSelection</Typography>
                </div>
              </div>
            </TimelineContent>
          </TimelineItem>
          <TimelineItem>
            <TimelineSeparator>
              <TimelineDot color='info' />
              <TimelineConnector />
            </TimelineSeparator>
            <TimelineContent>
              <div className='flex items-center justify-between flex-wrap gap-x-4 mbe-2.5'>
                <Typography variant='h6'>Create a new project for client</Typography>
                <Typography variant='caption'>2 Day Ago</Typography>
              </div>
              <Typography className='mbe-2'>6 team members in a project</Typography>
              <AvatarGroup className='pull-up'>
                <Tooltip title='Jeffery Warner'>
                  <CustomAvatar src='/images/avatars/1.png' alt='Jeffery Warner' size={36} />
                </Tooltip>
                <Tooltip title='Howard Lloyd'>
                  <CustomAvatar src='/images/avatars/5.png' alt='Howard Lloyd' size={36} />
                </Tooltip>
                <Tooltip title='Olivia Sparks'>
                  <CustomAvatar src='/images/avatars/4.png' alt='Olivia Sparks' size={36} />
                </Tooltip>
                <CustomAvatar size={36}>+3</CustomAvatar>
              </AvatarGroup>
            </TimelineContent>
          </TimelineItem>
        </Timeline>
      </CardContent>
    </Card>
  )
}

export default Transactions
