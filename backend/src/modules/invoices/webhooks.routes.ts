import type { FastifyPluginAsync } from 'fastify'

import { AppError, Errors } from '../../lib/errors.js'
import { ok } from '../../lib/response.js'
import { verifyStripeSignature } from './stripe-signature.js'
import { processStripeEvent, stripeEventSchema } from './stripe-webhook.service.js'

/** Stripe events with many invoice lines exceed the app-wide 16 KiB limit, so this route allows more. */
const WEBHOOK_BODY_LIMIT_BYTES = 512 * 1024

/**
 * Third-party webhooks (Stripe). Public: authenticated by signature, not by session.
 * Registered in app.ts with prefix "/webhooks". Define the full sub-paths inside this plugin.
 */
export const webhookRoutes: FastifyPluginAsync = async app => {
  const ctx = app.ctx

  app.post('/stripe', { bodyLimit: WEBHOOK_BODY_LIMIT_BYTES }, async (req, reply) => {
    const header = req.headers['stripe-signature']
    const verified = verifyStripeSignature({
      header: typeof header === 'string' ? header : undefined,
      rawBody: req.rawBody,
      secret: ctx.config.integrations.stripeWebhookSecret
    })

    // One message for every failure (no secret, missing header, stale, tampered): never say which check failed
    if (!verified) throw new AppError(400, 'WEBHOOK_SIGNATURE_INVALID', 'The webhook signature is invalid.')

    const event = stripeEventSchema.safeParse(req.body)

    if (!event.success) throw Errors.invalidField('body', 'invalid_event', 'The event is not a Stripe event.')

    const result = await processStripeEvent(ctx, event.data)

    return reply.status(200).send(ok({ received: true, result }))
  })
}
