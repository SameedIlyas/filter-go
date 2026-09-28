// MUI Imports
import IconButton from '@mui/material/IconButton'
import Skeleton from '@mui/material/Skeleton'

// Lib Imports
import { fileUrl } from '@/libs/api/files'

type Props = {
  ids: string[]

  /** Uploads still in flight: shown as placeholder tiles. */
  pending?: number
  onRemove?: (id: string) => void
}

/** Survey photo thumbnails; each opens the full image in a new tab. */
const SurveyPhotos = ({ ids, pending = 0, onRemove }: Props) => (
  <div className='flex flex-wrap gap-3'>
    {ids.map((id, index) => (
      <div key={id} className='relative'>
        <a href={fileUrl(id)} target='_blank' rel='noreferrer' className='block'>
          <img
            src={fileUrl(id)}
            alt={`Site photo ${index + 1}`}
            loading='lazy'
            className='is-[88px] bs-[88px] rounded border object-cover'
          />
        </a>
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
