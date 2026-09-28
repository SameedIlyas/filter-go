'use client'

// MUI Imports
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'

// Lib Imports
import { useSession } from '@/contexts/sessionContext'

import ServicesCard from './ServicesCard'
import TaxRatesCard from './TaxRatesCard'

/** Services & Tax: the lookup tables contract lines and site surveys pick from. */
const CatalogSettings = () => {
  const session = useSession()
  const isAdmin = session?.role === 'ADMIN'

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Typography variant='h4'>Services & Tax</Typography>
        <Typography color='text.secondary'>The catalog that contract lines and site surveys pick from.</Typography>
      </div>

      {!isAdmin && (
        <Alert severity='info' variant='outlined'>
          Only admins can change the catalog. Ask an admin to add, rename or archive a service.
        </Alert>
      )}

      <ServicesCard canEdit={isAdmin} />

      {isAdmin && <TaxRatesCard />}
    </div>
  )
}

export default CatalogSettings
