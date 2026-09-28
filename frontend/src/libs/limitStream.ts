/** Thrown (as the stream error) when a request body grows past its limit. */
export class BodyTooLargeError extends Error {
  constructor(readonly limit: number) {
    super(`Request body is larger than ${limit} bytes.`)
    this.name = 'BodyTooLargeError'
  }
}

/**
 * Passes a body stream through while counting bytes, and fails it as soon as it exceeds `limit`, so an
 * oversized upload is cut off here instead of being streamed on in full. Content-Length can lie or be absent
 * (chunked uploads), which is why the count is taken on the bytes themselves.
 */
export const limitStream = (
  body: ReadableStream<Uint8Array>,
  limit: number,
  onExceeded?: () => void
): ReadableStream<Uint8Array> => {
  let seen = 0

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength

        if (seen > limit) {
          onExceeded?.()
          controller.error(new BodyTooLargeError(limit))
        } else {
          controller.enqueue(chunk)
        }
      }
    })
  )
}
