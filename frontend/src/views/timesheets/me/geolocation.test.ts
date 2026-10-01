import { describe, expect, it } from 'vitest'

import { currentPosition, gpsWarning } from './geolocation'
import type { GeolocationLike } from './geolocation'

const succeeding = (latitude: number, longitude: number): GeolocationLike => ({
  getCurrentPosition: success => success({ coords: { latitude, longitude } } as GeolocationPosition)
})

const failing = (code: number): GeolocationLike => ({
  getCurrentPosition: (_success, error) => error?.({ code } as GeolocationPositionError)
})

describe('currentPosition', () => {
  it('resolves the point rounded to six decimals', async () => {
    expect(await currentPosition(succeeding(41.2565123456, -95.9345987654))).toEqual({ ok: true, gps: { lat: 41.256512, lng: -95.934599 } })
  })

  it('maps the browser error codes to a reason', async () => {
    expect(await currentPosition(failing(1))).toEqual({ ok: false, reason: 'denied' })
    expect(await currentPosition(failing(2))).toEqual({ ok: false, reason: 'unavailable' })
    expect(await currentPosition(failing(3))).toEqual({ ok: false, reason: 'timeout' })
    expect(await currentPosition(failing(99))).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('reports a device without geolocation', async () => {
    expect(await currentPosition(undefined)).toEqual({ ok: false, reason: 'unsupported' })
  })
})

describe('gpsWarning', () => {
  it('says why and what the supervisor will see', () => {
    expect(gpsWarning('denied')).toMatch(/^Location access is blocked.*off-site exception/)
  })
})
