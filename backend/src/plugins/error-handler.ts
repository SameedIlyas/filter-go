import type { FastifyError, FastifyInstance } from 'fastify'

import { AppError, Errors } from '../lib/errors.js'
import { fail } from '../lib/response.js'

/** Turns every failure, expected or not, into the standard error envelope. Nothing else ever leaves the API. */
export const registerErrorHandling = (app: FastifyInstance): void => {
  app.setNotFoundHandler((req, reply) => {
    const error = Errors.notFound()

    return reply.status(error.statusCode).send(fail(error.code, `Route ${req.method} ${req.url.split('?')[0]} not found.`, req.id))
  })

  app.setErrorHandler((error: FastifyError | AppError, req, reply) => {
    if (error instanceof AppError) {
      if (error.headers) reply.headers(error.headers)

      return reply.status(error.statusCode).send(fail(error.code, error.message, req.id, error.details))
    }

    const code = (error as FastifyError).code

    if (code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
      return reply
        .status(415)
        .send(fail('UNSUPPORTED_MEDIA_TYPE', 'Send the body as application/json.', req.id))
    }

    if (code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.status(413).send(fail('PAYLOAD_TOO_LARGE', 'Request body is too large.', req.id))
    }

    const statusCode = (error as FastifyError).statusCode

    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send(fail('BAD_REQUEST', 'The request could not be processed.', req.id))
    }

    // Unknown failure: log everything server-side, tell the client nothing but the request id
    req.log.error({ err: error }, 'unhandled error')

    const internal = Errors.internal()

    return reply.status(500).send(fail(internal.code, internal.message, req.id))
  })
}
