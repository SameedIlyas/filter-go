'use client'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Alert from '@mui/material/Alert'
import Divider from '@mui/material/Divider'

// Third-party Imports
import { toast } from 'react-toastify'

// Type Imports
import type { MyOffersResponse } from '@/types/scheduleTypes'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useAnswerOffer, useMyOffers } from '@/libs/api/queries/scheduling'

import { schedulingError } from '../logic/assignmentFlow'
import { timeRange } from '../logic/placeShifts'
import { formatShiftDay } from '../shared'

type Offer = MyOffersResponse['offers'][number]

/**
 * Open shifts a supervisor offered me. The first person to accept gets the shift, so an accept can fail because
 * someone else was quicker (the offer is withdrawn) or because it clashes with a shift I already have.
 */
const MyOffers = () => {
  const offers = useMyOffers()
  const answer = useAnswerOffer()

  const onAnswer = async (offer: Offer, choice: 'accept' | 'decline') => {
    try {
      await answer.mutateAsync({ offerId: offer.id, answer: choice })
      toast.success(choice === 'accept' ? `Shift at ${offer.shift.site.name} is yours` : 'Offer declined')
    } catch (error) {
      toast.error(schedulingError(error).message)
    }
  }

  const busy = (offer: Offer) => answer.isPending && answer.variables?.offerId === offer.id

  return (
    <Card>
      <CardHeader title='Shift offers' subheader='First to accept gets the shift' />
      <CardContent className='flex flex-col gap-4'>
        {offers.isPending ? (
          <Skeleton variant='rounded' height={96} />
        ) : offers.isError ? (
          <Alert
            severity='error'
            action={
              <Button color='inherit' size='small' onClick={() => offers.refetch()}>
                Retry
              </Button>
            }
          >
            {errorMessage(offers.error)}
          </Alert>
        ) : offers.data.length === 0 ? (
          <Typography color='text.secondary'>No open offers</Typography>
        ) : (
          offers.data.map((offer, index) => (
            <div key={offer.id} className='flex flex-col gap-2'>
              {index > 0 && <Divider className='mbe-2' />}
              <Typography className='font-medium' color='text.primary'>
                {offer.shift.site.name}
              </Typography>
              <Typography variant='body2'>
                {formatShiftDay(offer.shift.scheduledStart, offer.shift.site.timezone)} · {timeRange(offer.shift)}
              </Typography>
              {offer.shift.notes && (
                <Typography variant='body2' color='text.secondary' className='whitespace-pre-line'>
                  {offer.shift.notes}
                </Typography>
              )}
              <div className='flex gap-2'>
                <Button size='small' variant='contained' disabled={busy(offer)} onClick={() => onAnswer(offer, 'accept')}>
                  Accept
                </Button>
                <Button size='small' variant='tonal' color='secondary' disabled={busy(offer)} onClick={() => onAnswer(offer, 'decline')}>
                  Decline
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

export default MyOffers
