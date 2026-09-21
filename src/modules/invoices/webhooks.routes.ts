import type { FastifyPluginAsync } from 'fastify'

/**
 * Third-party webhooks (Stripe). Public: authenticated by signature, not by session.
 * Registered in app.ts with prefix "/webhooks". Define the full sub-paths inside this plugin.
 */
export const webhookRoutes: FastifyPluginAsync = async () => {
  // implemented by the module owner
}
