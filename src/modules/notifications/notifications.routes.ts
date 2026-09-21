import type { FastifyPluginAsync } from 'fastify'

/**
 * In-app notifications for the signed-in user.
 * Registered in app.ts with prefix "/v1". Define the full sub-paths inside this plugin.
 */
export const notificationRoutes: FastifyPluginAsync = async () => {
  // implemented by the module owner
}
