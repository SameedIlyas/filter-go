import type { FastifyPluginAsync } from 'fastify'

/**
 * Organization settings + audit trail query.
 * Registered in app.ts with prefix "/v1". Define the full sub-paths inside this plugin.
 */
export const orgRoutes: FastifyPluginAsync = async () => {
  // implemented by the module owner
}
