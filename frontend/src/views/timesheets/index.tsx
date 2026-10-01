'use client'

// React Imports
import { useCallback } from 'react'

// Next Imports
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'

import TimesheetDrawer from './drawer/TimesheetDrawer'
import ExceptionsTab from './exceptions/ExceptionsTab'
import HoursTab from './hours/HoursTab'
import ReviewTab from './review/ReviewTab'
import { useTimesheetRole } from './shared'

export type TimesheetsTab = 'review' | 'exceptions' | 'hours'

const TABS: Array<{ value: TimesheetsTab; label: string; icon: string }> = [
  { value: 'review', label: 'Review', icon: 'bx-list-check' },
  { value: 'exceptions', label: 'Exceptions', icon: 'bx-error' },
  { value: 'hours', label: 'Hours', icon: 'bx-grid-alt' }
]

const isTab = (value: string | null): value is TimesheetsTab => TABS.some(tab => tab.value === value)

const StaffOnly = () => (
  <Card>
    <CardContent className='flex flex-col items-center gap-3 plb-12'>
      <i className='bx-time-five text-5xl text-textSecondary' />
      <Typography variant='h5'>Timesheet review is for supervisors and admins</Typography>
      <Typography color='text.secondary'>Your own hours are under My timesheets.</Typography>
    </CardContent>
  </Card>
)

/**
 * /timesheets: the supervisor's review. The tab, the review filters (`status`, `siteId`, `userId`, `from`, `to`,
 * `exceptions`) and the open entry (`open`) all live in the URL, so a filtered view can be shared or bookmarked and
 * the hours grid can drill into the review list.
 */
const TimesheetsView = () => {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const tabParam = params.get('tab')
  const tab: TimesheetsTab = isTab(tabParam) ? tabParam : 'review'
  const openId = params.get('open')

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString())

      Object.entries(patch).forEach(([key, value]) => (value === null || value === '' ? next.delete(key) : next.set(key, value)))

      const search = next.toString()

      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false })
    },
    [params, pathname, router]
  )

  const open = useCallback((id: string) => setParams({ open: id }), [setParams])

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Typography variant='h4'>Timesheets</Typography>
        <Typography color='text.secondary'>Review worked hours, clear exceptions and approve time for payroll and invoicing</Typography>
      </div>
      <Tabs value={tab} onChange={(_event, next: TimesheetsTab) => setParams({ tab: next === 'review' ? null : next })} variant='scrollable' scrollButtons='auto'>
        {TABS.map(item => (
          <Tab key={item.value} value={item.value} label={item.label} icon={<i className={`${item.icon} text-lg`} />} iconPosition='start' />
        ))}
      </Tabs>
      {tab === 'review' && <ReviewTab onOpen={open} />}
      {tab === 'exceptions' && <ExceptionsTab onOpen={open} />}
      {tab === 'hours' && <HoursTab />}
      <TimesheetDrawer timesheetId={openId} onClose={() => setParams({ open: null })} />
    </div>
  )
}

const Timesheets = () => {
  const { isStaff } = useTimesheetRole()

  return isStaff ? <TimesheetsView /> : <StaffOnly />
}

export default Timesheets
