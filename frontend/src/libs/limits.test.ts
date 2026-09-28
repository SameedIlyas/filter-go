import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BodyTooLargeError, limitStream } from './limitStream'
import { hitRateLimit, resetRateLimits } from './rateLimit'

// `server-only` throws outside a React Server Components build
vi.mock('server-only', () => ({}))

const streamOf = (...chunks: number[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach(size => controller.enqueue(new Uint8Array(size)))
      controller.close()
    }
  })

const drain = async (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader()
  let total = 0

  for (;;) {
    const { done, value } = await reader.read()

    if (done) return total

    total += value.byteLength
  }
}

describe('limitStream', () => {
  it('passes a body within the limit through untouched', async () => {
    expect(await drain(limitStream(streamOf(4, 4, 2), 10))).toBe(10)
  })

  it('fails the stream once the byte count passes the limit, and reports it', async () => {
    const onExceeded = vi.fn()

    await expect(drain(limitStream(streamOf(6, 6), 10, onExceeded))).rejects.toBeInstanceOf(BodyTooLargeError)
    expect(onExceeded).toHaveBeenCalledOnce()
  })
})

describe('hitRateLimit', () => {
  beforeEach(() => resetRateLimits())

  it('allows up to the limit per window, then asks the caller to wait', () => {
    const t0 = 1_000_000

    expect(hitRateLimit('api', 'token-a', 2, 60_000, t0)).toBeNull()
    expect(hitRateLimit('api', 'token-a', 2, 60_000, t0 + 1)).toBeNull()
    expect(hitRateLimit('api', 'token-a', 2, 60_000, t0 + 30_000)).toBe(30)
  })

  it('starts a fresh window once the old one is over', () => {
    const t0 = 1_000_000

    hitRateLimit('api', 'token-a', 1, 60_000, t0)
    expect(hitRateLimit('api', 'token-a', 1, 60_000, t0 + 1)).not.toBeNull()
    expect(hitRateLimit('api', 'token-a', 1, 60_000, t0 + 60_000)).toBeNull()
  })

  it('counts sessions and buckets separately', () => {
    const t0 = 1_000_000

    hitRateLimit('api', 'token-a', 1, 60_000, t0)
    expect(hitRateLimit('api', 'token-b', 1, 60_000, t0)).toBeNull()
    expect(hitRateLimit('upload', 'token-a', 1, 60_000, t0)).toBeNull()
  })
})
