'use client'

// React Imports
import { useState } from 'react'
import type { SyntheticEvent } from 'react'

// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import TabContext from '@mui/lab/TabContext'
import Tab from '@mui/material/Tab'
import Divider from '@mui/material/Divider'
import TabPanel from '@mui/lab/TabPanel'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'

// Type Imports
import type { ThemeColor } from '@core/types'

// Components Imports
import CustomTabList from '@core/components/mui/TabList'
import CustomAvatar from '@core/components/mui/Avatar'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

type TabType = 'browser' | 'operating-system' | 'country'

type DataType = {
  imgSrc: string
  title: string
  visits: string | number
  percentage: number
  color: ThemeColor
}

// Vars
const data: Record<TabType, DataType[]> = {
  browser: [
    {
      imgSrc: '/images/logos/chrome.png',
      title: 'Chrome',
      visits: '8.92k',
      percentage: 64.91,
      color: 'success'
    },
    {
      imgSrc: '/images/logos/safari.png',
      title: 'Safari',
      visits: '1.29k',
      percentage: 19.03,
      color: 'primary'
    },
    {
      imgSrc: '/images/logos/firefox.png',
      title: 'Firefox',
      visits: 328,
      percentage: 32.6,
      color: 'info'
    },
    {
      imgSrc: '/images/logos/edge.png',
      title: 'Edge',
      visits: 142,
      percentage: 39.9,
      color: 'warning'
    },
    {
      imgSrc: '/images/logos/opera.png',
      title: 'Opera',
      visits: 85,
      percentage: 21.2,
      color: 'error'
    },
    {
      imgSrc: '/images/logos/uc-browser.png',
      title: 'UC Browser',
      visits: 328,
      percentage: 8.3,
      color: 'secondary'
    }
  ],
  'operating-system': [
    {
      imgSrc: '/images/logos/windows.png',
      title: 'Windows',
      visits: '475.26k',
      percentage: 61.5,
      color: 'success'
    },
    {
      imgSrc: '/images/logos/mac.png',
      title: 'Mac',
      visits: '89.12k',
      percentage: 15.67,
      color: 'primary'
    },
    {
      imgSrc: '/images/logos/ubuntu.png',
      title: 'Ubuntu',
      visits: '38.68k',
      percentage: 58.2,
      color: 'info'
    },
    {
      imgSrc: '/images/logos/chrome.png',
      title: 'Chrome',
      visits: '8.34k',
      percentage: 32.5,
      color: 'warning'
    },
    {
      imgSrc: '/images/logos/cent.png',
      title: 'Cent',
      visits: '2.25k',
      percentage: 17.6,
      color: 'error'
    },
    {
      imgSrc: '/images/logos/fedora.png',
      title: 'Fedora',
      visits: '1.28k',
      percentage: 11.3,
      color: 'secondary'
    }
  ],
  country: [
    {
      imgSrc: '/images/cards/us.png',
      title: 'USA',
      visits: '87.24k',
      percentage: 38.12,
      color: 'success'
    },
    {
      imgSrc: '/images/cards/brazil.png',
      title: 'Brazil',
      visits: '42.68k',
      percentage: 28.23,
      color: 'primary'
    },
    {
      imgSrc: '/images/cards/india.png',
      title: 'India',
      visits: '38.58k',
      percentage: 26.82,
      color: 'info'
    },
    {
      imgSrc: '/images/cards/australia.png',
      title: 'Australia',
      visits: '34.13k',
      percentage: 23.72,
      color: 'warning'
    },
    {
      imgSrc: '/images/cards/china.png',
      title: 'China',
      visits: '102.21k',
      percentage: 41.11,
      color: 'error'
    },
    {
      imgSrc: '/images/cards/france.png',
      title: 'France',
      visits: '19.28k',
      percentage: 17.29,
      color: 'secondary'
    }
  ]
}

const TableWithTabs = () => {
  // States
  const [activeTab, setActiveTab] = useState<TabType>('browser')

  const handleChange = (event: SyntheticEvent, value: TabType) => {
    setActiveTab(value)
  }

  return (
    <Card>
      <TabContext value={activeTab}>
        <CardContent>
          <CustomTabList onChange={handleChange} variant='scrollable' pill='true'>
            <Tab value='browser' label='Browser' />
            <Tab value='operating-system' label='Operating System' />
            <Tab value='country' label='Country' />
          </CustomTabList>
        </CardContent>
        <Divider />
        <TabPanel value={activeTab}>
          <div className='overflow-x-auto'>
            <table className={tableStyles.table}>
              <thead className='border-none'>
                <tr>
                  <th>No</th>
                  <th>Browser</th>
                  <th>Visits</th>
                  <th>Data in Percentage</th>
                </tr>
              </thead>
              <tbody>
                {data[activeTab].map((item, index) => (
                  <tr key={item.title} className='border-none'>
                    <td>
                      <Typography color='text.primary'>{index + 1}</Typography>
                    </td>
                    <td>
                      <div className='flex items-center gap-3'>
                        <CustomAvatar src={item.imgSrc} alt={item.title} size={24} />
                        <Typography color='text.primary'>{item.title}</Typography>
                      </div>
                    </td>
                    <td>
                      <Typography color='text.primary'>{item.visits}</Typography>
                    </td>
                    <td>
                      <div className='flex items-center gap-4'>
                        <LinearProgress
                          variant='determinate'
                          value={item.percentage}
                          color={item.color}
                          className='is-full bs-2'
                        />
                        <Typography variant='body2' className='font-medium'>{`${item.percentage}%`}</Typography>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabPanel>
      </TabContext>
    </Card>
  )
}

export default TableWithTabs
