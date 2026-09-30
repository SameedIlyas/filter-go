'use client'

// Next Imports
import Link from 'next/link'

// MUI Imports
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'

export type SchedulingTab = 'staff' | 'site' | 'schedules'

const TABS: Array<{ value: SchedulingTab; label: string; icon: string; href: string }> = [
  { value: 'staff', label: 'By staff', icon: 'bx-user', href: '/schedules' },
  { value: 'site', label: 'By site', icon: 'bx-buildings', href: '/schedules?view=site' },
  { value: 'schedules', label: 'Schedules', icon: 'bx-calendar', href: '/schedules/list' }
]

/**
 * The header shared by the board (/schedules) and the schedules list (/schedules/list). Tabs are links, so the
 * board's view lives in the URL like the rest of its state. `onSelect` lets the board switch views in place.
 */
const SchedulingTabs = ({ value, onSelect }: { value: SchedulingTab; onSelect?: (tab: SchedulingTab) => boolean | void }) => (
  <Tabs value={value} variant='scrollable' scrollButtons='auto' aria-label='Scheduling views'>
    {TABS.map(tab => (
      <Tab
        key={tab.value}
        value={tab.value}
        label={tab.label}
        icon={<i className={`${tab.icon} text-lg`} />}
        iconPosition='start'
        component={Link}
        href={tab.href}
        onClick={event => {
          if (onSelect?.(tab.value) === true) event.preventDefault()
        }}
      />
    ))}
  </Tabs>
)

export default SchedulingTabs
