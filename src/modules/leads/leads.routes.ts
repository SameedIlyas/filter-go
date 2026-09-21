import type { FastifyPluginAsync } from 'fastify'

/**
 * Leads module (authenticated): pipeline, activities, surveys, convert-to-contract.
 * Registered in app.ts with prefix "/v1". Define the full sub-paths inside this plugin.
 */
export const leadRoutes: FastifyPluginAsync = async () => {
  // implemented by the module owner
}
