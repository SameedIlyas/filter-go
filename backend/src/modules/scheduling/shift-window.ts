import { Errors } from '../../lib/errors.js'
import { MAX_SHIFT_HOURS } from './constants.js'

/** A shift must end after it starts and last at most MAX_SHIFT_HOURS. */
export const validateWindow = (start: Date, end: Date): void => {
  if (end.getTime() <= start.getTime()) {
    throw Errors.invalidField('end', 'invalid_range', 'The shift must end after it starts.')
  }

  if (end.getTime() - start.getTime() > MAX_SHIFT_HOURS * 3_600_000) {
    throw Errors.invalidField('end', 'too_long', `A shift can last at most ${MAX_SHIFT_HOURS} hours.`)
  }
}
