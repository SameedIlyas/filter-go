'use client'

// React Imports
import { useState } from 'react'

// MUI Imports
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { Shift } from '@/types/scheduleTypes'
import type { User } from '@/types/userTypes'

// Component Imports
import CustomAutocomplete from '@core/components/mui/Autocomplete'
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { useOfferShift, useStaffOptions } from '@/libs/api/queries/scheduling'

import { toastSchedulingError } from '../notify'

const MAX_OFFERS = 50

/** Offer an OPEN shift to several people at once; the first to accept gets it (after the same overlap check). */
const OfferTab = ({ shift }: { shift: Shift }) => {
  const staff = useStaffOptions()
  const offer = useOfferShift()
  const [picked, setPicked] = useState<User[]>([])

  const send = async () => {
    try {
      const offers = await offer.mutateAsync({ shiftId: shift.id, scheduleId: shift.scheduleId, userIds: picked.map(user => user.id) })

      toast.success(`Offered to ${offers.length} ${offers.length === 1 ? 'person' : 'people'}`)
      setPicked([])
    } catch (error) {
      toastSchedulingError(error)
    }
  }

  return (
    <div className='flex flex-col gap-4'>
      <Typography color='text.secondary'>
        Everyone you pick is notified. The first to accept gets the shift and the other offers are withdrawn.
        {shift.pendingOfferCount ? ` ${shift.pendingOfferCount} offer${shift.pendingOfferCount === 1 ? ' is' : 's are'} already waiting.` : ''}
      </Typography>
      <CustomAutocomplete
        multiple
        options={staff.data ?? []}
        loading={staff.isLoading}
        value={picked}
        onChange={(_event, users) => setPicked(users.slice(0, MAX_OFFERS))}
        getOptionLabel={user => user.name}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        renderInput={params => <CustomTextField {...params} label='Offer to' placeholder='Search staff' />}
      />
      <div>
        <Button variant='contained' disabled={picked.length === 0 || offer.isPending} onClick={() => void send()} startIcon={<i className='bx-send' />}>
          {offer.isPending ? 'Sending…' : `Send ${picked.length || ''} offer${picked.length === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  )
}

export default OfferTab
