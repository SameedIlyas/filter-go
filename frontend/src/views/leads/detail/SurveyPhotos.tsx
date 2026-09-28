'use client'

// React Imports
import { useState } from 'react'

// MUI Imports
import IconButton from '@mui/material/IconButton'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'

// Lib Imports
import { fileUrl } from '@/libs/api/files'

type Props = {
  ids: string[]

  /** Uploads still in flight: shown as placeholder tiles. */
  pending?: number
  onRemove?: (id: string) => void
}

const TILE = 'is-[88px] bs-[88px] rounded border'

/**
 * One thumbnail. Formats the browser cannot draw (HEIC/HEIF outside Safari) fall back to a file tile that still
 * opens or downloads the original.
 */
const Thumb = ({ id, index }: { id: string; index: number }) => {
  const [failed, setFailed] = useState(false)

  return (
    <a href={fileUrl(id)} target='_blank' rel='noreferrer' className='block' title='Open the original'>
      {failed ? (
        <div className={`${TILE} flex flex-col items-center justify-center gap-1 text-textSecondary`}>
          <i className='bx-image text-3xl' />
          <Typography variant='caption' color='text.secondary'>
            Open photo
          </Typography>
        </div>
      ) : (
        <img
          src={fileUrl(id)}
          alt={`Site photo ${index + 1}`}
          loading='lazy'
          onError={() => setFailed(true)}
          className={`${TILE} object-cover`}
        />
      )}
    </a>
  )
}

/** Survey photo thumbnails; each opens the full image in a new tab. */
const SurveyPhotos = ({ ids, pending = 0, onRemove }: Props) => (
  <div className='flex flex-wrap gap-3'>
    {ids.map((id, index) => (
      <div key={id} className='relative'>
        <Thumb id={id} index={index} />
        {onRemove && (
          <IconButton
            size='small'
            aria-label={`Remove photo ${index + 1}`}
            onClick={() => onRemove(id)}
            className='absolute block-start-1 inline-end-1 p-0.5 bg-backgroundPaper hover:bg-backgroundPaper'
          >
            <i className='bx-x text-base' />
          </IconButton>
        )}
      </div>
    ))}
    {Array.from({ length: pending }).map((_, index) => (
      <Skeleton key={`pending-${index}`} variant='rounded' width={88} height={88} />
    ))}
  </div>
)

export default SurveyPhotos
