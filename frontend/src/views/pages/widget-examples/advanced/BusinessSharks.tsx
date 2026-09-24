'use client'

// React Imports
import { useState } from 'react'

// MUI Imports
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Chip from '@mui/material/Chip'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'

// Type Import
import type { CustomInputHorizontalData } from '@core/components/custom-inputs/types'

// Component Imports
import CustomInputHorizontal from '@core/components/custom-inputs/Horizontal'
import OptionMenu from '@core/components/option-menu'

const data: CustomInputHorizontalData[] = [
  {
    value: 'branding',
    title: 'Branding',
    meta: <Chip label='+$30' color='primary' variant='tonal' size='small' />
  },
  {
    value: 'marketing',
    isSelected: true,
    title: 'Marketing',
    meta: <Chip label='+$75' color='primary' variant='tonal' size='small' />
  },
  {
    value: 'app-building',
    title: 'App Building',
    meta: <Chip label='+$125' color='success' variant='tonal' size='small' />
  },
  {
    value: 'seo',
    title: 'SEO',
    meta: <Chip label='+$48' color='primary' variant='tonal' size='small' />
  }
]

const BusinessSharks = () => {
  const initialSelected: string[] = data.filter(item => item.isSelected).map(item => item.value)

  // States
  const [selected, setSelected] = useState<string[]>(initialSelected)

  const handleChange = (value: string) => {
    if (selected.includes(value)) {
      const updatedArr = selected.filter(item => item !== value)

      setSelected(updatedArr)
    } else {
      setSelected([...selected, value])
    }
  }

  return (
    <Card>
      <CardHeader title='For Business Sharks' action={<OptionMenu options={['Select All', 'Refresh', 'Share']} />} />
      <CardContent className='flex flex-col gap-4'>
        <Typography>Here, I focus on a range of items and features that we use in life without them.</Typography>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12 }}>
            <Typography color='text.primary'>Basic price is $30</Typography>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Grid container spacing={3}>
              {data.map(item => (
                <CustomInputHorizontal
                  type='checkbox'
                  key={item.value}
                  data={item}
                  selected={selected}
                  handleChange={handleChange}
                  name='card-business-sharks-checkbox'
                  gridProps={{ size: { xs: 12 }, sx: { '& > div': { paddingBlock: 1.5, paddingInlineStart: 2 } } }}
                />
              ))}
            </Grid>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <div className='flex items-center justify-between gap-4'>
              <Typography className='font-medium'>Vat Taxes</Typography>
              <Typography className='font-medium'>$24</Typography>
            </div>
            <div className='flex items-center justify-between gap-4'>
              <Typography className='font-medium'>Total Amount</Typography>
              <Typography variant='h5' color='primary.main'>
                $99
              </Typography>
            </div>
          </Grid>
        </Grid>
        <Button fullWidth variant='contained'>
          Purchase
        </Button>
      </CardContent>
    </Card>
  )
}

export default BusinessSharks
